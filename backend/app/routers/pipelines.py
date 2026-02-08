from __future__ import annotations

import os
import uuid
from datetime import UTC, datetime
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.models.edge import Edge
from app.models.node import Node
from app.models.pipeline import Pipeline
from app.models.run import RunHistory
from app.models.uploaded_file import UploadedFile
from app.schemas.edge import EdgeCreate, EdgeResponse
from app.schemas.node import NodeCreate, NodeResponse, NodeUpdate
from app.schemas.pipeline import (
    PipelineCreate,
    PipelineDetailResponse,
    PipelineResponse,
    PipelineSummaryResponse,
    PipelineUpdate,
)
from app.schemas.run import RunHistoryResponse, RunHistorySummaryResponse
from app.schemas.uploaded_file import UploadedFileResponse
from app.services.validation import validate_no_cycles, validate_table_name

router = APIRouter(prefix="/api/pipelines", tags=["pipelines"])

FILE_TYPE_MAP = {
    ".csv": "csv",
    ".json": "json",
    ".parquet": "parquet",
    ".xlsx": "excel",
    ".xls": "excel",
}


def _get_pipeline_or_404(pipeline_id: str, db: Session) -> Pipeline:
    pipeline = db.get(Pipeline, pipeline_id)
    if not pipeline:
        raise HTTPException(status_code=404, detail="Pipeline not found")
    return pipeline


def _touch_pipeline(pipeline: Pipeline) -> None:
    pipeline.updated_at = datetime.now(UTC).isoformat()


# ── Pipeline CRUD ──────────────────────────────────────────────


@router.get("", response_model=list[PipelineSummaryResponse])
def list_pipelines(db: Session = Depends(get_db)) -> list[PipelineSummaryResponse]:
    pipelines = db.query(Pipeline).order_by(Pipeline.updated_at.desc()).all()
    return [
        PipelineSummaryResponse(
            id=p.id,
            name=p.name,
            description=p.description,
            parameter_count=len(p.parameters),
            node_count=len(p.nodes),
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
        parameters=pipeline.parameters,
        created_at=pipeline.created_at,
        updated_at=pipeline.updated_at,
        nodes=[
            NodeResponse(
                id=n.id,
                pipeline_id=n.pipeline_id,
                type=n.type,
                name=n.name,
                position_x=n.position_x,
                position_y=n.position_y,
                config=n.config,
                output_table_name=n.output_table_name,
            )
            for n in pipeline.nodes
        ],
        edges=[
            EdgeResponse(
                id=e.id,
                pipeline_id=e.pipeline_id,
                source_node_id=e.source_node_id,
                target_node_id=e.target_node_id,
            )
            for e in pipeline.edges
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
    if body.parameters is not None:
        pipeline.parameters = [p.model_dump() for p in body.parameters]
    _touch_pipeline(pipeline)
    db.commit()
    db.refresh(pipeline)
    return PipelineResponse(
        id=pipeline.id,
        name=pipeline.name,
        description=pipeline.description,
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


# ── Node CRUD ──────────────────────────────────────────────────


@router.post("/{pipeline_id}/nodes", response_model=NodeResponse, status_code=201)
def add_node(pipeline_id: str, body: NodeCreate, db: Session = Depends(get_db)) -> NodeResponse:
    pipeline = _get_pipeline_or_404(pipeline_id, db)
    error = validate_table_name(body.output_table_name, pipeline_id, db)
    if error:
        status = 409 if "already exists" in error else 400
        raise HTTPException(status_code=status, detail=error)
    node = Node(
        pipeline_id=pipeline_id,
        type=body.type,
        name=body.name,
        position_x=body.position_x,
        position_y=body.position_y,
        config=body.config,
        output_table_name=body.output_table_name,
    )
    db.add(node)
    _touch_pipeline(pipeline)
    db.commit()
    db.refresh(node)
    return NodeResponse(
        id=node.id,
        pipeline_id=node.pipeline_id,
        type=node.type,
        name=node.name,
        position_x=node.position_x,
        position_y=node.position_y,
        config=node.config,
        output_table_name=node.output_table_name,
    )


@router.put("/{pipeline_id}/nodes/{node_id}", response_model=NodeResponse)
def update_node(
    pipeline_id: str,
    node_id: str,
    body: NodeUpdate,
    db: Session = Depends(get_db),
) -> NodeResponse:
    pipeline = _get_pipeline_or_404(pipeline_id, db)
    node = db.get(Node, node_id)
    if not node or node.pipeline_id != pipeline_id:
        raise HTTPException(status_code=404, detail="Node not found")
    if body.output_table_name is not None:
        error = validate_table_name(
            body.output_table_name, pipeline_id, db, exclude_node_id=node_id
        )
        if error:
            status = 409 if "already exists" in error else 400
            raise HTTPException(status_code=status, detail=error)
        node.output_table_name = body.output_table_name
    if body.name is not None:
        node.name = body.name
    if body.position_x is not None:
        node.position_x = body.position_x
    if body.position_y is not None:
        node.position_y = body.position_y
    if body.config is not None:
        node.config = body.config
    _touch_pipeline(pipeline)
    db.commit()
    db.refresh(node)
    return NodeResponse(
        id=node.id,
        pipeline_id=node.pipeline_id,
        type=node.type,
        name=node.name,
        position_x=node.position_x,
        position_y=node.position_y,
        config=node.config,
        output_table_name=node.output_table_name,
    )


@router.delete("/{pipeline_id}/nodes/{node_id}", status_code=204)
def delete_node(pipeline_id: str, node_id: str, db: Session = Depends(get_db)) -> None:
    pipeline = _get_pipeline_or_404(pipeline_id, db)
    node = db.get(Node, node_id)
    if not node or node.pipeline_id != pipeline_id:
        raise HTTPException(status_code=404, detail="Node not found")
    # Delete connected edges
    db.query(Edge).filter(
        Edge.pipeline_id == pipeline_id,
        (Edge.source_node_id == node_id) | (Edge.target_node_id == node_id),
    ).delete()
    db.delete(node)
    _touch_pipeline(pipeline)
    db.commit()


# ── Edge CRUD ──────────────────────────────────────────────────


@router.post("/{pipeline_id}/edges", response_model=EdgeResponse, status_code=201)
def add_edge(pipeline_id: str, body: EdgeCreate, db: Session = Depends(get_db)) -> EdgeResponse:
    _get_pipeline_or_404(pipeline_id, db)
    source_id = str(body.source_node_id)
    target_id = str(body.target_node_id)

    # Validate both nodes exist and belong to this pipeline
    source_node = db.get(Node, source_id)
    target_node = db.get(Node, target_id)
    if not source_node or source_node.pipeline_id != pipeline_id:
        raise HTTPException(status_code=400, detail="Source node not found in this pipeline")
    if not target_node or target_node.pipeline_id != pipeline_id:
        raise HTTPException(status_code=400, detail="Target node not found in this pipeline")

    # Check for duplicate
    existing = (
        db.query(Edge)
        .filter(
            Edge.pipeline_id == pipeline_id,
            Edge.source_node_id == source_id,
            Edge.target_node_id == target_id,
        )
        .first()
    )
    if existing:
        raise HTTPException(status_code=409, detail="This edge already exists")

    # Check for cycles
    error = validate_no_cycles(pipeline_id, source_id, target_id, db)
    if error:
        raise HTTPException(status_code=400, detail=error)

    edge = Edge(
        pipeline_id=pipeline_id,
        source_node_id=source_id,
        target_node_id=target_id,
    )
    db.add(edge)
    db.commit()
    db.refresh(edge)
    return EdgeResponse(
        id=edge.id,
        pipeline_id=edge.pipeline_id,
        source_node_id=edge.source_node_id,
        target_node_id=edge.target_node_id,
    )


@router.delete("/{pipeline_id}/edges/{edge_id}", status_code=204)
def delete_edge(pipeline_id: str, edge_id: str, db: Session = Depends(get_db)) -> None:
    _get_pipeline_or_404(pipeline_id, db)
    edge = db.get(Edge, edge_id)
    if not edge or edge.pipeline_id != pipeline_id:
        raise HTTPException(status_code=404, detail="Edge not found")
    db.delete(edge)
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
        output_preview=run.output_preview,
        error=run.error,
        node_timings=run.node_timings,
    )
