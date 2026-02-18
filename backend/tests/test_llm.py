from __future__ import annotations

from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient

from app.llm.prompts import build_agent_system_prompt

# ── Agent system prompt ──────────────────────────────────────


def test_build_agent_system_prompt_basic() -> None:
    prompt = build_agent_system_prompt(parameters=[])
    assert "DuckDB SQL assistant" in prompt
    assert "get_schemas" in prompt
    assert "submit_sql" in prompt


def test_build_agent_system_prompt_with_params() -> None:
    params: list[dict[str, object]] = [
        {"name": "start_date", "type": "date", "description": "Start of period"}
    ]
    prompt = build_agent_system_prompt(parameters=params)
    assert "getvariable('start_date')" in prompt
    assert "Start of period" in prompt


def test_build_agent_system_prompt_with_current_query() -> None:
    prompt = build_agent_system_prompt(parameters=[], current_query="SELECT * FROM foo")
    assert "Current Query" in prompt
    assert "get_current_query" in prompt


def test_build_agent_system_prompt_with_conversation_summary() -> None:
    prompt = build_agent_system_prompt(
        parameters=[],
        conversation_summary="Previously generated: SELECT 1",
    )
    assert "Prior Context" in prompt
    assert "Previously generated: SELECT 1" in prompt


def test_build_agent_system_prompt_contains_performance_guidelines() -> None:
    prompt = build_agent_system_prompt(parameters=[])
    assert "filter early" in prompt
    assert "correlated subqueries" in prompt
    assert "FILTER" in prompt


# ── LLM status endpoint ─────────────────────────────────────


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
