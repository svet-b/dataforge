from __future__ import annotations

import json
import logging
from collections.abc import AsyncIterator
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sse_starlette.sse import EventSourceResponse

from app.config import settings
from app.database import get_db
from app.engine.duckdb_manager import DuckDBSession
from app.engine.executor import WorkflowExecutor
from app.llm import create_llm_provider
from app.llm.agent import AgentContext, run_agent
from app.llm.events import AgentEvent
from app.llm.prompts import build_agent_system_prompt
from app.routers.execution import _load_workflow, _merge_parameters

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/workflows", tags=["agent"])

_provider = create_llm_provider(settings)


class AgentChatRequest(BaseModel):
    prompt: str
    conversation_summary: str | None = None
    current_query: str | None = None


async def _create_agent_context(
    sources: list[dict[str, Any]],
    parameters: dict[str, Any],
    current_query: str | None,
) -> tuple[AgentContext, list[dict[str, object]]]:
    """Create a DuckDB session with sources loaded for the agent.

    Returns (context, table_schemas) where table_schemas is ready for the system prompt.
    """
    session = DuckDBSession(memory_limit_mb=settings.execution_max_memory_mb)

    # Set parameters as DuckDB variables
    for name, value in parameters.items():
        session.set_variable(name, str(value))

    # Load all sources
    executor = WorkflowExecutor(settings)
    table_names: list[str] = []
    for source in sources:
        await executor._load_source(session, source, parameters)
        table_names.append(source["table_name"])

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
    return ctx, table_schemas


async def _event_stream(
    agent_events: AsyncIterator[AgentEvent],
    session: DuckDBSession,
) -> AsyncIterator[dict[str, str]]:
    """Wrap agent events as SSE dicts and ensure cleanup."""
    try:
        async for event in agent_events:
            yield {
                "event": event.type,
                "data": json.dumps(event.data),
            }
    finally:
        session.close()


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

    ctx, table_schemas = await _create_agent_context(sources, parameters, current_query)

    param_info: list[dict[str, object]] = []
    for p in workflow.parameters:
        assert isinstance(p, dict)
        param_info.append(p)

    system_prompt = build_agent_system_prompt(
        tables=table_schemas,
        parameters=param_info,
        current_query=current_query,
        conversation_summary=body.conversation_summary,
    )

    agent_events = run_agent(_provider, system_prompt, body.prompt, ctx)

    return EventSourceResponse(
        _event_stream(agent_events, ctx.session),
        media_type="text/event-stream",
    )
