from datetime import datetime

from pydantic import BaseModel

from app.schemas.source import SourceResponse


class WorkflowParameter(BaseModel):
    name: str
    type: str
    default: str | None = None
    description: str | None = None


class WorkflowCreate(BaseModel):
    name: str
    description: str | None = None
    parameters: list[WorkflowParameter] = []


class WorkflowUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    query: str | None = None
    parameters: list[WorkflowParameter] | None = None


class WorkflowResponse(BaseModel):
    id: str
    name: str
    description: str | None
    query: str | None
    parameters: list[WorkflowParameter]
    created_at: datetime
    updated_at: datetime


class WorkflowSummaryResponse(BaseModel):
    id: str
    name: str
    description: str | None
    source_count: int
    created_at: datetime
    updated_at: datetime


class WorkflowDetailResponse(WorkflowResponse):
    sources: list[SourceResponse]
