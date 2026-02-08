from pathlib import Path
from typing import Any

import pytest

from app.connectors.api_connector import APIConnector
from app.connectors.file_connector import FileConnector
from app.engine.duckdb_manager import DuckDBSession

FIXTURES_DIR = Path(__file__).parent / "fixtures"


@pytest.mark.asyncio
async def test_file_connector_csv() -> None:
    """Load a CSV file and verify row count and schema."""
    connector = FileConnector()
    config: dict[str, Any] = {
        "file_path": str(FIXTURES_DIR / "sample_meter_data.csv"),
        "file_type": "csv",
    }
    path = await connector.fetch(config, {}, {})
    assert path.exists()

    session = DuckDBSession()
    try:
        session.load_csv("test_data", path)
        assert session.get_row_count("test_data") == 6
        schema = session.get_table_schema("test_data")
        col_names = [c["name"] for c in schema]
        assert "meter_id" in col_names
        assert "energy_kwh" in col_names
    finally:
        session.close()


@pytest.mark.asyncio
async def test_file_connector_missing_file() -> None:
    """FileConnector should raise FileNotFoundError for missing files."""
    connector = FileConnector()
    with pytest.raises(FileNotFoundError):
        await connector.fetch({"file_path": "/nonexistent/file.csv"}, {}, {})


def test_api_connector_interpolation() -> None:
    """Verify template interpolation replaces {{param}} and {{env.VAR}} correctly."""
    connector = APIConnector()
    result = connector._interpolate(
        "https://api.example.com/data?from={{start_date}}&key={{env.API_KEY}}",
        {"start_date": "2026-01-01"},
        {"API_KEY": "secret123"},
    )
    assert result == "https://api.example.com/data?from=2026-01-01&key=secret123"


def test_api_connector_interpolation_unknown_param() -> None:
    """Unknown parameters should raise ValueError."""
    connector = APIConnector()
    with pytest.raises(ValueError, match="Unknown parameter"):
        connector._interpolate("{{missing}}", {}, {})


def test_api_connector_interpolation_unknown_env() -> None:
    """Unknown env vars should raise ValueError."""
    connector = APIConnector()
    with pytest.raises(ValueError, match="Unknown environment variable"):
        connector._interpolate("{{env.MISSING}}", {}, {})


def test_api_connector_response_path() -> None:
    """Verify nested response extraction with dot notation."""
    connector = APIConnector()
    data: dict[str, Any] = {
        "status": "ok",
        "data": {
            "readings": [
                {"id": 1, "value": 10},
                {"id": 2, "value": 20},
            ]
        },
    }
    result = connector._extract_by_path(data, "data.readings")
    assert len(result) == 2
    assert result[0]["id"] == 1
    assert result[1]["value"] == 20
