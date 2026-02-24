from pathlib import Path
from typing import Any

import pytest

from app.connectors.ammp_connector import AMMPConnector
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


# ── AMMP connector tests ──


def test_ammp_extract_metrics_historic_energy() -> None:
    """Extract metrics from historic-energy shape (metrics at top level)."""
    data: dict[str, Any] = {
        "asset_id": "abc123",
        "asset_name": "Test",
        "warnings": [],
        "pv_energy": {
            "interval": "1M",
            "data": [
                {"date": "2025-01-01", "value": 100.0},
                {"date": "2025-02-01", "value": 200.0},
            ],
            "unit": "Wh",
        },
        "consumption_energy": {
            "interval": "1M",
            "data": [
                {"date": "2025-01-01", "value": 50.0},
                {"date": "2025-02-01", "value": 60.0},
            ],
            "unit": "Wh",
        },
    }
    metrics = AMMPConnector._extract_metrics(data)
    assert "pv_energy" in metrics
    assert "consumption_energy" in metrics
    assert "asset_id" not in metrics
    assert "warnings" not in metrics


def test_ammp_extract_metrics_financial_impact() -> None:
    """Extract metrics from financial-impact shape (nested under 'data' key)."""
    data: dict[str, Any] = {
        "asset_id": "abc123",
        "asset_name": "Test",
        "warnings": [],
        "grid_tariff_name": "Test Tariff",
        "data": {
            "pv_energy": {
                "interval": "1h",
                "data": [
                    {"date": "2025-01-01T00:00:00", "value": 10.0},
                ],
            },
            "energy_from_grid": {
                "interval": "1h",
                "data": [
                    {"date": "2025-01-01T00:00:00", "value": 5.0},
                ],
            },
        },
    }
    metrics = AMMPConnector._extract_metrics(data)
    assert "pv_energy" in metrics
    assert "energy_from_grid" in metrics
    assert len(metrics) == 2


def test_ammp_flatten_to_wide() -> None:
    """Flatten multiple metrics into wide-format rows keyed by date."""
    metrics: dict[str, Any] = {
        "pv_energy": {
            "data": [
                {"date": "2025-01-01", "value": 100.0},
                {"date": "2025-02-01", "value": 200.0},
            ],
        },
        "consumption_energy": {
            "data": [
                {"date": "2025-01-01", "value": 50.0},
                {"date": "2025-02-01", "value": 60.0},
                {"date": "2025-03-01", "value": 70.0},
            ],
        },
    }
    rows = AMMPConnector._flatten_to_wide(metrics)
    assert len(rows) == 3
    assert rows[0]["date"] == "2025-01-01"
    assert rows[0]["pv_energy"] == 100.0
    assert rows[0]["consumption_energy"] == 50.0
    assert rows[1]["date"] == "2025-02-01"
    assert rows[1]["pv_energy"] == 200.0
    # Third row only has consumption_energy
    assert rows[2]["date"] == "2025-03-01"
    assert rows[2]["consumption_energy"] == 70.0
    assert "pv_energy" not in rows[2]


def test_ammp_flatten_preserves_nulls() -> None:
    """Null values in metric data should be preserved."""
    metrics: dict[str, Any] = {
        "pv_energy": {
            "data": [
                {"date": "2025-01-01", "value": None},
                {"date": "2025-02-01", "value": 100.0},
            ],
        },
    }
    rows = AMMPConnector._flatten_to_wide(metrics)
    assert len(rows) == 2
    assert rows[0]["pv_energy"] is None
    assert rows[1]["pv_energy"] == 100.0


def test_ammp_flatten_sorted_by_date() -> None:
    """Rows should be sorted by date."""
    metrics: dict[str, Any] = {
        "metric_b": {
            "data": [{"date": "2025-03-01", "value": 3.0}],
        },
        "metric_a": {
            "data": [{"date": "2025-01-01", "value": 1.0}],
        },
    }
    rows = AMMPConnector._flatten_to_wide(metrics)
    dates = [r["date"] for r in rows]
    assert dates == ["2025-01-01", "2025-03-01"]


@pytest.mark.asyncio
async def test_ammp_token_caching() -> None:
    """Token should be cached based on expiry time."""
    connector = AMMPConnector()
    # Simulate a cached token
    connector._token = "cached-jwt"
    connector._token_expires_at = float("inf")

    # Should return cached token without making HTTP request
    token = await connector._get_token({"AMMP_DATA_API_KEY": "test-key"})
    assert token == "cached-jwt"


@pytest.mark.asyncio
async def test_ammp_token_missing_key() -> None:
    """Should raise ValueError when API key is not configured."""
    connector = AMMPConnector()

    with pytest.raises(ValueError, match="AMMP_DATA_API_KEY is not configured"):
        await connector._get_token({})


def test_ammp_build_url_historic_energy() -> None:
    """Build URL for historic-energy endpoint."""
    connector = AMMPConnector()
    url = connector._build_url(
        {"endpoint": "historic-energy", "asset_id": "abc-123"},
        {},
    )
    assert url == "https://data-api.ammp.io/v1/assets/abc-123/historic-energy"


def test_ammp_build_url_financial_impact() -> None:
    """Build URL for financial-impact endpoint."""
    connector = AMMPConnector()
    url = connector._build_url(
        {"endpoint": "financial-impact", "asset_id": "abc-123"},
        {},
    )
    assert url == "https://data-api.ammp.io/v1/assets/abc-123/commercial-kpis/financial-impact"


def test_ammp_build_url_from_parameter() -> None:
    """Asset ID should fall back to workflow parameters."""
    connector = AMMPConnector()
    url = connector._build_url(
        {"endpoint": "historic-energy"},
        {"asset_id": "param-id"},
    )
    assert url == "https://data-api.ammp.io/v1/assets/param-id/historic-energy"


def test_ammp_build_url_missing_asset_id() -> None:
    """Should raise ValueError when asset_id is missing."""
    connector = AMMPConnector()
    with pytest.raises(ValueError, match="asset_id is required"):
        connector._build_url({"endpoint": "historic-energy"}, {})


def test_ammp_build_params() -> None:
    """Build query parameters from config and parameters."""
    connector = AMMPConnector()
    params = connector._build_params(
        {"date_from": "2025-01-01", "date_to": "2025-06-01", "interval": "1d"},
        {},
    )
    assert params == {"date_from": "2025-01-01", "date_to": "2025-06-01", "interval": "1d"}


def test_ammp_build_params_defaults() -> None:
    """Default interval should be 1h."""
    connector = AMMPConnector()
    params = connector._build_params({}, {})
    assert params == {"interval": "1h"}


def test_ammp_build_params_from_parameters() -> None:
    """Query params should fall back to workflow parameters."""
    connector = AMMPConnector()
    params = connector._build_params(
        {},
        {"date_from": "2025-01-01", "interval": "1M"},
    )
    assert params["date_from"] == "2025-01-01"
    assert params["interval"] == "1M"


def test_ammp_interpolation() -> None:
    """Template placeholders in config values should be resolved."""
    connector = AMMPConnector()
    url = connector._build_url(
        {"endpoint": "historic-energy", "asset_id": "{{my_asset}}"},
        {"my_asset": "resolved-id"},
    )
    assert url == "https://data-api.ammp.io/v1/assets/resolved-id/historic-energy"
