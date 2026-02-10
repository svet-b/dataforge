from __future__ import annotations

from app.config import Settings
from app.llm.claude_provider import ClaudeProvider


def create_llm_provider(settings: Settings) -> ClaudeProvider | None:
    """Create an LLM provider if an API key is configured, otherwise return None."""
    if not settings.anthropic_api_key:
        return None
    return ClaudeProvider(api_key=settings.anthropic_api_key, model=settings.llm_model)
