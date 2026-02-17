from __future__ import annotations

import logging
from typing import cast

import anthropic
from anthropic.types import Message, MessageParam

logger = logging.getLogger(__name__)


class ClaudeProvider:
    def __init__(self, api_key: str, model: str = "claude-sonnet-4-5-20250929") -> None:
        self.client = anthropic.AsyncAnthropic(api_key=api_key)
        self.model = model

    def _log_response(self, response: Message) -> None:
        logger.info(
            "Anthropic response: model=%s, usage=(input=%d, output=%d), stop_reason=%s",
            response.model,
            response.usage.input_tokens,
            response.usage.output_tokens,
            response.stop_reason,
        )
        logger.debug("Anthropic response content: %s", response.content)

    async def generate(self, system_prompt: str, user_prompt: str) -> str:
        """Send a prompt to Claude and return the text response."""
        logger.info(
            "Anthropic request: model=%s, user_prompt_length=%d",
            self.model,
            len(user_prompt),
        )
        logger.debug(
            "Anthropic request: system_prompt=%s, user_prompt=%s",
            system_prompt,
            user_prompt,
        )
        response = await self.client.messages.create(
            model=self.model,
            max_tokens=4096,
            system=system_prompt,
            messages=[{"role": "user", "content": user_prompt}],
        )
        self._log_response(response)
        block = response.content[0]
        assert block.type == "text"
        return block.text

    async def generate_with_history(
        self,
        system_prompt: str,
        messages: list[dict[str, str]],
    ) -> str:
        """Send a multi-turn conversation to Claude and return the latest response."""
        logger.info("Anthropic request: model=%s, message_count=%d", self.model, len(messages))
        logger.debug("Anthropic request: system_prompt=%s, messages=%s", system_prompt, messages)
        response = await self.client.messages.create(
            model=self.model,
            max_tokens=4096,
            system=system_prompt,
            messages=cast(list[MessageParam], messages),
        )
        self._log_response(response)
        block = response.content[0]
        assert block.type == "text"
        return block.text
