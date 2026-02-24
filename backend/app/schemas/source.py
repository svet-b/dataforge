from typing import Any, Literal

from pydantic import BaseModel


class SourceCreate(BaseModel):
    table_name: str
    type: Literal["file", "api", "ammp"]
    config: dict[str, Any] = {}


class SourceUpdate(BaseModel):
    table_name: str | None = None
    config: dict[str, Any] | None = None


class SourceResponse(BaseModel):
    id: str
    workflow_id: str
    table_name: str
    type: str
    config: dict[str, Any]
