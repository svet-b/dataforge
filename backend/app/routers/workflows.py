from __future__ import annotations

import os
import re
from datetime import UTC, datetime
from pathlib import Path

from cuid2 import cuid_wrapper
from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.models.run import RunHistory
from app.models.source import Source
from app.models.uploaded_file import UploadedFile
from app.models.workflow import Workflow
from app.schemas.run import RunHistoryResponse, RunHistorySummaryResponse
from app.schemas.source import SourceCreate, SourceResponse, SourceUpdate
from app.schemas.uploaded_file import UploadedFileResponse
from app.schemas.workflow import (
    WorkflowCreate,
    WorkflowDetailResponse,
    WorkflowResponse,
    WorkflowSummaryResponse,
    WorkflowUpdate,
)

generate_cuid = cuid_wrapper()

router = APIRouter(prefix="/api/workflows", tags=["workflows"])

FILE_TYPE_MAP = {
    ".csv": "csv",
    ".json": "json",
    ".parquet": "parquet",
    ".xlsx": "excel",
    ".xls": "excel",
}

TABLE_NAME_PATTERN = re.compile(r"^[a-zA-Z_][a-zA-Z0-9_]*$")


def _get_workflow_or_404(workflow_id: str, db: Session) -> Workflow:
    workflow = db.get(Workflow, workflow_id)
    if not workflow:
        raise HTTPException(status_code=404, detail="Workflow not found")
    return workflow


def _touch_workflow(workflow: Workflow) -> None:
    workflow.updated_at = datetime.now(UTC).isoformat()


def _validate_table_name(
    name: str,
    workflow_id: str,
    db: Session,
    exclude_source_id: str | None = None,
) -> str | None:
    """Returns error message if invalid, None if valid."""
    if not TABLE_NAME_PATTERN.match(name):
        return f"Invalid table name '{name}'. Must be a valid SQL identifier."
    query = db.query(Source).filter(
        Source.workflow_id == workflow_id,
        Source.table_name == name,
    )
    if exclude_source_id:
        query = query.filter(Source.id != exclude_source_id)
    if query.first():
        return f"A source with table_name '{name}' already exists in this workflow"
    return None


# ── Workflow CRUD ──────────────────────────────────────────────


@router.get("", response_model=list[WorkflowSummaryResponse])
def list_workflows(db: Session = Depends(get_db)) -> list[WorkflowSummaryResponse]:
    workflows = db.query(Workflow).order_by(Workflow.updated_at.desc()).all()
    return [
        WorkflowSummaryResponse(
            id=w.id,
            name=w.name,
            description=w.description,
            source_count=len(w.sources),
            created_at=w.created_at,
            updated_at=w.updated_at,
        )
        for w in workflows
    ]


@router.post("", response_model=WorkflowResponse, status_code=201)
def create_workflow(body: WorkflowCreate, db: Session = Depends(get_db)) -> WorkflowResponse:
    workflow = Workflow(
        name=body.name,
        description=body.description,
        parameters=[p.model_dump() for p in body.parameters],
    )
    db.add(workflow)
    db.commit()
    db.refresh(workflow)
    return WorkflowResponse(
        id=workflow.id,
        name=workflow.name,
        description=workflow.description,
        query=workflow.query,
        parameters=workflow.parameters,
        created_at=workflow.created_at,
        updated_at=workflow.updated_at,
    )


@router.get("/{workflow_id}", response_model=WorkflowDetailResponse)
def get_workflow(workflow_id: str, db: Session = Depends(get_db)) -> WorkflowDetailResponse:
    workflow = _get_workflow_or_404(workflow_id, db)
    return WorkflowDetailResponse(
        id=workflow.id,
        name=workflow.name,
        description=workflow.description,
        query=workflow.query,
        parameters=workflow.parameters,
        created_at=workflow.created_at,
        updated_at=workflow.updated_at,
        sources=[
            SourceResponse(
                id=s.id,
                workflow_id=s.workflow_id,
                table_name=s.table_name,
                type=s.type,
                config=s.config,
            )
            for s in workflow.sources
        ],
    )


@router.put("/{workflow_id}", response_model=WorkflowResponse)
def update_workflow(
    workflow_id: str, body: WorkflowUpdate, db: Session = Depends(get_db)
) -> WorkflowResponse:
    workflow = _get_workflow_or_404(workflow_id, db)
    if body.name is not None:
        workflow.name = body.name
    if body.description is not None:
        workflow.description = body.description
    if body.query is not None:
        workflow.query = body.query
    if body.parameters is not None:
        workflow.parameters = [p.model_dump() for p in body.parameters]
    _touch_workflow(workflow)
    db.commit()
    db.refresh(workflow)
    return WorkflowResponse(
        id=workflow.id,
        name=workflow.name,
        description=workflow.description,
        query=workflow.query,
        parameters=workflow.parameters,
        created_at=workflow.created_at,
        updated_at=workflow.updated_at,
    )


@router.delete("/{workflow_id}", status_code=204)
def delete_workflow(workflow_id: str, db: Session = Depends(get_db)) -> None:
    workflow = _get_workflow_or_404(workflow_id, db)
    # Clean up uploaded files from disk
    for f in workflow.uploaded_files:
        try:
            os.remove(f.storage_path)
        except OSError:
            pass
    db.delete(workflow)
    db.commit()


# ── Source CRUD ────────────────────────────────────────────────


@router.post("/{workflow_id}/sources", response_model=SourceResponse, status_code=201)
def add_source(
    workflow_id: str, body: SourceCreate, db: Session = Depends(get_db)
) -> SourceResponse:
    workflow = _get_workflow_or_404(workflow_id, db)
    error = _validate_table_name(body.table_name, workflow_id, db)
    if error:
        status = 409 if "already exists" in error else 400
        raise HTTPException(status_code=status, detail=error)
    source = Source(
        workflow_id=workflow_id,
        table_name=body.table_name,
        type=body.type,
        config=body.config,
    )
    db.add(source)
    _touch_workflow(workflow)
    db.commit()
    db.refresh(source)
    return SourceResponse(
        id=source.id,
        workflow_id=source.workflow_id,
        table_name=source.table_name,
        type=source.type,
        config=source.config,
    )


@router.put("/{workflow_id}/sources/{source_id}", response_model=SourceResponse)
def update_source(
    workflow_id: str,
    source_id: str,
    body: SourceUpdate,
    db: Session = Depends(get_db),
) -> SourceResponse:
    workflow = _get_workflow_or_404(workflow_id, db)
    source = db.get(Source, source_id)
    if not source or source.workflow_id != workflow_id:
        raise HTTPException(status_code=404, detail="Source not found")
    if body.table_name is not None:
        error = _validate_table_name(body.table_name, workflow_id, db, exclude_source_id=source_id)
        if error:
            status = 409 if "already exists" in error else 400
            raise HTTPException(status_code=status, detail=error)
        source.table_name = body.table_name
    if body.config is not None:
        source.config = body.config
    _touch_workflow(workflow)
    db.commit()
    db.refresh(source)
    return SourceResponse(
        id=source.id,
        workflow_id=source.workflow_id,
        table_name=source.table_name,
        type=source.type,
        config=source.config,
    )


@router.delete("/{workflow_id}/sources/{source_id}", status_code=204)
def delete_source(workflow_id: str, source_id: str, db: Session = Depends(get_db)) -> None:
    workflow = _get_workflow_or_404(workflow_id, db)
    source = db.get(Source, source_id)
    if not source or source.workflow_id != workflow_id:
        raise HTTPException(status_code=404, detail="Source not found")
    db.delete(source)
    _touch_workflow(workflow)
    db.commit()


# ── File Upload ────────────────────────────────────────────────


@router.post("/{workflow_id}/files", response_model=UploadedFileResponse, status_code=201)
async def upload_file(
    workflow_id: str,
    file: UploadFile,
    db: Session = Depends(get_db),
) -> UploadedFileResponse:
    _get_workflow_or_404(workflow_id, db)
    filename = file.filename or "unknown"
    ext = Path(filename).suffix.lower()
    file_type = FILE_TYPE_MAP.get(ext, "csv")

    file_id = generate_cuid()
    dir_path = Path(settings.data_dir) / "files" / workflow_id
    dir_path.mkdir(parents=True, exist_ok=True)
    storage_path = dir_path / f"{file_id}_{filename}"

    content = await file.read()
    storage_path.write_bytes(content)

    record = UploadedFile(
        id=file_id,
        workflow_id=workflow_id,
        filename=filename,
        file_type=file_type,
        storage_path=str(storage_path),
    )
    db.add(record)
    db.commit()
    db.refresh(record)
    return UploadedFileResponse(
        id=record.id,
        workflow_id=record.workflow_id,
        filename=record.filename,
        file_type=record.file_type,
        uploaded_at=record.uploaded_at,
    )


@router.get("/{workflow_id}/files", response_model=list[UploadedFileResponse])
def list_files(workflow_id: str, db: Session = Depends(get_db)) -> list[UploadedFileResponse]:
    _get_workflow_or_404(workflow_id, db)
    files = db.query(UploadedFile).filter(UploadedFile.workflow_id == workflow_id).all()
    return [
        UploadedFileResponse(
            id=f.id,
            workflow_id=f.workflow_id,
            filename=f.filename,
            file_type=f.file_type,
            uploaded_at=f.uploaded_at,
        )
        for f in files
    ]


@router.delete("/{workflow_id}/files/{file_id}", status_code=204)
def delete_file(workflow_id: str, file_id: str, db: Session = Depends(get_db)) -> None:
    _get_workflow_or_404(workflow_id, db)
    record = db.get(UploadedFile, file_id)
    if not record or record.workflow_id != workflow_id:
        raise HTTPException(status_code=404, detail="File not found")
    try:
        os.remove(record.storage_path)
    except OSError:
        pass
    db.delete(record)
    db.commit()


# ── Run History ────────────────────────────────────────────────


@router.get("/{workflow_id}/runs", response_model=list[RunHistorySummaryResponse])
def list_runs(
    workflow_id: str,
    limit: int = Query(default=20, le=100),
    db: Session = Depends(get_db),
) -> list[RunHistorySummaryResponse]:
    _get_workflow_or_404(workflow_id, db)
    runs = (
        db.query(RunHistory)
        .filter(RunHistory.workflow_id == workflow_id)
        .order_by(RunHistory.started_at.desc())
        .limit(limit)
        .all()
    )
    return [
        RunHistorySummaryResponse(
            id=r.id,
            workflow_id=r.workflow_id,
            parameters=r.parameters,
            status=r.status,
            started_at=r.started_at,
            duration_ms=r.duration_ms,
            row_count=r.row_count,
            schema_info=r.schema_info,
            error=r.error,
        )
        for r in runs
    ]


@router.get("/{workflow_id}/runs/{run_id}", response_model=RunHistoryResponse)
def get_run(workflow_id: str, run_id: str, db: Session = Depends(get_db)) -> RunHistoryResponse:
    _get_workflow_or_404(workflow_id, db)
    run = db.get(RunHistory, run_id)
    if not run or run.workflow_id != workflow_id:
        raise HTTPException(status_code=404, detail="Run not found")
    return RunHistoryResponse(
        id=run.id,
        workflow_id=run.workflow_id,
        parameters=run.parameters,
        status=run.status,
        started_at=run.started_at,
        completed_at=run.completed_at,
        duration_ms=run.duration_ms,
        row_count=run.row_count,
        schema_info=run.schema_info,
        output_preview=run.output_preview,
        error=run.error,
    )
