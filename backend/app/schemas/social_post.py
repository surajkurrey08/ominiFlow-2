from datetime import datetime
from typing import Optional, Any, List
import uuid
from pydantic import BaseModel, Field

from app.models.social_post import SocialPostStatus


class SocialPostCreate(BaseModel):
    caption: str = ""
    media_urls: Optional[List[str]] = Field(default_factory=list)
    platforms: List[str] = Field(default_factory=lambda: ["facebook"])
    format: str = "post"
    tags: Optional[List[str]] = Field(default_factory=list)
    channel_connection_id: Optional[uuid.UUID] = None
    scheduled_at: Optional[datetime] = None
    publish_now: bool = False


class SocialPostUpdate(BaseModel):
    caption: Optional[str] = None
    media_urls: Optional[List[str]] = None
    platforms: Optional[List[str]] = None
    format: Optional[str] = None
    tags: Optional[List[str]] = None
    channel_connection_id: Optional[uuid.UUID] = None
    scheduled_at: Optional[datetime] = None
    status: Optional[SocialPostStatus] = None


class SocialPostResponse(BaseModel):
    id: uuid.UUID
    tenant_id: uuid.UUID
    channel_connection_id: Optional[uuid.UUID] = None
    channel_name: Optional[str] = None
    caption: str
    media_urls: List[str] = Field(default_factory=list)
    platforms: List[str] = Field(default_factory=list)
    format: str
    tags: List[str] = Field(default_factory=list)
    status: SocialPostStatus
    scheduled_at: Optional[datetime] = None
    published_at: Optional[datetime] = None
    external_post_id: Optional[str] = None
    error_message: Optional[str] = None
    analytics: Optional[dict[str, Any]] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class SocialPostListResponse(BaseModel):
    items: List[SocialPostResponse]
    total: int
    page: int
    size: int


class SocialPostOverviewResponse(BaseModel):
    published_this_month: int
    scheduled_count: int
    connected_accounts_count: int
    draft_count: int
    total_successful_posts: int
    recent_posts: List[SocialPostResponse]


class GenerateCaptionRequest(BaseModel):
    instruction: Optional[str] = ""
    topic: Optional[str] = ""
    tone: Optional[str] = "balanced" # concise, warm, cta, hashtags
