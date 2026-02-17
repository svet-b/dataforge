from __future__ import annotations

from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient

from app.llm.prompts import build_system_prompt, parse_llm_response

# ── Prompt building ───────────────────────────────────────────


def test_build_system_prompt_with_tables_and_params() -> None:
    tables = [
        {
            "name": "readings",
            "columns": [
                {"name": "meter_id", "type": "VARCHAR"},
                {"name": "value", "type": "DOUBLE"},
            ],
        }
    ]
    params = [{"name": "start_date", "type": "date", "description": "Start of period"}]
    prompt = build_system_prompt(tables, params)
    assert "readings" in prompt
    assert "meter_id (VARCHAR)" in prompt
    assert "value (DOUBLE)" in prompt
    assert "getvariable('start_date')" in prompt
    assert "Start of period" in prompt


def test_build_system_prompt_empty() -> None:
    prompt = build_system_prompt([], [])
    assert "No tables available yet." in prompt
    assert "No parameters defined." in prompt


def test_build_system_prompt_multiple_tables() -> None:
    tables = [
        {"name": "sales", "columns": [{"name": "amount", "type": "DOUBLE"}]},
        {"name": "customers", "columns": [{"name": "name", "type": "VARCHAR"}]},
    ]
    prompt = build_system_prompt(tables, [])
    assert "sales" in prompt
    assert "customers" in prompt


# ── Response parsing ──────────────────────────────────────────


def test_parse_llm_response_with_code_block() -> None:
    response = "```sql\nSELECT * FROM readings\n```\n\nExplanation: Gets all readings."
    sql, explanation = parse_llm_response(response)
    assert sql == "SELECT * FROM readings"
    assert "all readings" in explanation


def test_parse_llm_response_without_code_block() -> None:
    response = "SELECT * FROM readings\n\nExplanation: Gets everything."
    sql, explanation = parse_llm_response(response)
    assert "SELECT" in sql
    assert "Gets everything" in explanation


def test_parse_llm_response_complex_sql() -> None:
    response = """```sql
WITH daily AS (
    SELECT date_trunc('day', ts) AS day, SUM(value) AS total
    FROM readings
    GROUP BY 1
)
SELECT * FROM daily
```

Explanation: Aggregates readings by day."""
    sql, explanation = parse_llm_response(response)
    assert "WITH daily AS" in sql
    assert "date_trunc" in sql
    assert "Aggregates" in explanation


def test_parse_llm_response_no_explanation() -> None:
    response = "```sql\nSELECT 1\n```"
    sql, explanation = parse_llm_response(response)
    assert sql == "SELECT 1"
    assert explanation == ""


# ── API endpoints (mocked) ────────────────────────────────────


@pytest.mark.asyncio
async def test_generate_sql_endpoint(client: TestClient) -> None:
    mock_provider = AsyncMock()
    mock_provider.generate = AsyncMock(
        return_value=(
            "```sql\nSELECT meter_id, SUM(value) FROM readings GROUP BY 1\n```"
            "\n\nExplanation: Sums values by meter."
        )
    )

    with patch("app.routers.llm._provider", mock_provider):
        resp = client.post(
            "/api/llm/generate-sql",
            json={
                "prompt": "Sum values by meter",
                "available_tables": [
                    {
                        "name": "readings",
                        "columns": [
                            {"name": "meter_id", "type": "VARCHAR"},
                            {"name": "value", "type": "DOUBLE"},
                        ],
                    }
                ],
                "workflow_parameters": [],
            },
        )
    assert resp.status_code == 200
    data = resp.json()
    assert "SUM(value)" in data["sql"]
    assert "meter" in data["explanation"].lower()


@pytest.mark.asyncio
async def test_generate_sql_with_history(client: TestClient) -> None:
    mock_provider = AsyncMock()
    mock_provider.generate_with_history = AsyncMock(
        return_value=(
            "```sql\nSELECT * FROM readings WHERE value > 100\n```"
            "\n\nExplanation: Filters high values."
        )
    )

    with patch("app.routers.llm._provider", mock_provider):
        resp = client.post(
            "/api/llm/generate-sql",
            json={
                "prompt": "Also filter for values > 100",
                "available_tables": [],
                "workflow_parameters": [],
                "conversation_history": [
                    {"role": "user", "content": "Show all readings"},
                    {"role": "assistant", "content": "```sql\nSELECT * FROM readings\n```"},
                ],
            },
        )
    assert resp.status_code == 200
    data = resp.json()
    assert "value > 100" in data["sql"]
    mock_provider.generate_with_history.assert_called_once()


@pytest.mark.asyncio
async def test_generate_sql_no_provider(client: TestClient) -> None:
    with patch("app.routers.llm._provider", None):
        resp = client.post(
            "/api/llm/generate-sql",
            json={
                "prompt": "test",
                "available_tables": [],
                "workflow_parameters": [],
            },
        )
    assert resp.status_code == 503
    assert "not configured" in resp.json()["detail"].lower()


def test_llm_status_ok(client: TestClient) -> None:
    mock_provider = AsyncMock()
    with patch("app.routers.llm._provider", mock_provider):
        resp = client.get("/api/llm/status")
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "ok"


def test_llm_status_unavailable(client: TestClient) -> None:
    with patch("app.routers.llm._provider", None):
        resp = client.get("/api/llm/status")
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "unavailable"


# ── Performance prompt ───────────────────────────────────────


def test_system_prompt_contains_performance_guidelines() -> None:
    prompt = build_system_prompt([], [])
    assert "filter early" in prompt
    assert "correlated subqueries" in prompt
    assert "FILTER" in prompt
