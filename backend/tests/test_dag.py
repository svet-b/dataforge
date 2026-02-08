import pytest

from app.engine.dag import DAGError, DAGResolver


def test_simple_linear_dag() -> None:
    """A -> B -> C -> D should sort to [A, B, C, D]."""
    nodes = [
        {"id": "A", "type": "source_file", "name": "A"},
        {"id": "B", "type": "transform", "name": "B"},
        {"id": "C", "type": "transform", "name": "C"},
        {"id": "D", "type": "output", "name": "D"},
    ]
    edges = [
        {"source_node_id": "A", "target_node_id": "B"},
        {"source_node_id": "B", "target_node_id": "C"},
        {"source_node_id": "C", "target_node_id": "D"},
    ]
    resolver = DAGResolver(nodes, edges)
    order = resolver.topological_sort()
    assert order == ["A", "B", "C", "D"]


def test_branching_dag() -> None:
    """A -> C, B -> C, C -> D should have A and B before C, and C before D."""
    nodes = [
        {"id": "A", "type": "source_file", "name": "A"},
        {"id": "B", "type": "source_file", "name": "B"},
        {"id": "C", "type": "transform", "name": "C"},
        {"id": "D", "type": "output", "name": "D"},
    ]
    edges = [
        {"source_node_id": "A", "target_node_id": "C"},
        {"source_node_id": "B", "target_node_id": "C"},
        {"source_node_id": "C", "target_node_id": "D"},
    ]
    resolver = DAGResolver(nodes, edges)
    order = resolver.topological_sort()
    assert order.index("A") < order.index("C")
    assert order.index("B") < order.index("C")
    assert order.index("C") < order.index("D")


def test_cycle_detection() -> None:
    """A -> B -> C -> A should raise DAGError."""
    nodes = [
        {"id": "A", "type": "source_file", "name": "A"},
        {"id": "B", "type": "transform", "name": "B"},
        {"id": "C", "type": "transform", "name": "C"},
    ]
    edges = [
        {"source_node_id": "A", "target_node_id": "B"},
        {"source_node_id": "B", "target_node_id": "C"},
        {"source_node_id": "C", "target_node_id": "A"},
    ]
    resolver = DAGResolver(nodes, edges)
    with pytest.raises(DAGError, match="cycle"):
        resolver.topological_sort()


def test_get_ancestors() -> None:
    """For A -> B -> C, ancestors of C should be {A, B}."""
    nodes = [
        {"id": "A", "type": "source_file", "name": "A"},
        {"id": "B", "type": "transform", "name": "B"},
        {"id": "C", "type": "output", "name": "C"},
    ]
    edges = [
        {"source_node_id": "A", "target_node_id": "B"},
        {"source_node_id": "B", "target_node_id": "C"},
    ]
    resolver = DAGResolver(nodes, edges)
    assert resolver.get_ancestors("C") == {"A", "B"}
    assert resolver.get_ancestors("B") == {"A"}
    assert resolver.get_ancestors("A") == set()


def test_validate_no_output_node() -> None:
    """DAG with no output node should return error."""
    nodes = [
        {"id": "A", "type": "source_file", "name": "A"},
        {"id": "B", "type": "transform", "name": "B"},
    ]
    edges = [{"source_node_id": "A", "target_node_id": "B"}]
    resolver = DAGResolver(nodes, edges)
    errors = resolver.validate()
    assert any("output node" in e.lower() for e in errors)


def test_validate_multiple_output_nodes() -> None:
    """DAG with two output nodes should return error."""
    nodes = [
        {"id": "A", "type": "source_file", "name": "A"},
        {"id": "B", "type": "output", "name": "B"},
        {"id": "C", "type": "output", "name": "C"},
    ]
    edges = [
        {"source_node_id": "A", "target_node_id": "B"},
        {"source_node_id": "A", "target_node_id": "C"},
    ]
    resolver = DAGResolver(nodes, edges)
    errors = resolver.validate()
    assert any("output node" in e.lower() for e in errors)


def test_validate_valid_dag() -> None:
    """A valid DAG should return no errors."""
    nodes = [
        {"id": "A", "type": "source_file", "name": "A"},
        {"id": "B", "type": "transform", "name": "B"},
        {"id": "C", "type": "output", "name": "C"},
    ]
    edges = [
        {"source_node_id": "A", "target_node_id": "B"},
        {"source_node_id": "B", "target_node_id": "C"},
    ]
    resolver = DAGResolver(nodes, edges)
    assert resolver.validate() == []
