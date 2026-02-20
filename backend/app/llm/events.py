from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass
class AgentEvent:
    type: str
    data: dict[str, Any] = field(default_factory=dict)


def tool_call_event(tool_name: str, tool_input: dict[str, Any], iteration: int) -> AgentEvent:
    return AgentEvent(
        type="tool_call",
        data={"tool": tool_name, "input": tool_input, "iteration": iteration},
    )


def tool_result_event(tool_name: str, result: str, duration_ms: int, iteration: int) -> AgentEvent:
    return AgentEvent(
        type="tool_result",
        data={
            "tool": tool_name,
            "result": result,
            "duration_ms": duration_ms,
            "iteration": iteration,
        },
    )


def thinking_event(text: str, iteration: int) -> AgentEvent:
    return AgentEvent(type="thinking", data={"text": text, "iteration": iteration})


def result_event(sql: str, explanation: str) -> AgentEvent:
    return AgentEvent(type="result", data={"sql": sql, "explanation": explanation})


def message_event(text: str) -> AgentEvent:
    """Conversational response — agent replied with text but no SQL was generated."""
    return AgentEvent(type="message", data={"text": text})


def usage_event(
    iteration: int,
    input_tokens: int,
    output_tokens: int,
    total_input_tokens: int,
    total_output_tokens: int,
) -> AgentEvent:
    return AgentEvent(
        type="usage",
        data={
            "iteration": iteration,
            "input_tokens": input_tokens,
            "output_tokens": output_tokens,
            "total_input_tokens": total_input_tokens,
            "total_output_tokens": total_output_tokens,
        },
    )


def error_event(message: str) -> AgentEvent:
    return AgentEvent(type="error", data={"message": message})
