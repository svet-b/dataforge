from pathlib import Path

import pytest

from app.config import Settings
from app.engine.executor import PipelineExecutor

FIXTURES_DIR = Path(__file__).parent / "fixtures"


@pytest.fixture()
def executor() -> PipelineExecutor:
    return PipelineExecutor(Settings(database_url="sqlite://"))


@pytest.mark.asyncio
async def test_simple_pipeline_execution(executor: PipelineExecutor) -> None:
    """CSV source -> transform (aggregate) -> output."""
    csv_path = str(FIXTURES_DIR / "sample_meter_data.csv")
    nodes = [
        {
            "id": "1",
            "type": "source_file",
            "name": "Load Data",
            "config": {"file_path": csv_path, "file_type": "csv"},
            "output_table_name": "raw_data",
        },
        {
            "id": "2",
            "type": "transform",
            "name": "Aggregate",
            "config": {
                "sql": "SELECT meter_id, SUM(energy_kwh) AS total FROM raw_data GROUP BY meter_id"
            },
            "output_table_name": "aggregated",
        },
        {
            "id": "3",
            "type": "output",
            "name": "Output",
            "config": {"source_table": "aggregated"},
            "output_table_name": "aggregated",
        },
    ]
    edges = [
        {"source_node_id": "1", "target_node_id": "2"},
        {"source_node_id": "2", "target_node_id": "3"},
    ]

    result = await executor.execute(
        pipeline_id="test-pipe",
        nodes=nodes,
        edges=edges,
        parameters={},
    )

    assert result.status == "success"
    assert result.row_count == 2
    assert result.data is not None

    by_meter = {row["meter_id"]: row["total"] for row in result.data}
    assert abs(by_meter["M-001"] - 36.9) < 0.01
    assert abs(by_meter["M-002"] - 42.4) < 0.01


@pytest.mark.asyncio
async def test_pipeline_with_parameters(executor: PipelineExecutor) -> None:
    """Verify DuckDB variables are accessible in SQL via getvariable()."""
    csv_path = str(FIXTURES_DIR / "sample_meter_data.csv")
    nodes = [
        {
            "id": "1",
            "type": "source_file",
            "name": "Load Data",
            "config": {"file_path": csv_path, "file_type": "csv"},
            "output_table_name": "raw_data",
        },
        {
            "id": "2",
            "type": "transform",
            "name": "Filter",
            "config": {
                "sql": "SELECT * FROM raw_data WHERE meter_id = getvariable('target_meter')"
            },
            "output_table_name": "filtered",
        },
        {
            "id": "3",
            "type": "output",
            "name": "Output",
            "config": {"source_table": "filtered"},
            "output_table_name": "filtered",
        },
    ]
    edges = [
        {"source_node_id": "1", "target_node_id": "2"},
        {"source_node_id": "2", "target_node_id": "3"},
    ]

    result = await executor.execute(
        pipeline_id="test-pipe",
        nodes=nodes,
        edges=edges,
        parameters={"target_meter": "M-001"},
    )

    assert result.status == "success"
    assert result.row_count == 3
    assert result.data is not None
    assert all(row["meter_id"] == "M-001" for row in result.data)


@pytest.mark.asyncio
async def test_transform_error_handling(executor: PipelineExecutor) -> None:
    """Verify that bad SQL produces a clear error with node context."""
    csv_path = str(FIXTURES_DIR / "sample_meter_data.csv")
    nodes = [
        {
            "id": "1",
            "type": "source_file",
            "name": "Load Data",
            "config": {"file_path": csv_path, "file_type": "csv"},
            "output_table_name": "raw_data",
        },
        {
            "id": "2",
            "type": "transform",
            "name": "Bad Transform",
            "config": {"sql": "SELECT nonexistent_column FROM raw_data"},
            "output_table_name": "bad_result",
        },
        {
            "id": "3",
            "type": "output",
            "name": "Output",
            "config": {"source_table": "bad_result"},
            "output_table_name": "bad_result",
        },
    ]
    edges = [
        {"source_node_id": "1", "target_node_id": "2"},
        {"source_node_id": "2", "target_node_id": "3"},
    ]

    result = await executor.execute(
        pipeline_id="test-pipe",
        nodes=nodes,
        edges=edges,
        parameters={},
    )

    assert result.status == "failed"
    assert result.error is not None
    assert result.error["node_name"] == "Bad Transform"
    assert result.error["sql"] == "SELECT nonexistent_column FROM raw_data"
    assert "nonexistent_column" in result.error["message"].lower()


@pytest.mark.asyncio
async def test_preview_partial_execution(executor: PipelineExecutor) -> None:
    """Verify that preview only executes the subgraph up to the target node."""
    csv_path = str(FIXTURES_DIR / "sample_meter_data.csv")
    nodes = [
        {
            "id": "1",
            "type": "source_file",
            "name": "Load Data",
            "config": {"file_path": csv_path, "file_type": "csv"},
            "output_table_name": "raw_data",
        },
        {
            "id": "2",
            "type": "transform",
            "name": "Aggregate",
            "config": {
                "sql": "SELECT meter_id, SUM(energy_kwh) AS total FROM raw_data GROUP BY meter_id"
            },
            "output_table_name": "aggregated",
        },
        {
            "id": "3",
            "type": "transform",
            "name": "Further Transform",
            "config": {"sql": "SELECT * FROM aggregated WHERE total > 40"},
            "output_table_name": "filtered",
        },
        {
            "id": "4",
            "type": "output",
            "name": "Output",
            "config": {"source_table": "filtered"},
            "output_table_name": "filtered",
        },
    ]
    edges = [
        {"source_node_id": "1", "target_node_id": "2"},
        {"source_node_id": "2", "target_node_id": "3"},
        {"source_node_id": "3", "target_node_id": "4"},
    ]

    # Preview at node 2 (the aggregate) - should not execute node 3/4
    result = await executor.execute(
        pipeline_id="test-pipe",
        nodes=nodes,
        edges=edges,
        parameters={},
        target_node_id="2",
    )

    assert result.status == "success"
    assert result.row_count == 2  # Both meters
    # Node 3 and 4 should not appear in timings
    assert "3" not in result.node_timings
    assert "4" not in result.node_timings
