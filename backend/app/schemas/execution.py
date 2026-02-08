from typing import Any
from uuid import UUID

from pydantic import BaseModel


class RunRequest(BaseModel):
    parameters: dict[str, Any] = {}


class RunResponse(BaseModel):
    run_id: UUID
    status: str
    duration_ms: int
    row_count: int | None
    data: list[dict[str, Any]] | None
    error: dict[str, Any] | None
    node_timings: dict[str, Any]


class NodePreviewResponse(RunResponse):
    schema_info: list[dict[str, str]]
