import uuid

from sqlalchemy import Boolean, ForeignKey, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin, UUIDMixin


class TenantRoutingConfig(Base, UUIDMixin, TimestampMixin):
    """
    Per-channel routing config: how inbound messages that match no keyword
    rule are handled. Legacy channel_connection_id=None rows remain readable
    for migration but are not used as runtime defaults for other channels.
    """

    __tablename__ = "tenant_routing_configs"

    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("tenants.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    channel_connection_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("channel_connections.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )

    # "none" = do nothing; "flow" = run fallback_flow_id; "ai" = AI reply.
    fallback_action: Mapped[str] = mapped_column(
        String(20),
        default="none",
        server_default="none",
        nullable=False,
    )

    fallback_flow_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("flows.id", ondelete="SET NULL"),
        nullable=True,
    )

    flow_ai_enabled: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false", nullable=False)
    ai_instructions: Mapped[str] = mapped_column(Text, default="", server_default="", nullable=False)
    ai_knowledge: Mapped[str] = mapped_column(Text, default="", server_default="", nullable=False)
    ai_unavailable_reply: Mapped[str] = mapped_column(Text, default="", server_default="", nullable=False)

    __table_args__ = (
        UniqueConstraint(
            "tenant_id", "channel_connection_id",
            name="uq_tenant_routing_configs_tenant_channel",
        ),
    )
