from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.content_store import ContentStore
from app.models.run import RunHistory
from app.schemas.content import ContentResponse, QueryHistoryEntry

router = APIRouter(prefix="/api", tags=["content"])


@router.get("/content/{sha256}", response_model=ContentResponse)
def get_content(sha256: str, db: Session = Depends(get_db)) -> ContentResponse:
    entry = db.get(ContentStore, sha256)
    if entry is None:
        raise HTTPException(status_code=404, detail="Content not found")
    return ContentResponse(
        sha256=entry.sha256,
        kind=entry.kind,
        content=entry.content,
        byte_size=entry.byte_size,
    )


@router.get(
    "/workflows/{workflow_id}/query-history",
    response_model=list[QueryHistoryEntry],
)
def get_query_history(
    workflow_id: str, db: Session = Depends(get_db)
) -> list[QueryHistoryEntry]:
    rows = (
        db.query(
            RunHistory.query_hash,
            ContentStore.content,
            func.min(RunHistory.started_at).label("first_used"),
            func.max(RunHistory.started_at).label("last_used"),
            func.count().label("run_count"),
        )
        .join(ContentStore, RunHistory.query_hash == ContentStore.sha256)
        .filter(
            RunHistory.workflow_id == workflow_id,
            RunHistory.query_hash.isnot(None),
        )
        .group_by(RunHistory.query_hash, ContentStore.content)
        .order_by(func.max(RunHistory.started_at).desc())
        .all()
    )
    return [
        QueryHistoryEntry(
            query_hash=row.query_hash,
            query=row.content,
            first_used=row.first_used,
            last_used=row.last_used,
            run_count=row.run_count,
        )
        for row in rows
    ]
