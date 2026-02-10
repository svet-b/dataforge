"""add schema_info column to run_history

Revision ID: 003
Revises: 002
Create Date: 2026-02-10
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "003"
down_revision: str | None = "002"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    with op.batch_alter_table("run_history") as batch_op:
        batch_op.add_column(sa.Column("schema_info", sa.JSON(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("run_history") as batch_op:
        batch_op.drop_column("schema_info")
