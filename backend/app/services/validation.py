from __future__ import annotations

import re

from sqlalchemy.orm import Session

from app.engine.dag import DAGError, DAGResolver
from app.models.edge import Edge
from app.models.node import Node

TABLE_NAME_PATTERN = re.compile(r"^[a-zA-Z_][a-zA-Z0-9_]*$")


def validate_table_name(
    name: str,
    pipeline_id: str,
    db: Session,
    exclude_node_id: str | None = None,
) -> str | None:
    """Returns error message if invalid, None if valid."""
    if not TABLE_NAME_PATTERN.match(name):
        return f"Invalid table name '{name}'. Must be a valid SQL identifier."
    query = db.query(Node).filter(
        Node.pipeline_id == pipeline_id,
        Node.output_table_name == name,
    )
    if exclude_node_id:
        query = query.filter(Node.id != exclude_node_id)
    if query.first():
        return f"A node with output_table_name '{name}' already exists in this pipeline"
    return None


def validate_no_cycles(
    pipeline_id: str,
    new_source: str,
    new_target: str,
    db: Session,
) -> str | None:
    """Returns error message if adding this edge would create a cycle."""
    nodes_db = db.query(Node).filter(Node.pipeline_id == pipeline_id).all()
    edges_db = db.query(Edge).filter(Edge.pipeline_id == pipeline_id).all()

    nodes = [{"id": n.id, "type": n.type, "name": n.name} for n in nodes_db]
    edges = [
        {"source_node_id": e.source_node_id, "target_node_id": e.target_node_id} for e in edges_db
    ]
    edges.append({"source_node_id": new_source, "target_node_id": new_target})

    resolver = DAGResolver(nodes, edges)
    try:
        resolver.topological_sort()
    except DAGError:
        return "Adding this edge would create a cycle in the DAG"
    return None
