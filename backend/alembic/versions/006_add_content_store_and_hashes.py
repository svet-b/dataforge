"""add content_store table and provenance hashes to run_history

Revision ID: 006
Revises: 005
Create Date: 2026-02-20
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "006"
down_revision: str | None = "005"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "content_store",
        sa.Column("sha256", sa.String(), primary_key=True),
        sa.Column("kind", sa.String(), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("byte_size", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.String(), nullable=False),
    )

    with op.batch_alter_table("run_history") as batch_op:
        batch_op.add_column(sa.Column("query_hash", sa.String(), nullable=True))
        batch_op.add_column(sa.Column("source_config_hash", sa.String(), nullable=True))
        batch_op.add_column(sa.Column("parameters_hash", sa.String(), nullable=True))
        batch_op.add_column(sa.Column("source_data_hash", sa.String(), nullable=True))
        batch_op.add_column(sa.Column("result_hash", sa.String(), nullable=True))
        batch_op.create_foreign_key(
            "fk_run_history_query_hash", "content_store", ["query_hash"], ["sha256"]
        )
        batch_op.create_foreign_key(
            "fk_run_history_source_config_hash",
            "content_store",
            ["source_config_hash"],
            ["sha256"],
        )
        batch_op.create_foreign_key(
            "fk_run_history_parameters_hash",
            "content_store",
            ["parameters_hash"],
            ["sha256"],
        )
        batch_op.create_foreign_key(
            "fk_run_history_source_data_hash",
            "content_store",
            ["source_data_hash"],
            ["sha256"],
        )
        batch_op.drop_column("source_hashes")


def downgrade() -> None:
    with op.batch_alter_table("run_history") as batch_op:
        batch_op.drop_constraint("fk_run_history_query_hash", type_="foreignkey")
        batch_op.drop_constraint("fk_run_history_source_config_hash", type_="foreignkey")
        batch_op.drop_constraint("fk_run_history_parameters_hash", type_="foreignkey")
        batch_op.drop_constraint("fk_run_history_source_data_hash", type_="foreignkey")
        batch_op.drop_column("result_hash")
        batch_op.drop_column("source_data_hash")
        batch_op.drop_column("parameters_hash")
        batch_op.drop_column("source_config_hash")
        batch_op.drop_column("query_hash")
        batch_op.add_column(sa.Column("source_hashes", sa.JSON(), nullable=True))

    op.drop_table("content_store")
