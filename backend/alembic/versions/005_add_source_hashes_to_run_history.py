"""add source_hashes column to run_history

Revision ID: 005
Revises: 004
Create Date: 2026-02-19
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "005"
down_revision: str | None = "004"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    with op.batch_alter_table("run_history") as batch_op:
        batch_op.add_column(sa.Column("source_hashes", sa.JSON(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("run_history") as batch_op:
        batch_op.drop_column("source_hashes")
