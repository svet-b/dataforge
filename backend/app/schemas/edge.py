from uuid import UUID

from pydantic import BaseModel


class EdgeCreate(BaseModel):
    source_node_id: UUID
    target_node_id: UUID


class EdgeResponse(BaseModel):
    id: UUID
    pipeline_id: UUID
    source_node_id: UUID
    target_node_id: UUID
