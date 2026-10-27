"""Add social_posts table for social media scheduling and publishing.

Revision ID: f8a9b0c1d2e3
Revises: f7a8b9c0d1e2
Create Date: 2026-10-24 18:20:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "f8a9b0c1d2e3"
down_revision = "f7a8b9c0d1e2"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 1. Create social_post_status enum
    social_post_status_enum = postgresql.ENUM(
        "draft", "scheduled", "publishing", "published", "failed",
        name="social_post_status",
        create_type=False,
    )
    social_post_status_enum.create(op.get_bind(), checkfirst=True)

    # 2. Create social_posts table
    op.create_table(
        "social_posts",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "tenant_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("tenants.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column(
            "channel_connection_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("channel_connections.id", ondelete="SET NULL"),
            nullable=True,
            index=True,
        ),
        sa.Column("caption", sa.Text(), nullable=False, server_default=""),
        sa.Column("media_urls", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("platforms", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("format", sa.String(length=50), nullable=False, server_default="post"),
        sa.Column("tags", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column(
            "status",
            sa.Enum("draft", "scheduled", "publishing", "published", "failed", name="social_post_status", create_type=False),
            nullable=False,
            server_default="draft",
        ),
        sa.Column("scheduled_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("published_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("external_post_id", sa.String(length=255), nullable=True),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("analytics", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    op.create_index("ix_social_posts_status", "social_posts", ["status"])
    op.create_index("ix_social_posts_scheduled_at", "social_posts", ["scheduled_at"])


def downgrade() -> None:
    op.drop_index("ix_social_posts_scheduled_at", table_name="social_posts")
    op.drop_index("ix_social_posts_status", table_name="social_posts")
    op.drop_table("social_posts")
    op.execute("DROP TYPE IF EXISTS social_post_status")
