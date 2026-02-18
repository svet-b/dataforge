from __future__ import annotations

from fastapi import APIRouter

from app.config import settings
from app.llm import create_llm_provider

router = APIRouter(prefix="/api/llm", tags=["llm"])

_provider = create_llm_provider(settings)


@router.get("/status")
async def llm_status() -> dict[str, str]:
    """Check if the LLM provider is configured."""
    if _provider is None:
        return {"status": "unavailable", "provider": "claude", "error": "No API key configured"}
    return {"status": "ok", "provider": "claude", "model": settings.llm_model}
