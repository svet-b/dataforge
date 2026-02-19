from typing import Any

from pydantic import BaseModel


class ChatMessageResponse(BaseModel):
    id: str
    workflow_id: str
    role: str
    content: str
    sql: str | None
    tool_steps: list[dict[str, Any]] | None
    is_error: bool
    created_at: str
