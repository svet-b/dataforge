from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.config import settings
from app.llm import create_llm_provider
from app.llm.prompts import build_system_prompt, parse_llm_response

router = APIRouter(prefix="/api/llm", tags=["llm"])

_provider = create_llm_provider(settings)


class GenerateSQLRequest(BaseModel):
    prompt: str
    available_tables: list[dict[str, object]]
    workflow_parameters: list[dict[str, object]]
    conversation_history: list[dict[str, str]] = []
    current_query: str | None = None


class GenerateSQLResponse(BaseModel):
    sql: str
    explanation: str


@router.post("/generate-sql", response_model=GenerateSQLResponse)
async def generate_sql(body: GenerateSQLRequest) -> GenerateSQLResponse:
    """Generate DuckDB SQL from a natural language description."""
    if _provider is None:
        raise HTTPException(
            status_code=503,
            detail="LLM provider not configured. Set ANTHROPIC_API_KEY in environment.",
        )

    system_prompt = build_system_prompt(
        body.available_tables, body.workflow_parameters, body.current_query
    )

    if body.conversation_history:
        messages = body.conversation_history + [{"role": "user", "content": body.prompt}]
        response = await _provider.generate_with_history(system_prompt, messages)
    else:
        response = await _provider.generate(system_prompt, body.prompt)

    sql, explanation = parse_llm_response(response)

    if not sql:
        raise HTTPException(status_code=422, detail="Could not extract SQL from LLM response")

    return GenerateSQLResponse(sql=sql, explanation=explanation)


@router.get("/status")
async def llm_status() -> dict[str, str]:
    """Check if the LLM provider is configured."""
    if _provider is None:
        return {"status": "unavailable", "provider": "claude", "error": "No API key configured"}
    return {"status": "ok", "provider": "claude", "model": settings.llm_model}
