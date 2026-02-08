from datetime import datetime
from uuid import UUID

from pydantic import BaseModel


class UploadedFileResponse(BaseModel):
    id: UUID
    pipeline_id: UUID
    filename: str
    file_type: str
    uploaded_at: datetime
