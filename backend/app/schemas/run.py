from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel


class RunHistorySummaryResponse(BaseModel):
    id: UUID
    workflow_id: UUID
    parameters: dict[str, Any]
    status: str
    started_at: datetime
    duration_ms: int | None
    row_count: int | None
    schema_info: list[dict[str, str]] | None
    error: dict[str, Any] | None


class RunHistoryResponse(BaseModel):
    id: UUID
    workflow_id: UUID
    parameters: dict[str, Any]
    status: str
    started_at: datetime
    completed_at: datetime | None
    duration_ms: int | None
    row_count: int | None
    schema_info: list[dict[str, str]] | None
    output_preview: dict[str, Any] | None
    error: dict[str, Any] | None
