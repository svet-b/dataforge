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


def message_event(text: str) -> AgentEvent:
    """Plain conversational reply from the agent (no SQL produced)."""
    return AgentEvent(type="message", data={"text": text})


def result_event(sql: str, explanation: str) -> AgentEvent:
    return AgentEvent(type="result", data={"sql": sql, "explanation": explanation})


def message_event(text: str) -> AgentEvent:
    """Conversational response — agent replied with text but no SQL was generated."""
    return AgentEvent(type="message", data={"text": text})


def error_event(message: str) -> AgentEvent:
    return AgentEvent(type="error", data={"message": message})
