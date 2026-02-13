from pathlib import Path

import pytest

from app.config import Settings
from app.engine.duckdb_manager import DuckDBSession
from app.engine.executor import PipelineExecutor

FIXTURES_DIR = Path(__file__).parent / "fixtures"


@pytest.fixture()
def executor() -> PipelineExecutor:
    return PipelineExecutor(Settings(database_url="sqlite://"))


@pytest.mark.asyncio
async def test_simple_pipeline_execution(executor: PipelineExecutor) -> None:
    """CSV source -> aggregate query."""
    csv_path = str(FIXTURES_DIR / "sample_meter_data.csv")
    sources = [
        {
            "id": "1",
            "type": "file",
            "table_name": "raw_data",
            "config": {"file_path": csv_path, "file_type": "csv"},
        },
    ]
    query = "SELECT meter_id, SUM(energy_kwh) AS total FROM raw_data GROUP BY meter_id"

    result = await executor.execute(
        pipeline_id="test-pipe",
        sources=sources,
        query=query,
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
    sources = [
        {
            "id": "1",
            "type": "file",
            "table_name": "raw_data",
            "config": {"file_path": csv_path, "file_type": "csv"},
        },
    ]
    query = "SELECT * FROM raw_data WHERE meter_id = getvariable('target_meter')"

    result = await executor.execute(
        pipeline_id="test-pipe",
        sources=sources,
        query=query,
        parameters={"target_meter": "M-001"},
    )

    assert result.status == "success"
    assert result.row_count == 3
    assert result.data is not None
    assert all(row["meter_id"] == "M-001" for row in result.data)


@pytest.mark.asyncio
async def test_transform_error_handling(executor: PipelineExecutor) -> None:
    """Verify that bad SQL produces a clear error."""
    csv_path = str(FIXTURES_DIR / "sample_meter_data.csv")
    sources = [
        {
            "id": "1",
            "type": "file",
            "table_name": "raw_data",
            "config": {"file_path": csv_path, "file_type": "csv"},
        },
    ]
    query = "SELECT nonexistent_column FROM raw_data"

    result = await executor.execute(
        pipeline_id="test-pipe",
        sources=sources,
        query=query,
        parameters={},
    )

    assert result.status == "failed"
    assert result.error is not None
    assert "nonexistent_column" in result.error["message"].lower()


@pytest.mark.asyncio
async def test_multiple_sources_with_join(executor: PipelineExecutor) -> None:
    """Verify that multiple sources can be joined in a single query."""
    csv_path = str(FIXTURES_DIR / "sample_meter_data.csv")
    sources = [
        {
            "id": "1",
            "type": "file",
            "table_name": "readings",
            "config": {"file_path": csv_path, "file_type": "csv"},
        },
        {
            "id": "2",
            "type": "file",
            "table_name": "readings_copy",
            "config": {"file_path": csv_path, "file_type": "csv"},
        },
    ]
    query = (
        "SELECT r.meter_id, r.energy_kwh, c.energy_kwh as copy_kwh "
        "FROM readings r "
        "JOIN readings_copy c ON r.meter_id = c.meter_id "
        "AND r.reading_timestamp = c.reading_timestamp"
    )

    result = await executor.execute(
        pipeline_id="test-pipe",
        sources=sources,
        query=query,
        parameters={},
    )

    assert result.status == "success"
    assert result.row_count == 6
    assert result.data is not None


@pytest.mark.asyncio
async def test_preview_with_limit(executor: PipelineExecutor) -> None:
    """Verify that preview_limit constrains returned rows."""
    csv_path = str(FIXTURES_DIR / "sample_meter_data.csv")
    sources = [
        {
            "id": "1",
            "type": "file",
            "table_name": "raw_data",
            "config": {"file_path": csv_path, "file_type": "csv"},
        },
    ]
    query = "SELECT * FROM raw_data"

    result = await executor.execute(
        pipeline_id="test-pipe",
        sources=sources,
        query=query,
        parameters={},
        preview_limit=2,
    )

    assert result.status == "success"
    assert result.row_count == 6  # total count
    assert result.data is not None
    assert len(result.data) == 2  # but only 2 returned
    assert len(result.schema_info) > 0


@pytest.mark.asyncio
async def test_cte_query(executor: PipelineExecutor) -> None:
    """Verify that CTEs work for multi-step transformations."""
    csv_path = str(FIXTURES_DIR / "sample_meter_data.csv")
    sources = [
        {
            "id": "1",
            "type": "file",
            "table_name": "raw_data",
            "config": {"file_path": csv_path, "file_type": "csv"},
        },
    ]
    query = """
        WITH totals AS (
            SELECT meter_id, SUM(energy_kwh) AS total
            FROM raw_data
            GROUP BY meter_id
        )
        SELECT meter_id, total
        FROM totals
        WHERE total > 40
    """

    result = await executor.execute(
        pipeline_id="test-pipe",
        sources=sources,
        query=query,
        parameters={},
    )

    assert result.status == "success"
    assert result.row_count == 1
    assert result.data is not None
    assert result.data[0]["meter_id"] == "M-002"


# ── DuckDBSession.validate_query ─────────────────────────────


def test_validate_query_valid_sql() -> None:
    """Valid SQL should return None (no error)."""
    session = DuckDBSession()
    try:
        csv_path = str(FIXTURES_DIR / "sample_meter_data.csv")
        session.load_csv("raw_data", Path(csv_path))
        error = session.validate_query("SELECT meter_id, energy_kwh FROM raw_data")
        assert error is None
    finally:
        session.close()


def test_validate_query_invalid_column() -> None:
    """Referencing a non-existent column should return an error string."""
    session = DuckDBSession()
    try:
        csv_path = str(FIXTURES_DIR / "sample_meter_data.csv")
        session.load_csv("raw_data", Path(csv_path))
        error = session.validate_query("SELECT nonexistent FROM raw_data")
        assert error is not None
        assert "nonexistent" in error.lower()
    finally:
        session.close()


def test_validate_query_invalid_table() -> None:
    """Referencing a non-existent table should return an error string."""
    session = DuckDBSession()
    try:
        error = session.validate_query("SELECT * FROM does_not_exist")
        assert error is not None
        assert "does_not_exist" in error.lower()
    finally:
        session.close()


def test_validate_query_syntax_error() -> None:
    """Malformed SQL should return an error string."""
    session = DuckDBSession()
    try:
        error = session.validate_query("SELECTT * FROMM bad_sql")
        assert error is not None
    finally:
        session.close()
