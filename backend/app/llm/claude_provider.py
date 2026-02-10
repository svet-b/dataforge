from __future__ import annotations

from typing import cast

import anthropic
from anthropic.types import MessageParam


class ClaudeProvider:
    def __init__(self, api_key: str, model: str = "claude-sonnet-4-5-20250929") -> None:
        self.client = anthropic.AsyncAnthropic(api_key=api_key)
        self.model = model

    async def generate(self, system_prompt: str, user_prompt: str) -> str:
        """Send a prompt to Claude and return the text response."""
        response = await self.client.messages.create(
            model=self.model,
            max_tokens=4096,
            system=system_prompt,
            messages=[{"role": "user", "content": user_prompt}],
        )
        block = response.content[0]
        assert block.type == "text"
        return block.text

    async def generate_with_history(
        self,
        system_prompt: str,
        messages: list[dict[str, str]],
    ) -> str:
        """Send a multi-turn conversation to Claude and return the latest response."""
        response = await self.client.messages.create(
            model=self.model,
            max_tokens=4096,
            system=system_prompt,
            messages=cast(list[MessageParam], messages),
        )
        block = response.content[0]
        assert block.type == "text"
        return block.text
