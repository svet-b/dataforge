"""simplify architecture: remove nodes/edges, add sources and query

Revision ID: 002
Revises: 001
Create Date: 2026-02-08
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "002"
down_revision: str | None = "001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Drop old tables
    op.drop_table("edges")
    op.drop_table("nodes")

    # Add query column to pipelines
    with op.batch_alter_table("pipelines") as batch_op:
        batch_op.add_column(sa.Column("query", sa.Text(), nullable=True))

    # Create sources table
    op.create_table(
        "sources",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("pipeline_id", sa.String(), nullable=False),
        sa.Column("table_name", sa.Text(), nullable=False),
        sa.Column("type", sa.Text(), nullable=False),
        sa.Column("config", sa.JSON(), nullable=False, server_default="{}"),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["pipeline_id"], ["pipelines.id"], ondelete="CASCADE"),
    )
    op.create_index("idx_sources_pipeline", "sources", ["pipeline_id"])


def downgrade() -> None:
    op.drop_table("sources")

    with op.batch_alter_table("pipelines") as batch_op:
        batch_op.drop_column("query")

    # Recreate old tables
    op.create_table(
        "nodes",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("pipeline_id", sa.String(), nullable=False),
        sa.Column("type", sa.Text(), nullable=False),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("position_x", sa.Float(), nullable=False, server_default="0"),
        sa.Column("position_y", sa.Float(), nullable=False, server_default="0"),
        sa.Column("config", sa.JSON(), nullable=False, server_default="{}"),
        sa.Column("output_table_name", sa.Text(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["pipeline_id"], ["pipelines.id"], ondelete="CASCADE"),
    )
    op.create_index("idx_nodes_pipeline", "nodes", ["pipeline_id"])

    op.create_table(
        "edges",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("pipeline_id", sa.String(), nullable=False),
        sa.Column("source_node_id", sa.String(), nullable=False),
        sa.Column("target_node_id", sa.String(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["pipeline_id"], ["pipelines.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["source_node_id"], ["nodes.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["target_node_id"], ["nodes.id"], ondelete="CASCADE"),
    )
    op.create_index("idx_edges_pipeline", "edges", ["pipeline_id"])
