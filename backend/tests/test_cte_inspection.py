from pathlib import Path
from typing import Any

import pytest

from app.config import Settings
from app.engine.executor import WorkflowExecutor

FIXTURES_DIR = Path(__file__).parent / "fixtures"


@pytest.fixture()
def executor() -> WorkflowExecutor:
    return WorkflowExecutor(Settings(database_url="sqlite://"))


def _csv_sources() -> list[dict[str, Any]]:
    csv_path = str(FIXTURES_DIR / "sample_meter_data.csv")
    return [
        {
            "id": "1",
            "type": "file",
            "table_name": "raw_data",
            "config": {"file_path": csv_path, "file_type": "csv"},
        },
    ]


@pytest.mark.asyncio
async def test_inspect_single_cte(executor: WorkflowExecutor) -> None:
    query = """
    WITH totals AS (
        SELECT meter_id, SUM(energy_kwh) AS total
        FROM raw_data
        GROUP BY meter_id
    )
    SELECT * FROM totals WHERE total > 40
    """
    result = await executor.inspect_ctes(
        workflow_id="test",
        sources=_csv_sources(),
        query=query,
        parameters={},
    )

    assert result.status == "success"
    assert len(result.ctes) == 1
    assert result.ctes[0].name == "totals"
    assert result.ctes[0].row_count == 2
    assert len(result.ctes[0].schema_info) == 2
    col_names = [c["name"] for c in result.ctes[0].schema_info]
    assert "meter_id" in col_names
    assert "total" in col_names


@pytest.mark.asyncio
async def test_inspect_multiple_ctes(executor: WorkflowExecutor) -> None:
    query = """
    WITH step1 AS (
        SELECT meter_id, energy_kwh, voltage
        FROM raw_data
        WHERE voltage > 230
    ),
    step2 AS (
        SELECT meter_id, SUM(energy_kwh) AS total
        FROM step1
        GROUP BY meter_id
    )
    SELECT * FROM step2
    """
    result = await executor.inspect_ctes(
        workflow_id="test",
        sources=_csv_sources(),
        query=query,
        parameters={},
    )

    assert result.status == "success"
    assert len(result.ctes) == 2
    assert result.ctes[0].name == "step1"
    assert result.ctes[1].name == "step2"
    # step1 filters voltage > 230, so some rows
    assert result.ctes[0].row_count > 0
    # step2 aggregates, should have at most 2 meters
    assert result.ctes[1].row_count <= 2


@pytest.mark.asyncio
async def test_inspect_no_ctes(executor: WorkflowExecutor) -> None:
    query = "SELECT * FROM raw_data"
    result = await executor.inspect_ctes(
        workflow_id="test",
        sources=_csv_sources(),
        query=query,
        parameters={},
    )

    assert result.status == "success"
    assert result.ctes == []


@pytest.mark.asyncio
async def test_inspect_ctes_api_endpoint(client: Any) -> None:
    # Create a workflow with sources and a CTE query
    resp = client.post("/api/workflows", json={"name": "CTE Test"})
    assert resp.status_code == 201
    workflow_id = resp.json()["id"]

    # Upload a CSV file
    csv_path = FIXTURES_DIR / "sample_meter_data.csv"
    with open(csv_path, "rb") as f:
        resp = client.post(
            f"/api/workflows/{workflow_id}/files",
            files={"file": ("sample_meter_data.csv", f, "text/csv")},
        )
    assert resp.status_code == 201

    # Add file source
    resp = client.post(
        f"/api/workflows/{workflow_id}/sources",
        json={
            "table_name": "raw_data",
            "type": "file",
            "config": {"filename": "sample_meter_data.csv", "file_type": "csv"},
        },
    )
    assert resp.status_code == 201

    # Set query with CTE
    cte_query = """
    WITH totals AS (
        SELECT meter_id, SUM(energy_kwh) AS total
        FROM raw_data
        GROUP BY meter_id
    )
    SELECT * FROM totals WHERE total > 40
    """
    resp = client.put(f"/api/workflows/{workflow_id}", json={"query": cte_query})
    assert resp.status_code == 200

    # Inspect CTEs
    resp = client.post(f"/api/workflows/{workflow_id}/inspect-ctes", json={})
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "success"
    assert len(data["ctes"]) == 1
    assert data["ctes"][0]["name"] == "totals"
    assert data["ctes"][0]["row_count"] == 2
