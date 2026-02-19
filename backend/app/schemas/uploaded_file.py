from datetime import datetime

from pydantic import BaseModel


class UploadedFileResponse(BaseModel):
    id: str
    workflow_id: str
    filename: str
    file_type: str
    uploaded_at: datetime
