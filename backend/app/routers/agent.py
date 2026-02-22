from __future__ import annotations

import json
import logging
from collections.abc import AsyncIterator
from pathlib import Path
from typing import Any

from anthropic.types import MessageParam
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sse_starlette.sse import EventSourceResponse

from app.config import settings
from app.database import SessionLocal, get_db
from app.engine.duckdb_manager import DuckDBSession
from app.engine.executor import WorkflowExecutor
from app.llm import create_llm_provider
from app.llm.agent import AgentContext, run_agent
from app.llm.events import AgentEvent
from app.llm.prompts import build_agent_system_prompt
from app.models.chat import ChatMessage
from app.routers.execution import _load_workflow, _merge_parameters
from app.schemas.chat import ChatMessageResponse

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/workflows", tags=["agent"])

_provider = create_llm_provider(settings)
MAX_HISTORY_MESSAGES = 8
MAX_HISTORY_TEXT_CHARS = 1_200


class AgentChatRequest(BaseModel):
    prompt: str
    conversation_summary: str | None = None
    current_query: str | None = None


def _truncate_text(text: str, max_chars: int = MAX_HISTORY_TEXT_CHARS) -> str:
    if len(text) <= max_chars:
        return text
    return text[: max_chars - 32].rstrip() + "\n\n[... truncated ...]"


def _chat_history_to_messages(history: list[ChatMessage]) -> list[MessageParam]:
    """Convert persisted chat rows to Anthropic message params with size bounds."""
    messages: list[MessageParam] = []
    for item in history:
        role = "assistant" if item.role == "assistant" else "user"
        content = item.content
        if item.role == "assistant" and item.sql:
            content = f"{content}\n\nSQL:\n```sql\n{item.sql}\n```"
        if item.is_error:
            content = f"[error]\n{content}"
        messages.append({"role": role, "content": _truncate_text(content)})
    return messages


async def _create_agent_context(
    sources: list[dict[str, Any]],
    parameters: dict[str, Any],
    current_query: str | None,
) -> tuple[AgentContext, list[dict[str, object]], list[Path]]:
    """Create a DuckDB session with sources loaded for the agent.

    Returns (context, table_schemas) where table_schemas is ready for the system prompt.
    """
    session = DuckDBSession(memory_limit_mb=settings.execution_max_memory_mb)

    # Set parameters as DuckDB variables
    for name, value in parameters.items():
        session.set_variable(name, str(value))

    # Load all sources
    executor = WorkflowExecutor(settings)
    temp_files: list[Path] = []
    table_names: list[str] = []
    try:
        for source in sources:
            await executor.load_source(session, source, parameters, temp_files)
            table_names.append(source["table_name"])
    except Exception:
        session.close()
        executor._cleanup_temp_files(temp_files)
        raise

    # Compute schemas once — embedded in system prompt, no tool call needed
    table_schemas: list[dict[str, object]] = []
    for name in table_names:
        cols = session.get_table_schema(name)
        row_count = session.get_row_count(name)
        table_schemas.append({"name": name, "columns": cols, "row_count": row_count})

    ctx = AgentContext(
        session=session,
        table_names=table_names,
        current_query=current_query,
    )
    return ctx, table_schemas, temp_files


async def _event_stream(
    agent_events: AsyncIterator[AgentEvent],
    duckdb_session: DuckDBSession,
    temp_files: list[Path],
    workflow_id: str,
) -> AsyncIterator[dict[str, str]]:
    """Wrap agent events as SSE dicts, persist the assistant message, and ensure cleanup."""
    collected_steps: list[dict[str, Any]] = []
    result_sql: str | None = None
    assistant_content = ""
    is_error = False

    try:
        async for event in agent_events:
            if event.type == "tool_call":
                collected_steps.append(
                    {
                        "tool": event.data.get("tool"),
                        "input": event.data.get("input"),
                        "iteration": event.data.get("iteration"),
                    }
                )
            elif event.type == "tool_result":
                for step in reversed(collected_steps):
                    if step["tool"] == event.data.get("tool") and "result" not in step:
                        step["result"] = event.data.get("result")
                        step["duration_ms"] = event.data.get("duration_ms")
                        break
            elif event.type == "result":
                assistant_content = event.data.get("explanation", "")
                result_sql = event.data.get("sql")
            elif event.type == "message":
                assistant_content = event.data.get("text", "")
            elif event.type == "error":
                assistant_content = event.data.get("message", "")
                is_error = True

            yield {
                "event": event.type,
                "data": json.dumps(event.data),
            }
    finally:
        duckdb_session.close()
        WorkflowExecutor._cleanup_temp_files(temp_files)

        if assistant_content:
            save_db = SessionLocal()
            try:
                msg = ChatMessage(
                    workflow_id=workflow_id,
                    role="assistant",
                    content=assistant_content,
                    sql=result_sql,
                    tool_steps=collected_steps if collected_steps else None,
                    is_error=is_error,
                )
                save_db.add(msg)
                save_db.commit()
            except Exception:
                logger.exception("Failed to persist assistant chat message")
            finally:
                save_db.close()


@router.get("/{workflow_id}/chat")
def get_chat_history(
    workflow_id: str,
    db: Session = Depends(get_db),
) -> list[ChatMessageResponse]:
    """Return persisted chat messages for a workflow, oldest first."""
    messages = (
        db.query(ChatMessage)
        .filter(ChatMessage.workflow_id == workflow_id)
        .order_by(ChatMessage.created_at)
        .all()
    )
    return [
        ChatMessageResponse(
            id=m.id,
            workflow_id=m.workflow_id,
            role=m.role,
            content=m.content,
            sql=m.sql,
            tool_steps=m.tool_steps,
            is_error=m.is_error,
            created_at=m.created_at,
        )
        for m in messages
    ]


@router.delete("/{workflow_id}/chat", status_code=204)
def clear_chat_history(
    workflow_id: str,
    db: Session = Depends(get_db),
) -> None:
    """Delete all chat messages for a workflow."""
    db.query(ChatMessage).filter(ChatMessage.workflow_id == workflow_id).delete()
    db.commit()


@router.post("/{workflow_id}/agent/chat")
async def agent_chat(
    workflow_id: str,
    body: AgentChatRequest,
    db: Session = Depends(get_db),
) -> EventSourceResponse:
    """Stream an agentic SQL generation session via SSE."""
    if _provider is None:
        raise HTTPException(
            status_code=503,
            detail="LLM provider not configured. Set ANTHROPIC_API_KEY in environment.",
        )

    workflow, sources, query = _load_workflow(workflow_id, db)
    parameters = _merge_parameters(workflow, {})

    # Use current_query from request body, fall back to workflow query
    current_query = body.current_query if body.current_query is not None else query

    # Persist the user message before streaming begins
    user_msg = ChatMessage(
        workflow_id=workflow_id,
        role="user",
        content=body.prompt,
    )
    db.add(user_msg)
    db.commit()

    recent_history = (
        db.query(ChatMessage)
        .filter(ChatMessage.workflow_id == workflow_id, ChatMessage.id != user_msg.id)
        .order_by(ChatMessage.created_at.desc())
        .limit(MAX_HISTORY_MESSAGES)
        .all()
    )
    initial_messages = _chat_history_to_messages(list(reversed(recent_history)))

    ctx, table_schemas, temp_files = await _create_agent_context(
        sources,
        parameters,
        current_query,
    )

    param_info: list[dict[str, object]] = [
        p for p in workflow.parameters if isinstance(p, dict)
    ]

    system_prompt = build_agent_system_prompt(
        tables=table_schemas,
        parameters=param_info,
        current_query=current_query,
        conversation_summary=body.conversation_summary,
    )

    agent_events = run_agent(
        _provider,
        system_prompt,
        body.prompt,
        ctx,
        initial_messages=initial_messages,
    )

    return EventSourceResponse(
        _event_stream(agent_events, ctx.session, temp_files, workflow_id),
        media_type="text/event-stream",
    )
