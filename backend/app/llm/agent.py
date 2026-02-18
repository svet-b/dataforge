from __future__ import annotations

import asyncio
import json
import logging
import time
from collections.abc import AsyncIterator
from dataclasses import dataclass, field
from functools import partial
from typing import Any

import duckdb
from anthropic.types import MessageParam, ToolParam, ToolResultBlockParam, ToolUseBlock

from app.engine.duckdb_manager import DuckDBSession
from app.llm.claude_provider import ClaudeProvider
from app.llm.events import (
    AgentEvent,
    error_event,
    result_event,
    thinking_event,
    tool_call_event,
    tool_result_event,
)

logger = logging.getLogger(__name__)

MAX_ITERATIONS = 15
SQL_TIMEOUT_SECONDS = 10
MAX_RESULT_ROWS = 50

AGENT_TOOLS: list[ToolParam] = [
    {
        "name": "get_schemas",
        "description": (
            "Get the schemas (column names and types) for all available source tables."
        ),
        "input_schema": {
            "type": "object",
            "properties": {},
            "required": [],
        },
    },
    {
        "name": "sample_data",
        "description": "Preview rows from a source table to understand its contents.",
        "input_schema": {
            "type": "object",
            "properties": {
                "table_name": {
                    "type": "string",
                    "description": "Name of the table to sample.",
                },
                "limit": {
                    "type": "integer",
                    "description": "Number of rows to return (max 50, default 5).",
                },
            },
            "required": ["table_name"],
        },
    },
    {
        "name": "run_sql",
        "description": (
            "Execute a read-only SQL query and return the results. "
            "Use this to test queries before submitting."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "sql": {
                    "type": "string",
                    "description": "The SQL query to execute.",
                },
            },
            "required": ["sql"],
        },
    },
    {
        "name": "validate_sql",
        "description": "Check if a SQL query is valid without executing it (uses EXPLAIN).",
        "input_schema": {
            "type": "object",
            "properties": {
                "sql": {
                    "type": "string",
                    "description": "The SQL query to validate.",
                },
            },
            "required": ["sql"],
        },
    },
    {
        "name": "get_current_query",
        "description": "Get the current SQL query in the user's editor, if any.",
        "input_schema": {
            "type": "object",
            "properties": {},
            "required": [],
        },
    },
    {
        "name": "submit_sql",
        "description": (
            "Submit the final SQL query to be applied to the user's workflow. "
            "This is a terminal action — call this when you are confident the query is correct."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "sql": {
                    "type": "string",
                    "description": "The final SQL query.",
                },
                "explanation": {
                    "type": "string",
                    "description": "Brief explanation of what the query does.",
                },
            },
            "required": ["sql", "explanation"],
        },
    },
]


@dataclass
class AgentContext:
    session: DuckDBSession
    table_names: list[str]
    current_query: str | None
    parameters: list[dict[str, object]] = field(default_factory=list)


def _json_safe(obj: Any) -> Any:
    """Convert non-JSON-serializable values for tool results."""
    if isinstance(obj, dict):
        return {k: _json_safe(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_json_safe(v) for v in obj]
    if hasattr(obj, "isoformat"):
        return obj.isoformat()
    try:
        json.dumps(obj)
        return obj
    except (TypeError, ValueError):
        return str(obj)


def _execute_tool(ctx: AgentContext, tool_name: str, tool_input: dict[str, Any]) -> str:
    """Execute a tool and return the result as a string."""
    if tool_name == "get_schemas":
        schemas: list[dict[str, Any]] = []
        for table_name in ctx.table_names:
            cols = ctx.session.get_table_schema(table_name)
            row_count = ctx.session.get_row_count(table_name)
            schemas.append(
                {
                    "table": table_name,
                    "columns": cols,
                    "row_count": row_count,
                }
            )
        return json.dumps(schemas, indent=2)

    if tool_name == "sample_data":
        table_name = tool_input["table_name"]
        limit = min(tool_input.get("limit", 5), MAX_RESULT_ROWS)
        try:
            data = ctx.session.get_table_data(table_name, limit=limit)
            row_count = ctx.session.get_row_count(table_name)
            return json.dumps(
                {"rows": _json_safe(data), "total_rows": row_count},
                indent=2,
            )
        except duckdb.Error as e:
            return json.dumps({"error": str(e)})

    if tool_name == "run_sql":
        sql = tool_input["sql"]
        try:
            wrapped = f"SELECT * FROM ({sql}) AS _q LIMIT {MAX_RESULT_ROWS + 1}"
            result = ctx.session.conn.execute(wrapped)
            columns = [desc[0] for desc in result.description]
            rows = result.fetchall()
            data = [dict(zip(columns, row)) for row in rows[:MAX_RESULT_ROWS]]
            truncated = len(rows) > MAX_RESULT_ROWS
            out: dict[str, Any] = {"rows": _json_safe(data), "column_count": len(columns)}
            if truncated:
                out["note"] = f"Results truncated to {MAX_RESULT_ROWS} rows."
            return json.dumps(out, indent=2)
        except duckdb.Error as e:
            return json.dumps({"error": str(e)})

    if tool_name == "validate_sql":
        sql = tool_input["sql"]
        error = ctx.session.validate_query(sql)
        if error is None:
            return json.dumps({"valid": True})
        return json.dumps({"valid": False, "error": error})

    if tool_name == "get_current_query":
        if ctx.current_query and ctx.current_query.strip():
            return ctx.current_query
        return "No query in editor."

    if tool_name == "submit_sql":
        return json.dumps({"status": "submitted"})

    return json.dumps({"error": f"Unknown tool: {tool_name}"})


async def run_agent(
    provider: ClaudeProvider,
    system_prompt: str,
    user_message: str,
    ctx: AgentContext,
) -> AsyncIterator[AgentEvent]:
    """Run the agent loop, yielding SSE events for each step."""
    messages: list[MessageParam] = [{"role": "user", "content": user_message}]

    for iteration in range(1, MAX_ITERATIONS + 1):
        response = await provider.generate_with_tools(system_prompt, messages, AGENT_TOOLS)

        # Collect text blocks and tool use blocks
        text_parts: list[str] = []
        tool_uses: list[ToolUseBlock] = []
        for block in response.content:
            if block.type == "text" and block.text.strip():
                text_parts.append(block.text)
            elif block.type == "tool_use":
                tool_uses.append(block)

        # Emit thinking for any text content
        if text_parts:
            yield thinking_event("\n\n".join(text_parts), iteration)

        # No tool calls — end_turn with text only
        if not tool_uses:
            if response.stop_reason == "end_turn":
                yield error_event(
                    "Agent responded with text but did not call submit_sql. "
                    "Please try again with a clearer request."
                )
                return
            break

        # Process tool calls
        # First, append the assistant message with all content blocks
        messages.append({"role": "assistant", "content": response.content})

        tool_results: list[ToolResultBlockParam] = []
        for tool_use in tool_uses:
            tool_name = tool_use.name
            tool_input = tool_use.input
            assert isinstance(tool_input, dict)

            # Check for terminal submit_sql
            if tool_name == "submit_sql":
                sql = tool_input.get("sql", "")
                explanation = tool_input.get("explanation", "")
                assert isinstance(sql, str)
                assert isinstance(explanation, str)
                yield result_event(sql, explanation)
                return

            yield tool_call_event(tool_name, tool_input, iteration)

            # Execute tool in thread pool (DuckDB is synchronous)
            start = time.monotonic()
            try:
                result_str = await asyncio.wait_for(
                    asyncio.get_event_loop().run_in_executor(
                        None, partial(_execute_tool, ctx, tool_name, tool_input)
                    ),
                    timeout=SQL_TIMEOUT_SECONDS,
                )
            except TimeoutError:
                result_str = json.dumps({"error": "Query timed out after 10 seconds."})
            except Exception as e:
                result_str = json.dumps({"error": str(e)})
            duration_ms = int((time.monotonic() - start) * 1000)

            yield tool_result_event(tool_name, result_str, duration_ms, iteration)

            tool_results.append(
                {
                    "type": "tool_result",
                    "tool_use_id": tool_use.id,
                    "content": result_str,
                }
            )

        # Append tool results as user message
        messages.append({"role": "user", "content": tool_results})

    else:
        yield error_event(f"Agent reached maximum iterations ({MAX_ITERATIONS}).")
