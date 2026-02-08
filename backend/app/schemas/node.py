from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel


class NodeCreate(BaseModel):
    type: Literal["source_api", "source_file", "transform", "output"]
    name: str
    position_x: float = 0
    position_y: float = 0
    config: dict[str, Any] = {}
    output_table_name: str


class NodeUpdate(BaseModel):
    name: str | None = None
    position_x: float | None = None
    position_y: float | None = None
    config: dict[str, Any] | None = None
    output_table_name: str | None = None


class NodeResponse(BaseModel):
    id: UUID
    pipeline_id: UUID
    type: str
    name: str
    position_x: float
    position_y: float
    config: dict[str, Any]
    output_table_name: str
