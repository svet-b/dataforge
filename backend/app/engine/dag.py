from __future__ import annotations

from collections import defaultdict, deque
from typing import Any


class DAGError(Exception):
    """Raised when the DAG is invalid (cycles, disconnected output, etc.)."""


class DAGResolver:
    def __init__(self, nodes: list[dict[str, Any]], edges: list[dict[str, Any]]) -> None:
        self.nodes = nodes
        self.edges = edges
        self.node_ids = {n["id"] for n in nodes}
        self.node_map = {n["id"]: n for n in nodes}

        # Build adjacency lists
        self.children: dict[str, set[str]] = defaultdict(set)
        self.parents: dict[str, set[str]] = defaultdict(set)
        for edge in edges:
            src = edge["source_node_id"]
            tgt = edge["target_node_id"]
            self.children[src].add(tgt)
            self.parents[tgt].add(src)

    def topological_sort(self) -> list[str]:
        """Return node IDs in execution order using Kahn's algorithm.
        Raises DAGError if the graph contains cycles."""
        in_degree: dict[str, int] = {nid: 0 for nid in self.node_ids}
        for edge in self.edges:
            in_degree[edge["target_node_id"]] += 1

        queue = deque(nid for nid, deg in in_degree.items() if deg == 0)
        result: list[str] = []

        while queue:
            node_id = queue.popleft()
            result.append(node_id)
            for child in self.children[node_id]:
                in_degree[child] -= 1
                if in_degree[child] == 0:
                    queue.append(child)

        if len(result) != len(self.node_ids):
            raise DAGError("Pipeline contains a cycle")

        return result

    def get_ancestors(self, node_id: str) -> set[str]:
        """Return all ancestor node IDs for a given node."""
        ancestors: set[str] = set()
        queue = deque(self.parents[node_id])
        while queue:
            parent = queue.popleft()
            if parent not in ancestors:
                ancestors.add(parent)
                queue.extend(self.parents[parent])
        return ancestors

    def validate(self) -> list[str]:
        """Validate the DAG structure. Return a list of error messages (empty if valid)."""
        errors: list[str] = []

        # Check for cycles
        try:
            self.topological_sort()
        except DAGError:
            errors.append("Pipeline contains a cycle")

        # Check output nodes
        output_nodes = [n for n in self.nodes if n["type"] == "output"]
        if len(output_nodes) == 0:
            errors.append("Pipeline must have exactly one output node")
        elif len(output_nodes) > 1:
            errors.append("Pipeline must have exactly one output node")

        # Check that output node has at least one incoming edge
        for node in output_nodes:
            if not self.parents[node["id"]]:
                errors.append(f"Output node '{node['name']}' has no incoming edges")

        # Check that all nodes are reachable from at least one source
        source_ids = {n["id"] for n in self.nodes if n["type"] in ("source_api", "source_file")}
        reachable: set[str] = set()
        queue = deque(source_ids)
        while queue:
            nid = queue.popleft()
            if nid not in reachable:
                reachable.add(nid)
                queue.extend(self.children[nid])

        unreachable = self.node_ids - reachable
        for nid in unreachable:
            node = self.node_map[nid]
            errors.append(f"Node '{node['name']}' is not reachable from any source")

        return errors
