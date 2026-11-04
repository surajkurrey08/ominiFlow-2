"""Scope flow, keyword and fallback configuration to actual channel connections.

Existing records remain unassigned; this migration never guesses their website.
"""
from alembic import op
import sqlalchemy as sa

revision = "fc3d4e5f6071"
down_revision = "fb2c3d4e5f60"
branch_labels = None
depends_on = None


def upgrade():
    for table in ("flows", "keywords", "tenant_routing_configs"):
        op.add_column(table, sa.Column("channel_connection_id", sa.UUID(), nullable=True))
        op.create_foreign_key(f"fk_{table}_channel_connection_id", table, "channel_connections",
                              ["channel_connection_id"], ["id"], ondelete="SET NULL")
        op.create_index(f"ix_{table}_channel_connection_id", table, ["channel_connection_id"])
    op.drop_constraint("uq_keywords_tenant_text_match", "keywords", type_="unique")
    op.create_unique_constraint("uq_keywords_tenant_text_match_channel", "keywords",
                                ["tenant_id", "keyword_text", "match_type", "channel_connection_id"])
    op.drop_index("ix_tenant_routing_configs_tenant_id", table_name="tenant_routing_configs")
    op.create_index("ix_tenant_routing_configs_tenant_id", "tenant_routing_configs", ["tenant_id"])
    op.create_unique_constraint("uq_tenant_routing_configs_tenant_channel", "tenant_routing_configs",
                                ["tenant_id", "channel_connection_id"])


def downgrade():
    # Restoring tenant-wide uniqueness would lose or merge independent rules.
    raise RuntimeError("Channel-scoped records require an explicit data migration before downgrade.")
