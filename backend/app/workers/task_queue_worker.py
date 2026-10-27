"""Production Redis Background Task Queue Worker.

Handles high-throughput background processing for:
- WhatsApp inbound & outbound message events
- Scheduled social media posts publishing
- Broadcast campaigns execution batches
- Inbound media attachments downloading
- Knowledge base vector indexing
- Stuck chat automation monitoring

Usage:
    python -m app.workers.task_queue_worker --loop
    python -m app.workers.task_queue_worker --loop --interval 2.0
"""
import argparse
import logging
import os
import signal
import socket
import sys
import time
import uuid
from threading import Event

from app.core.database import SessionLocal
from app.core.redis_queue import task_queue
from app.services.whatsapp_event_processor import process_pending_events
from app.workers import flow_delivery, campaigns, whatsapp_media, knowledge_base, automations
from app.services import social_post_service

logger = logging.getLogger("app.workers.task_queue_worker")


def worker_identity() -> str:
    return f"{socket.gethostname()}:{os.getpid()}:{uuid.uuid4().hex[:8]}"


def run_batch_cycle(batch_size: int = 50) -> dict:
    """Execute one complete batch cycle across all background systems."""
    results = {}
    
    # 1. Check for explicit enqueued Redis jobs
    job = task_queue.dequeue(timeout=1)
    if job:
        task_name = job.get("task")
        payload = job.get("payload", {})
        logger.info("Processing enqueued job %s (task: %s)", job.get("id"), task_name)
        results["queued_job"] = task_name

    # 2. Process WhatsApp Events
    try:
        with SessionLocal() as db:
            events_count = process_pending_events(db, limit=batch_size)
            if events_count:
                results["whatsapp_events"] = events_count
    except Exception as e:
        logger.error("Error processing whatsapp events: %s", e)

    # 3. Flow delivery step execution
    try:
        flow_res = flow_delivery.run_once(batch_size=batch_size)
        if flow_res and any(flow_res.values()):
            results["flow_delivery"] = flow_res
    except Exception as e:
        logger.error("Error running flow delivery: %s", e)

    # 4. Campaign broadcasts execution
    try:
        camp_res = campaigns.run_once(batch_size=batch_size)
        if camp_res and any(camp_res.values()):
            results["campaigns"] = camp_res
    except Exception as e:
        logger.error("Error running campaigns batch: %s", e)

    # 5. Media attachments downloads
    try:
        media_res = whatsapp_media.run_once(batch_size=20)
        if media_res and any(media_res.values()):
            results["media"] = media_res
    except Exception as e:
        logger.error("Error downloading whatsapp media: %s", e)

    # 6. Knowledge Base embeddings
    try:
        kb_res = knowledge_base.run_once(batch_size=10)
        if kb_res and any(kb_res.values()):
            results["knowledge_base"] = kb_res
    except Exception as e:
        logger.error("Error processing knowledge base documents: %s", e)

    # 7. Scheduled Social Media Posts
    try:
        with SessionLocal() as db:
            posts_count = social_post_service.process_scheduled_posts(db, limit=20)
            if posts_count:
                results["scheduled_posts"] = posts_count
    except Exception as e:
        logger.error("Error processing scheduled social posts: %s", e)

    # 8. Stuck chat automations
    try:
        auto_res = automations.run_once(batch_size=50)
        if auto_res and any(auto_res.values()):
            results["automations"] = auto_res
    except Exception as e:
        logger.error("Error running automations scan: %s", e)

    return results


def main() -> None:
    parser = argparse.ArgumentParser(description="Omniflow Unified Production Task Queue Worker.")
    parser.add_argument("--loop", action="store_true", help="Poll continuously.")
    parser.add_argument("--interval", type=float, default=2.0, help="Seconds between poll cycles.")
    parser.add_argument("--batch-size", type=int, default=50, help="Batch size for tasks.")
    parser.add_argument("--worker-id", default=None)
    args = parser.parse_args()

    logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
    worker_id = args.worker_id or worker_identity()
    stopping = Event()

    def request_shutdown(signum, _frame):
        stopping.set()
        logger.info("Worker shutdown requested for %s", worker_id)

    signal.signal(signal.SIGINT, request_shutdown)
    signal.signal(signal.SIGTERM, request_shutdown)

    stats = task_queue.get_stats()
    logger.info("Starting Omniflow Task Queue Worker [%s] (Queue Backend: %s)", worker_id, stats.get("backend"))

    try:
        while not stopping.is_set():
            try:
                cycle_results = run_batch_cycle(batch_size=args.batch_size)
                if cycle_results:
                    logger.info("Worker cycle processed: %s", cycle_results)
            except Exception as exc:
                logger.exception("Unexpected error in worker loop: %s", exc)

            if not args.loop:
                break

            if not stopping.is_set():
                stopping.wait(args.interval)
    finally:
        logger.info("Omniflow Task Queue Worker [%s] stopped.", worker_id)


if __name__ == "__main__":
    main()
