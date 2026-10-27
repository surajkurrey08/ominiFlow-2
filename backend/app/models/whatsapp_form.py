import uuid
from sqlalchemy import Column, String, JSON, ForeignKey, Index
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column
from app.models.base import Base, TimestampMixin, UUIDMixin

class WhatsAppForm(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "whatsapp_forms"

    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    status: Mapped[str] = mapped_column(String(50), nullable=False, default="draft", server_default="draft")
    category: Mapped[str | None] = mapped_column(String(255), nullable=True)
    config: Mapped[dict | None] = mapped_column(JSON, nullable=True)

    __table_args__ = (
        Index("ix_whatsapp_forms_tenant_id", "tenant_id"),
    )

class WhatsAppFormSubmission(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "whatsapp_form_submissions"

    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False)
    form_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("whatsapp_forms.id", ondelete="CASCADE"), nullable=False)
    contact_phone: Mapped[str | None] = mapped_column(String(50), nullable=True)
    contact_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    data: Mapped[dict] = mapped_column(JSON, nullable=False)

    __table_args__ = (
        Index("ix_whatsapp_form_submissions_tenant_id", "tenant_id"),
        Index("ix_whatsapp_form_submissions_form_id", "form_id"),
    )
