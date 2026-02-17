from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel


class SourceCreate(BaseModel):
    table_name: str
    type: Literal["file", "api"]
    config: dict[str, Any] = {}


class SourceUpdate(BaseModel):
    table_name: str | None = None
    config: dict[str, Any] | None = None


class SourceResponse(BaseModel):
    id: UUID
    workflow_id: UUID
    table_name: str
    type: str
    config: dict[str, Any]
