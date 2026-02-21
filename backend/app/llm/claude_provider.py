from __future__ import annotations

import logging

import anthropic
from anthropic.types import Message, MessageParam, ToolParam

logger = logging.getLogger(__name__)


class ClaudeProvider:
    def __init__(self, api_key: str, model: str = "claude-sonnet-4-6") -> None:
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

    async def generate_with_tools(
        self,
        system_prompt: str,
        messages: list[MessageParam],
        tools: list[ToolParam],
    ) -> Message:
        """Send a conversation with tools to Claude and return the full Message."""
        logger.info(
            "Anthropic tool request: model=%s, message_count=%d, tool_count=%d",
            self.model,
            len(messages),
            len(tools),
        )
        response = await self.client.messages.create(
            model=self.model,
            max_tokens=4096,
            system=system_prompt,
            messages=messages,
            tools=tools,
        )
        self._log_response(response)
        return response
