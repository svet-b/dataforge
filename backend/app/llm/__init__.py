from __future__ import annotations

from app.config import Settings


def create_llm_provider(settings: Settings) -> str | None:
    """Return the Pydantic AI model string if an API key is configured, else None.

    The returned string is passed directly to pydantic_ai Agent.run(model=...).
    Pydantic AI reads the Anthropic API key from the ANTHROPIC_API_KEY environment
    variable, which is the same source that Settings.anthropic_api_key uses.
    """
    if not settings.anthropic_api_key:
        return None
    return f"anthropic:{settings.llm_model}"
