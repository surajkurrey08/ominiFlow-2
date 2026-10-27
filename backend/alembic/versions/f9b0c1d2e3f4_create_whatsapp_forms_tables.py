"""Create whatsapp_forms and whatsapp_form_submissions tables.

Revision ID: f9b0c1d2e3f4
Revises: f8a9b0c1d2e3
Create Date: 2026-10-27 16:50:00.000000

"""
from alembic import op
import sqlalchemy as sa


revision = "f9b0c1d2e3f4"
down_revision = "f8a9b0c1d2e3"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 1. Create whatsapp_forms table
    op.create_table(
        "whatsapp_forms",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("tenant_id", sa.UUID(), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("status", sa.String(length=50), nullable=False, server_default="draft"),
        sa.Column("category", sa.String(length=255), nullable=True),
        sa.Column("config", sa.JSON(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_whatsapp_forms_tenant_id", "whatsapp_forms", ["tenant_id"], unique=False)

    # 2. Create whatsapp_form_submissions table
    op.create_table(
        "whatsapp_form_submissions",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("tenant_id", sa.UUID(), nullable=False),
        sa.Column("form_id", sa.UUID(), nullable=False),
        sa.Column("contact_phone", sa.String(length=50), nullable=True),
        sa.Column("contact_name", sa.String(length=255), nullable=True),
        sa.Column("data", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["form_id"], ["whatsapp_forms.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_whatsapp_form_submissions_tenant_id", "whatsapp_form_submissions", ["tenant_id"], unique=False)
    op.create_index("ix_whatsapp_form_submissions_form_id", "whatsapp_form_submissions", ["form_id"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_whatsapp_form_submissions_form_id", table_name="whatsapp_form_submissions")
    op.drop_index("ix_whatsapp_form_submissions_tenant_id", table_name="whatsapp_form_submissions")
    op.drop_table("whatsapp_form_submissions")

    op.drop_index("ix_whatsapp_forms_tenant_id", table_name="whatsapp_forms")
    op.drop_table("whatsapp_forms")
