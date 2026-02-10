from __future__ import annotations

import os
import re
import uuid
from datetime import UTC, datetime
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.models.pipeline import Pipeline
from app.models.run import RunHistory
from app.models.source import Source
from app.models.uploaded_file import UploadedFile
from app.schemas.pipeline import (
    PipelineCreate,
    PipelineDetailResponse,
    PipelineResponse,
    PipelineSummaryResponse,
    PipelineUpdate,
)
from app.schemas.run import RunHistoryResponse, RunHistorySummaryResponse
from app.schemas.source import SourceCreate, SourceResponse, SourceUpdate
from app.schemas.uploaded_file import UploadedFileResponse

router = APIRouter(prefix="/api/pipelines", tags=["pipelines"])

FILE_TYPE_MAP = {
    ".csv": "csv",
    ".json": "json",
    ".parquet": "parquet",
    ".xlsx": "excel",
    ".xls": "excel",
}

TABLE_NAME_PATTERN = re.compile(r"^[a-zA-Z_][a-zA-Z0-9_]*$")


def _get_pipeline_or_404(pipeline_id: str, db: Session) -> Pipeline:
    pipeline = db.get(Pipeline, pipeline_id)
    if not pipeline:
        raise HTTPException(status_code=404, detail="Pipeline not found")
    return pipeline


def _touch_pipeline(pipeline: Pipeline) -> None:
    pipeline.updated_at = datetime.now(UTC).isoformat()


def _validate_table_name(
    name: str,
    pipeline_id: str,
    db: Session,
    exclude_source_id: str | None = None,
) -> str | None:
    """Returns error message if invalid, None if valid."""
    if not TABLE_NAME_PATTERN.match(name):
        return f"Invalid table name '{name}'. Must be a valid SQL identifier."
    query = db.query(Source).filter(
        Source.pipeline_id == pipeline_id,
        Source.table_name == name,
    )
    if exclude_source_id:
        query = query.filter(Source.id != exclude_source_id)
    if query.first():
        return f"A source with table_name '{name}' already exists in this pipeline"
    return None


# ── Pipeline CRUD ──────────────────────────────────────────────


@router.get("", response_model=list[PipelineSummaryResponse])
def list_pipelines(db: Session = Depends(get_db)) -> list[PipelineSummaryResponse]:
    pipelines = db.query(Pipeline).order_by(Pipeline.updated_at.desc()).all()
    return [
        PipelineSummaryResponse(
            id=p.id,
            name=p.name,
            description=p.description,
            source_count=len(p.sources),
            created_at=p.created_at,
            updated_at=p.updated_at,
        )
        for p in pipelines
    ]


@router.post("", response_model=PipelineResponse, status_code=201)
def create_pipeline(body: PipelineCreate, db: Session = Depends(get_db)) -> PipelineResponse:
    pipeline = Pipeline(
        name=body.name,
        description=body.description,
        parameters=[p.model_dump() for p in body.parameters],
    )
    db.add(pipeline)
    db.commit()
    db.refresh(pipeline)
    return PipelineResponse(
        id=pipeline.id,
        name=pipeline.name,
        description=pipeline.description,
        query=pipeline.query,
        parameters=pipeline.parameters,
        created_at=pipeline.created_at,
        updated_at=pipeline.updated_at,
    )


@router.get("/{pipeline_id}", response_model=PipelineDetailResponse)
def get_pipeline(pipeline_id: str, db: Session = Depends(get_db)) -> PipelineDetailResponse:
    pipeline = _get_pipeline_or_404(pipeline_id, db)
    return PipelineDetailResponse(
        id=pipeline.id,
        name=pipeline.name,
        description=pipeline.description,
        query=pipeline.query,
        parameters=pipeline.parameters,
        created_at=pipeline.created_at,
        updated_at=pipeline.updated_at,
        sources=[
            SourceResponse(
                id=s.id,
                pipeline_id=s.pipeline_id,
                table_name=s.table_name,
                type=s.type,
                config=s.config,
            )
            for s in pipeline.sources
        ],
    )


@router.put("/{pipeline_id}", response_model=PipelineResponse)
def update_pipeline(
    pipeline_id: str, body: PipelineUpdate, db: Session = Depends(get_db)
) -> PipelineResponse:
    pipeline = _get_pipeline_or_404(pipeline_id, db)
    if body.name is not None:
        pipeline.name = body.name
    if body.description is not None:
        pipeline.description = body.description
    if body.query is not None:
        pipeline.query = body.query
    if body.parameters is not None:
        pipeline.parameters = [p.model_dump() for p in body.parameters]
    _touch_pipeline(pipeline)
    db.commit()
    db.refresh(pipeline)
    return PipelineResponse(
        id=pipeline.id,
        name=pipeline.name,
        description=pipeline.description,
        query=pipeline.query,
        parameters=pipeline.parameters,
        created_at=pipeline.created_at,
        updated_at=pipeline.updated_at,
    )


@router.delete("/{pipeline_id}", status_code=204)
def delete_pipeline(pipeline_id: str, db: Session = Depends(get_db)) -> None:
    pipeline = _get_pipeline_or_404(pipeline_id, db)
    # Clean up uploaded files from disk
    for f in pipeline.uploaded_files:
        try:
            os.remove(f.storage_path)
        except OSError:
            pass
    db.delete(pipeline)
    db.commit()


# ── Source CRUD ────────────────────────────────────────────────


@router.post("/{pipeline_id}/sources", response_model=SourceResponse, status_code=201)
def add_source(
    pipeline_id: str, body: SourceCreate, db: Session = Depends(get_db)
) -> SourceResponse:
    pipeline = _get_pipeline_or_404(pipeline_id, db)
    error = _validate_table_name(body.table_name, pipeline_id, db)
    if error:
        status = 409 if "already exists" in error else 400
        raise HTTPException(status_code=status, detail=error)
    source = Source(
        pipeline_id=pipeline_id,
        table_name=body.table_name,
        type=body.type,
        config=body.config,
    )
    db.add(source)
    _touch_pipeline(pipeline)
    db.commit()
    db.refresh(source)
    return SourceResponse(
        id=source.id,
        pipeline_id=source.pipeline_id,
        table_name=source.table_name,
        type=source.type,
        config=source.config,
    )


@router.put("/{pipeline_id}/sources/{source_id}", response_model=SourceResponse)
def update_source(
    pipeline_id: str,
    source_id: str,
    body: SourceUpdate,
    db: Session = Depends(get_db),
) -> SourceResponse:
    pipeline = _get_pipeline_or_404(pipeline_id, db)
    source = db.get(Source, source_id)
    if not source or source.pipeline_id != pipeline_id:
        raise HTTPException(status_code=404, detail="Source not found")
    if body.table_name is not None:
        error = _validate_table_name(body.table_name, pipeline_id, db, exclude_source_id=source_id)
        if error:
            status = 409 if "already exists" in error else 400
            raise HTTPException(status_code=status, detail=error)
        source.table_name = body.table_name
    if body.config is not None:
        source.config = body.config
    _touch_pipeline(pipeline)
    db.commit()
    db.refresh(source)
    return SourceResponse(
        id=source.id,
        pipeline_id=source.pipeline_id,
        table_name=source.table_name,
        type=source.type,
        config=source.config,
    )


@router.delete("/{pipeline_id}/sources/{source_id}", status_code=204)
def delete_source(pipeline_id: str, source_id: str, db: Session = Depends(get_db)) -> None:
    pipeline = _get_pipeline_or_404(pipeline_id, db)
    source = db.get(Source, source_id)
    if not source or source.pipeline_id != pipeline_id:
        raise HTTPException(status_code=404, detail="Source not found")
    db.delete(source)
    _touch_pipeline(pipeline)
    db.commit()


# ── File Upload ────────────────────────────────────────────────


@router.post("/{pipeline_id}/files", response_model=UploadedFileResponse, status_code=201)
async def upload_file(
    pipeline_id: str,
    file: UploadFile,
    db: Session = Depends(get_db),
) -> UploadedFileResponse:
    _get_pipeline_or_404(pipeline_id, db)
    filename = file.filename or "unknown"
    ext = Path(filename).suffix.lower()
    file_type = FILE_TYPE_MAP.get(ext, "csv")

    file_id = str(uuid.uuid4())
    dir_path = Path(settings.data_dir) / "files" / pipeline_id
    dir_path.mkdir(parents=True, exist_ok=True)
    storage_path = dir_path / f"{file_id}_{filename}"

    content = await file.read()
    storage_path.write_bytes(content)

    record = UploadedFile(
        id=file_id,
        pipeline_id=pipeline_id,
        filename=filename,
        file_type=file_type,
        storage_path=str(storage_path),
    )
    db.add(record)
    db.commit()
    db.refresh(record)
    return UploadedFileResponse(
        id=record.id,
        pipeline_id=record.pipeline_id,
        filename=record.filename,
        file_type=record.file_type,
        uploaded_at=record.uploaded_at,
    )


@router.get("/{pipeline_id}/files", response_model=list[UploadedFileResponse])
def list_files(pipeline_id: str, db: Session = Depends(get_db)) -> list[UploadedFileResponse]:
    _get_pipeline_or_404(pipeline_id, db)
    files = db.query(UploadedFile).filter(UploadedFile.pipeline_id == pipeline_id).all()
    return [
        UploadedFileResponse(
            id=f.id,
            pipeline_id=f.pipeline_id,
            filename=f.filename,
            file_type=f.file_type,
            uploaded_at=f.uploaded_at,
        )
        for f in files
    ]


@router.delete("/{pipeline_id}/files/{file_id}", status_code=204)
def delete_file(pipeline_id: str, file_id: str, db: Session = Depends(get_db)) -> None:
    _get_pipeline_or_404(pipeline_id, db)
    record = db.get(UploadedFile, file_id)
    if not record or record.pipeline_id != pipeline_id:
        raise HTTPException(status_code=404, detail="File not found")
    try:
        os.remove(record.storage_path)
    except OSError:
        pass
    db.delete(record)
    db.commit()


# ── Run History ────────────────────────────────────────────────


@router.get("/{pipeline_id}/runs", response_model=list[RunHistorySummaryResponse])
def list_runs(
    pipeline_id: str,
    limit: int = Query(default=20, le=100),
    db: Session = Depends(get_db),
) -> list[RunHistorySummaryResponse]:
    _get_pipeline_or_404(pipeline_id, db)
    runs = (
        db.query(RunHistory)
        .filter(RunHistory.pipeline_id == pipeline_id)
        .order_by(RunHistory.started_at.desc())
        .limit(limit)
        .all()
    )
    return [
        RunHistorySummaryResponse(
            id=r.id,
            pipeline_id=r.pipeline_id,
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


@router.get("/{pipeline_id}/runs/{run_id}", response_model=RunHistoryResponse)
def get_run(pipeline_id: str, run_id: str, db: Session = Depends(get_db)) -> RunHistoryResponse:
    _get_pipeline_or_404(pipeline_id, db)
    run = db.get(RunHistory, run_id)
    if not run or run.pipeline_id != pipeline_id:
        raise HTTPException(status_code=404, detail="Run not found")
    return RunHistoryResponse(
        id=run.id,
        pipeline_id=run.pipeline_id,
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
