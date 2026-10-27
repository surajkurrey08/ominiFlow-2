from enum import StrEnum
import uuid
from datetime import datetime
from typing import Optional, Any, List

from sqlalchemy import DateTime, Enum, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UUIDMixin


class SocialPostStatus(StrEnum):
    DRAFT = "draft"
    SCHEDULED = "scheduled"
    PUBLISHING = "publishing"
    PUBLISHED = "published"
    FAILED = "failed"


class SocialPlatform(StrEnum):
    FACEBOOK = "facebook"
    INSTAGRAM = "instagram"
    WHATSAPP = "whatsapp"


class SocialPost(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "social_posts"

    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("tenants.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    channel_connection_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("channel_connections.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    caption: Mapped[str] = mapped_column(Text, nullable=False, default="")
    media_urls: Mapped[Optional[list[str]]] = mapped_column(JSONB, nullable=True, default=list)
    platforms: Mapped[list[str]] = mapped_column(JSONB, nullable=False, default=list)
    format: Mapped[str] = mapped_column(String(50), nullable=False, default="post")
    tags: Mapped[Optional[list[str]]] = mapped_column(JSONB, nullable=True, default=list)

    status: Mapped[SocialPostStatus] = mapped_column(
        Enum(SocialPostStatus, name="social_post_status", values_callable=lambda x: [e.value for e in x]),
        default=SocialPostStatus.DRAFT,
        nullable=False,
        index=True,
    )

    scheduled_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True, index=True)
    published_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    external_post_id: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    error_message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    analytics: Mapped[Optional[dict[str, Any]]] = mapped_column(JSONB, nullable=True, default=dict)

    # Relationships
    channel_connection = relationship("ChannelConnection", foreign_keys=[channel_connection_id], lazy="joined")
