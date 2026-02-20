from datetime import datetime

from pydantic import BaseModel


class ContentResponse(BaseModel):
    sha256: str
    kind: str
    content: str
    byte_size: int


class QueryHistoryEntry(BaseModel):
    query_hash: str
    query: str
    first_used: datetime
    last_used: datetime
    run_count: int
