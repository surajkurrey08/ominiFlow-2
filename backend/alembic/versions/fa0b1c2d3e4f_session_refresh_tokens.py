"""Add rotating, revocable login refresh tokens without changing existing sessions."""
from alembic import op
import sqlalchemy as sa

revision = "fa0b1c2d3e4f"
down_revision = "f9b0c1d2e3f4"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "session_refresh_tokens",
        sa.Column("token_hash", sa.String(64), primary_key=True),
        sa.Column("session_id", sa.UUID(), sa.ForeignKey("user_sessions.id", ondelete="CASCADE"), nullable=False),
        sa.Column("tenant_id", sa.UUID(), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("consumed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("successor_hash", sa.String(64), nullable=True),
    )
    op.create_index("ix_session_refresh_tokens_session_id", "session_refresh_tokens", ["session_id"])


def downgrade():
    op.drop_index("ix_session_refresh_tokens_session_id", table_name="session_refresh_tokens")
    op.drop_table("session_refresh_tokens")
