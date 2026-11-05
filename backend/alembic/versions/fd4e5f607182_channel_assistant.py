"""Opt-in channel knowledge and natural-language flow assistance."""
from alembic import op
import sqlalchemy as sa

revision = "fd4e5f607182"
down_revision = "fc3d4e5f6071"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("tenant_routing_configs", sa.Column("flow_ai_enabled", sa.Boolean(), server_default=sa.false(), nullable=False))
    for name in ("ai_instructions", "ai_knowledge", "ai_unavailable_reply"):
        op.add_column("tenant_routing_configs", sa.Column(name, sa.Text(), server_default="", nullable=False))


def downgrade():
    for name in ("ai_unavailable_reply", "ai_knowledge", "ai_instructions", "flow_ai_enabled"):
        op.drop_column("tenant_routing_configs", name)
