"""Website plugin pairing handoffs (additive; existing channels are preserved)."""
from alembic import op
import sqlalchemy as sa

revision = "fb2c3d4e5f60"
down_revision = "fa0b1c2d3e4f"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "web_chat_pairings",
        sa.Column("id", sa.UUID(), primary_key=True),
        sa.Column("tenant_id", sa.UUID(), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("channel_id", sa.UUID(), sa.ForeignKey("channel_connections.id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_id", sa.UUID(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("token_hash", sa.String(64), nullable=False),
        sa.Column("website_origin", sa.String(2048), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("consumed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("cancelled_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_web_chat_pairings_tenant_id", "web_chat_pairings", ["tenant_id"])
    op.create_index("ix_web_chat_pairings_channel_id", "web_chat_pairings", ["channel_id"])


def downgrade():
    op.drop_table("web_chat_pairings")
