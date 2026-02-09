from datetime import datetime
from uuid import UUID

from pydantic import BaseModel

from app.schemas.source import SourceResponse


class PipelineParameter(BaseModel):
    name: str
    type: str
    default: str | None = None
    description: str | None = None


class PipelineCreate(BaseModel):
    name: str
    description: str | None = None
    parameters: list[PipelineParameter] = []


class PipelineUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    query: str | None = None
    parameters: list[PipelineParameter] | None = None


class PipelineResponse(BaseModel):
    id: UUID
    name: str
    description: str | None
    query: str | None
    parameters: list[PipelineParameter]
    created_at: datetime
    updated_at: datetime


class PipelineSummaryResponse(BaseModel):
    id: UUID
    name: str
    description: str | None
    source_count: int
    created_at: datetime
    updated_at: datetime


class PipelineDetailResponse(PipelineResponse):
    sources: list[SourceResponse]
