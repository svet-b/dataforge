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
    schema_info: list[dict[str, str]]
    error: dict[str, Any] | None


class SourcePreviewResult(BaseModel):
    name: str
    row_count: int
    data: list[dict[str, Any]]
    schema_info: list[dict[str, str]]
    error: str | None = None


class SourcePreviewResponse(BaseModel):
    status: str
    duration_ms: int
    sources: list[SourcePreviewResult]


class CTEResultResponse(BaseModel):
    name: str
    ordinal: int
    row_count: int
    data: list[dict[str, Any]]
    schema_info: list[dict[str, str]]


class CTEInspectionResponse(BaseModel):
    status: str
    duration_ms: int
    ctes: list[CTEResultResponse]
    error: dict[str, Any] | None


class SourceSchemaResponse(BaseModel):
    columns: list[dict[str, str]]
    row_count: int
