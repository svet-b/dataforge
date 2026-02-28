from __future__ import annotations

import asyncio
import json
import logging
import time
from collections.abc import AsyncIterator
from dataclasses import dataclass, field
from typing import Any

import duckdb
from pydantic import BaseModel
from pydantic_ai import Agent, RunContext
from pydantic_ai.exceptions import UsageLimitExceeded
from pydantic_ai.messages import ModelMessage
from pydantic_ai.settings import ModelSettings
from pydantic_ai.usage import UsageLimits

from app.engine.duckdb_manager import DuckDBSession
from app.llm.events import (
    AgentEvent,
    error_event,
    message_event,
    result_event,
    tool_call_event,
    tool_result_event,
    usage_event,
)
from app.serialization import json_safe

logger = logging.getLogger(__name__)

MAX_ITERATIONS = 12
SQL_TIMEOUT_SECONDS = 60
MAX_RESULT_ROWS = 50
# Hard cap on tool result strings added to message history (~2k tokens).
# Prevents runaway context growth from wide/nested query results (e.g. DuckDB LIST columns).
MAX_TOOL_RESULT_CHARS = 8_000


# ---------------------------------------------------------------------------
# Structured output types — replace the old submit_sql terminal tool
# ---------------------------------------------------------------------------


class SqlResult(BaseModel):
    """Final SQL query produced by the agent."""

    sql: str
    explanation: str


class TextMessage(BaseModel):
    """Conversational reply when no SQL was requested or needed."""

    text: str


# ---------------------------------------------------------------------------
# Dependency / context passed to every tool via RunContext
# ---------------------------------------------------------------------------


@dataclass
class AgentContext:
    session: DuckDBSession
    table_names: list[str]
    current_query: str | None
    parameters: list[dict[str, object]] = field(default_factory=list)
    # Set by run_agent before each run; drives the @_agent.system_prompt hook.
    system_prompt: str = field(default="")
    # Internal bookkeeping — not part of the public interface.
    _event_queue: asyncio.Queue[AgentEvent | None] = field(
        default_factory=asyncio.Queue
    )
    _iteration: int = field(default=0)


# ---------------------------------------------------------------------------
# Pydantic AI agent
# ---------------------------------------------------------------------------

_agent: Agent[AgentContext, SqlResult | TextMessage] = Agent(
    deps_type=AgentContext,
    output_type=SqlResult | TextMessage,  # type: ignore[arg-type]
)


@_agent.system_prompt
def _system_prompt(ctx: RunContext[AgentContext]) -> str:
    return ctx.deps.system_prompt


# ---------------------------------------------------------------------------
# Helper utilities
# ---------------------------------------------------------------------------


def _truncate_result(result: str, max_chars: int = MAX_TOOL_RESULT_CHARS) -> str:
    """Truncate a tool result string to stay within the context budget."""
    if len(result) <= max_chars:
        return result
    logger.warning("Tool result truncated: %d chars → %d chars", len(result), max_chars)
    trimmed = result[: max_chars - 120]
    last_newline = trimmed.rfind("\n")
    if last_newline > max_chars // 2:
        trimmed = trimmed[:last_newline]
    note = f"\n[... TRUNCATED — result exceeded {max_chars} chars. Use a more selective query.]"
    return trimmed + note


def _do_sample_data(session: DuckDBSession, table_name: str, limit: int) -> str:
    try:
        data = session.get_table_data(table_name, limit=limit)
        row_count = session.get_row_count(table_name)
        return json.dumps({"rows": json_safe(data), "total_rows": row_count}, indent=2)
    except duckdb.Error as e:
        return json.dumps({"error": str(e)})


def _do_run_sql(session: DuckDBSession, sql: str) -> str:
    try:
        wrapped = f"SELECT * FROM ({sql}) AS _q LIMIT {MAX_RESULT_ROWS + 1}"
        result = session.conn.execute(wrapped)
        columns = [desc[0] for desc in result.description]
        rows = result.fetchall()
        data = [dict(zip(columns, row)) for row in rows[:MAX_RESULT_ROWS]]
        out: dict[str, Any] = {"rows": json_safe(data), "column_count": len(columns)}
        if len(rows) > MAX_RESULT_ROWS:
            out["note"] = f"Results truncated to {MAX_RESULT_ROWS} rows."
        return json.dumps(out, indent=2)
    except duckdb.Error as e:
        return json.dumps({"error": str(e)})


# ---------------------------------------------------------------------------
# Tool definitions
# ---------------------------------------------------------------------------


@_agent.tool
async def sample_data(
    ctx: RunContext[AgentContext],
    table_name: str,
    limit: int = 5,
) -> str:
    """Preview rows from a source table to understand its contents.

    Args:
        table_name: Name of the table to sample.
        limit: Number of rows to return (max 50, default 5).
    """
    ctx.deps._iteration += 1
    iteration = ctx.deps._iteration
    actual_limit = min(limit, MAX_RESULT_ROWS)
    tool_input = {"table_name": table_name, "limit": actual_limit}

    await ctx.deps._event_queue.put(tool_call_event("sample_data", tool_input, iteration))

    start = time.monotonic()
    try:
        result_str = await asyncio.get_running_loop().run_in_executor(
            None, lambda: _do_sample_data(ctx.deps.session, table_name, actual_limit)
        )
    except Exception as e:
        result_str = json.dumps({"error": str(e)})
    duration_ms = int((time.monotonic() - start) * 1000)

    await ctx.deps._event_queue.put(
        tool_result_event("sample_data", result_str, duration_ms, iteration)
    )
    return _truncate_result(result_str)


@_agent.tool
async def run_sql(ctx: RunContext[AgentContext], sql: str) -> str:
    """Execute a read-only SQL query and return the results. Use this to test queries.

    Args:
        sql: The SQL query to execute.
    """
    ctx.deps._iteration += 1
    iteration = ctx.deps._iteration
    tool_input = {"sql": sql}

    await ctx.deps._event_queue.put(tool_call_event("run_sql", tool_input, iteration))

    start = time.monotonic()
    try:
        result_str = await asyncio.wait_for(
            asyncio.get_running_loop().run_in_executor(
                None, lambda: _do_run_sql(ctx.deps.session, sql)
            ),
            timeout=SQL_TIMEOUT_SECONDS,
        )
    except TimeoutError:
        result_str = json.dumps(
            {"error": f"Query timed out after {SQL_TIMEOUT_SECONDS} seconds."}
        )
    except Exception as e:
        result_str = json.dumps({"error": str(e)})
    duration_ms = int((time.monotonic() - start) * 1000)

    await ctx.deps._event_queue.put(
        tool_result_event("run_sql", result_str, duration_ms, iteration)
    )
    return _truncate_result(result_str)


@_agent.tool
def get_current_query(ctx: RunContext[AgentContext]) -> str:
    """Get the current SQL query in the user's editor, if any."""
    if ctx.deps.current_query and ctx.deps.current_query.strip():
        return ctx.deps.current_query
    return "No query in editor."


# ---------------------------------------------------------------------------
# Public entry point
# ---------------------------------------------------------------------------


async def run_agent(
    model: str,
    system_prompt: str,
    user_message: str,
    ctx: AgentContext,
    initial_messages: list[ModelMessage] | None = None,
) -> AsyncIterator[AgentEvent]:
    """Run the Pydantic AI agent loop, yielding SSE events for each step.

    Tool-call and tool-result events are emitted in real time as tools execute.
    The final result (SqlResult or TextMessage) is emitted when the agent finishes.
    """
    ctx.system_prompt = system_prompt

    async def _run() -> None:
        try:
            result = await _agent.run(
                user_message,
                model=model,
                deps=ctx,
                message_history=initial_messages or [],
                model_settings=ModelSettings(max_tokens=4096),
                usage_limits=UsageLimits(request_limit=MAX_ITERATIONS),
            )

            usage = result.usage()
            await ctx._event_queue.put(
                usage_event(
                    iteration=ctx._iteration,
                    input_tokens=usage.request_tokens or 0,
                    output_tokens=usage.response_tokens or 0,
                    total_input_tokens=usage.request_tokens or 0,
                    total_output_tokens=usage.response_tokens or 0,
                )
            )

            if isinstance(result.data, SqlResult):
                await ctx._event_queue.put(
                    result_event(result.data.sql, result.data.explanation)
                )
            else:
                await ctx._event_queue.put(message_event(result.data.text))

        except UsageLimitExceeded:
            await ctx._event_queue.put(
                error_event(f"Agent reached maximum iterations ({MAX_ITERATIONS}).")
            )
        except Exception as e:
            logger.error("Agent error: %s", e)
            error_msg = str(e)
            if "context_length" in error_msg.lower() or "too large" in error_msg.lower():
                error_msg = (
                    "Request too large for the model's context window. "
                    f"Try a simpler query or clear the chat history. ({error_msg})"
                )
            await ctx._event_queue.put(error_event(error_msg))
        finally:
            await ctx._event_queue.put(None)  # sentinel

    task = asyncio.create_task(_run())
    try:
        while True:
            event = await ctx._event_queue.get()
            if event is None:
                break
            yield event
    finally:
        if not task.done():
            task.cancel()
            try:
                await task
            except asyncio.CancelledError:
                pass
