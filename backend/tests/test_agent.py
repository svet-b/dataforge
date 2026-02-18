from __future__ import annotations

import json
from typing import Any
from unittest.mock import AsyncMock, MagicMock, patch

import anthropic
import pytest

from app.engine.duckdb_manager import DuckDBSession
from app.llm.agent import (
    MAX_TOOL_RESULT_CHARS,
    AgentContext,
    _execute_tool,
    _truncate_result,
    run_agent,
)
from app.llm.events import AgentEvent

# ── Helpers ──────────────────────────────────────────────────


def _make_ctx(
    tables: dict[str, list[dict[str, Any]]] | None = None,
    current_query: str | None = None,
) -> AgentContext:
    """Create an AgentContext with real DuckDB and loaded tables."""
    session = DuckDBSession()
    table_names: list[str] = []

    if tables:
        for name, rows in tables.items():
            if rows:
                cols = list(rows[0].keys())
                col_defs = ", ".join(f"{c} VARCHAR" for c in cols)
                session.conn.execute(f"CREATE TABLE {name} ({col_defs})")
                for row in rows:
                    vals = ", ".join(f"'{v}'" for v in row.values())
                    session.conn.execute(f"INSERT INTO {name} VALUES ({vals})")
            else:
                session.conn.execute(f"CREATE TABLE {name} (id INTEGER)")
            table_names.append(name)

    return AgentContext(
        session=session,
        table_names=table_names,
        current_query=current_query,
    )


def _make_tool_use_block(tool_id: str, name: str, input_data: dict[str, Any]) -> MagicMock:
    block = MagicMock()
    block.type = "tool_use"
    block.id = tool_id
    block.name = name
    block.input = input_data
    return block


def _make_text_block(text: str) -> MagicMock:
    block = MagicMock()
    block.type = "text"
    block.text = text
    return block


def _make_response(blocks: list[MagicMock], stop_reason: str = "tool_use") -> MagicMock:
    resp = MagicMock()
    resp.content = blocks
    resp.stop_reason = stop_reason
    return resp


# ── Tool executor tests (real DuckDB) ───────────────────────


class TestSampleData:
    def test_returns_rows(self) -> None:
        ctx = _make_ctx({"items": [{"name": "a"}, {"name": "b"}, {"name": "c"}]})
        result = json.loads(_execute_tool(ctx, "sample_data", {"table_name": "items", "limit": 2}))
        assert len(result["rows"]) == 2
        assert result["total_rows"] == 3
        ctx.session.close()

    def test_invalid_table(self) -> None:
        ctx = _make_ctx({})
        result = json.loads(_execute_tool(ctx, "sample_data", {"table_name": "nope"}))
        assert "error" in result
        ctx.session.close()


class TestRunSql:
    def test_executes_query(self) -> None:
        ctx = _make_ctx({"t": [{"x": "1"}, {"x": "2"}]})
        result = json.loads(_execute_tool(ctx, "run_sql", {"sql": "SELECT * FROM t"}))
        assert len(result["rows"]) == 2
        ctx.session.close()

    def test_sql_error(self) -> None:
        ctx = _make_ctx({})
        result = json.loads(_execute_tool(ctx, "run_sql", {"sql": "SELECT * FROM nonexistent"}))
        assert "error" in result
        ctx.session.close()


class TestValidateSql:
    def test_valid_query(self) -> None:
        ctx = _make_ctx({"t": [{"x": "1"}]})
        result = json.loads(_execute_tool(ctx, "validate_sql", {"sql": "SELECT * FROM t"}))
        assert result["valid"] is True
        ctx.session.close()

    def test_invalid_query(self) -> None:
        ctx = _make_ctx({})
        result = json.loads(_execute_tool(ctx, "validate_sql", {"sql": "SELECT * FROM nope"}))
        assert result["valid"] is False
        assert "error" in result
        ctx.session.close()


class TestGetCurrentQuery:
    def test_returns_query(self) -> None:
        ctx = _make_ctx(current_query="SELECT 1")
        result = _execute_tool(ctx, "get_current_query", {})
        assert result == "SELECT 1"
        ctx.session.close()

    def test_no_query(self) -> None:
        ctx = _make_ctx(current_query=None)
        result = _execute_tool(ctx, "get_current_query", {})
        assert "No query" in result
        ctx.session.close()


class TestSubmitSql:
    def test_returns_submitted(self) -> None:
        ctx = _make_ctx()
        result = json.loads(
            _execute_tool(ctx, "submit_sql", {"sql": "SELECT 1", "explanation": "test"})
        )
        assert result["status"] == "submitted"
        ctx.session.close()


# ── Result truncation ────────────────────────────────────────


def test_truncate_result_under_limit() -> None:
    short = "x" * 100
    assert _truncate_result(short, max_chars=200) == short


def test_truncate_result_over_limit() -> None:
    long_result = "x" * 20_000
    truncated = _truncate_result(long_result, max_chars=MAX_TOOL_RESULT_CHARS)
    assert len(truncated) < 20_000
    assert "TRUNCATED" in truncated


def test_truncate_result_preserves_newline_boundary() -> None:
    lines = "\n".join(["line"] * 2000)  # lots of short lines
    truncated = _truncate_result(lines, max_chars=MAX_TOOL_RESULT_CHARS)
    assert "TRUNCATED" in truncated
    # Should end at a newline (not mid-line), so last char before note is \n
    before_note = truncated[: truncated.rfind("\n[...")]
    assert not before_note.endswith("lin")  # not mid-word


# ── Agent loop tests (mocked Claude) ────────────────────────


@pytest.mark.asyncio
async def test_agent_simple_submit() -> None:
    """Agent immediately calls submit_sql."""
    ctx = _make_ctx({"t": [{"x": "1"}]})
    provider = AsyncMock()

    # Claude responds with submit_sql tool call
    submit_input = {"sql": "SELECT * FROM t", "explanation": "All rows"}
    provider.generate_with_tools = AsyncMock(
        return_value=_make_response(
            [
                _make_tool_use_block("t1", "submit_sql", submit_input),
            ]
        )
    )

    events: list[AgentEvent] = []
    async for event in run_agent(provider, "system", "get all rows", ctx):
        events.append(event)

    assert len(events) == 1
    assert events[0].type == "result"
    assert events[0].data["sql"] == "SELECT * FROM t"
    assert events[0].data["explanation"] == "All rows"
    ctx.session.close()


@pytest.mark.asyncio
async def test_agent_multi_step() -> None:
    """Agent calls get_schemas then submit_sql."""
    ctx = _make_ctx({"orders": [{"id": "1"}]})
    provider = AsyncMock()

    # First call: get_schemas
    resp1 = _make_response(
        [
            _make_text_block("Let me check the schemas."),
            _make_tool_use_block("t1", "get_schemas", {}),
        ]
    )
    # Second call: submit_sql
    submit_input = {
        "sql": "SELECT * FROM orders",
        "explanation": "All orders",
    }
    resp2 = _make_response(
        [
            _make_tool_use_block("t2", "submit_sql", submit_input),
        ]
    )
    provider.generate_with_tools = AsyncMock(side_effect=[resp1, resp2])

    events: list[AgentEvent] = []
    async for event in run_agent(provider, "system", "show orders", ctx):
        events.append(event)

    types = [e.type for e in events]
    assert "thinking" in types
    assert "tool_call" in types
    assert "tool_result" in types
    assert "result" in types
    assert events[-1].type == "result"
    ctx.session.close()


@pytest.mark.asyncio
async def test_agent_bad_request_yields_error() -> None:
    """Context-too-long from Anthropic → graceful error event, not a crash."""
    ctx = _make_ctx({"t": [{"x": "1"}]})
    provider = AsyncMock()

    # Simulate context-window exceeded error
    provider.generate_with_tools = AsyncMock(
        side_effect=anthropic.BadRequestError(
            message="prompt is too long: 201447 tokens > 200000 maximum",
            response=MagicMock(status_code=400),
            body={"type": "error", "error": {"type": "invalid_request_error"}},
        )
    )

    events: list[AgentEvent] = []
    async for event in run_agent(provider, "system", "do something", ctx):
        events.append(event)

    assert len(events) == 1
    assert events[0].type == "error"
    assert "context window" in events[0].data["message"].lower()
    ctx.session.close()


@pytest.mark.asyncio
async def test_agent_text_only_yields_message() -> None:
    """Agent responds with text only (no submit_sql) → message event, not error."""
    ctx = _make_ctx()
    provider = AsyncMock()

    provider.generate_with_tools = AsyncMock(
        return_value=_make_response(
            [_make_text_block("I can't help with that.")],
            stop_reason="end_turn",
        )
    )

    events: list[AgentEvent] = []
    async for event in run_agent(provider, "system", "do something", ctx):
        events.append(event)

    assert len(events) == 1
    assert events[0].type == "message"
    assert events[0].data["text"] == "I can't help with that."
    ctx.session.close()


@pytest.mark.asyncio
async def test_agent_max_iterations() -> None:
    """Agent hits max iterations → error event."""
    ctx = _make_ctx({"t": [{"x": "1"}]})
    provider = AsyncMock()

    # Always return a non-terminal tool call
    provider.generate_with_tools = AsyncMock(
        return_value=_make_response(
            [
                _make_tool_use_block("t1", "get_schemas", {}),
            ]
        )
    )

    events: list[AgentEvent] = []
    async for event in run_agent(provider, "system", "loop forever", ctx):
        events.append(event)

    assert events[-1].type == "error"
    assert "maximum iterations" in events[-1].data["message"].lower()
    ctx.session.close()


# ── SSE endpoint tests ───────────────────────────────────────


def test_agent_chat_no_provider(client: Any) -> None:
    with patch("app.routers.agent._provider", None):
        resp = client.post(
            "/api/workflows/nonexistent/agent/chat",
            json={"prompt": "test"},
        )
    assert resp.status_code == 503
