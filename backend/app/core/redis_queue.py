"""Production-grade Redis Task Queue with delayed job support and in-memory fallback.

Provides:
- Reliable task push / pop with Redis lists and sorted sets (ZSET for delayed tasks).
- Graceful in-memory fallback when Redis is unavailable so local dev never crashes.
- High-scale queue management for campaigns, webhooks, media, and scheduled posts.
"""
import json
import logging
import time
import uuid
from collections import deque
from datetime import datetime, timezone
from typing import Any, Dict, Optional

import redis

from app.core.config import settings

logger = logging.getLogger(__name__)


def _utcnow_timestamp() -> float:
    return datetime.now(timezone.utc).timestamp()


class RedisTaskQueue:
    def __init__(self, redis_url: Optional[str] = None):
        self.redis_url = redis_url or settings.redis_url
        self._client: Optional[redis.Redis] = None
        self._in_memory_jobs: Dict[str, deque] = {}
        self._in_memory_delayed: Dict[str, list] = {}
        self._use_fallback = False

    def get_client(self) -> Optional[redis.Redis]:
        if self._use_fallback:
            return None
        if self._client is None:
            try:
                self._client = redis.from_url(
                    self.redis_url,
                    socket_connect_timeout=3,
                    socket_timeout=3,
                    decode_responses=True,
                )
                self._client.ping()
            except Exception as e:
                logger.warning("Redis not available (%s); activating in-memory task fallback.", e)
                self._use_fallback = True
                self._client = None
        return self._client

    def enqueue(
        self,
        task_name: str,
        payload: Optional[Dict[str, Any]] = None,
        queue_name: str = "omniflow:default",
        delay_seconds: int = 0,
    ) -> str:
        job_id = f"job_{uuid.uuid4().hex}"
        record = {
            "id": job_id,
            "task": task_name,
            "payload": payload or {},
            "enqueued_at": _utcnow_timestamp(),
            "scheduled_at": _utcnow_timestamp() + max(0, delay_seconds),
        }
        serialized = json.dumps(record)

        client = self.get_client()
        if client:
            try:
                if delay_seconds > 0:
                    client.zadd(f"{queue_name}:delayed", {serialized: record["scheduled_at"]})
                else:
                    client.rpush(f"{queue_name}:jobs", serialized)
                return job_id
            except Exception as e:
                logger.warning("Redis enqueue error (%s), switching to in-memory fallback", e)
                self._use_fallback = True

        # Fallback to in-memory
        if delay_seconds > 0:
            if queue_name not in self._in_memory_delayed:
                self._in_memory_delayed[queue_name] = []
            self._in_memory_delayed[queue_name].append((record["scheduled_at"], record))
        else:
            if queue_name not in self._in_memory_jobs:
                self._in_memory_jobs[queue_name] = deque()
            self._in_memory_jobs[queue_name].append(record)

        return job_id

    def dequeue(self, queue_name: str = "omniflow:default", timeout: int = 2) -> Optional[Dict[str, Any]]:
        client = self.get_client()
        now = _utcnow_timestamp()

        if client:
            try:
                # 1. Promote due delayed tasks into the main queue
                pipe = client.pipeline()
                pipe.zrangebyscore(f"{queue_name}:delayed", 0, now)
                pipe.zremrangebyscore(f"{queue_name}:delayed", 0, now)
                results = pipe.execute()
                due_jobs = results[0] if results else []

                if due_jobs:
                    for job_str in due_jobs:
                        client.rpush(f"{queue_name}:jobs", job_str)

                # 2. Pop next job from main queue
                item = client.blpop(f"{queue_name}:jobs", timeout=timeout)
                if item:
                    _, job_str = item
                    return json.loads(job_str)
                return None
            except Exception as e:
                logger.warning("Redis dequeue error (%s), switching to in-memory fallback", e)
                self._use_fallback = True

        # In-memory dequeue fallback
        if queue_name in self._in_memory_delayed:
            due = [item for item in self._in_memory_delayed[queue_name] if item[0] <= now]
            self._in_memory_delayed[queue_name] = [item for item in self._in_memory_delayed[queue_name] if item[0] > now]
            if queue_name not in self._in_memory_jobs:
                self._in_memory_jobs[queue_name] = deque()
            for _, record in due:
                self._in_memory_jobs[queue_name].append(record)

        if queue_name in self._in_memory_jobs and self._in_memory_jobs[queue_name]:
            return self._in_memory_jobs[queue_name].popleft()

        return None

    def get_stats(self, queue_name: str = "omniflow:default") -> Dict[str, Any]:
        client = self.get_client()
        if client:
            try:
                jobs_count = client.llen(f"{queue_name}:jobs")
                delayed_count = client.zcard(f"{queue_name}:delayed")
                return {
                    "backend": "redis",
                    "status": "connected",
                    "queue_name": queue_name,
                    "pending_jobs": jobs_count,
                    "delayed_jobs": delayed_count,
                }
            except Exception:
                pass

        mem_pending = len(self._in_memory_jobs.get(queue_name, []))
        mem_delayed = len(self._in_memory_delayed.get(queue_name, []))
        return {
            "backend": "in-memory",
            "status": "fallback",
            "queue_name": queue_name,
            "pending_jobs": mem_pending,
            "delayed_jobs": mem_delayed,
        }


# Global singleton queue instance
task_queue = RedisTaskQueue()
