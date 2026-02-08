from __future__ import annotations

import uuid
from datetime import UTC, date, datetime
from decimal import Decimal
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.engine.executor import PipelineExecutor
from app.models.pipeline import Pipeline
from app.models.run import RunHistory
from app.models.uploaded_file import UploadedFile
from app.schemas.execution import NodePreviewResponse, RunRequest, RunResponse

router = APIRouter(prefix="/api/pipelines", tags=["execution"])


_NodeList = list[dict[str, Any]]
_EdgeList = list[dict[str, Any]]


def _json_safe(obj: Any) -> Any:
    """Recursively convert non-JSON-serializable values to strings."""
    if isinstance(obj, dict):
        return {k: _json_safe(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_json_safe(v) for v in obj]
    if isinstance(obj, (datetime, date)):
        return obj.isoformat()
    if isinstance(obj, Decimal):
        return float(obj)
    return obj


def _load_pipeline(pipeline_id: str, db: Session) -> tuple[Pipeline, _NodeList, _EdgeList]:
    pipeline = db.get(Pipeline, pipeline_id)
    if not pipeline:
        raise HTTPException(status_code=404, detail="Pipeline not found")

    # Build a filename → storage_path lookup for uploaded files
    uploaded_files = (
        db.query(UploadedFile)
        .filter(UploadedFile.pipeline_id == pipeline_id)
        .all()
    )
    file_path_map = {uf.filename: uf.storage_path for uf in uploaded_files}

    nodes = []
    for n in pipeline.nodes:
        config = dict(n.config)
        # Resolve filename to file_path for source_file nodes
        if n.type == "source_file" and "filename" in config and "file_path" not in config:
            filename = config["filename"]
            if filename in file_path_map:
                config["file_path"] = file_path_map[filename]
        nodes.append(
            {
                "id": n.id,
                "type": n.type,
                "name": n.name,
                "config": config,
                "output_table_name": n.output_table_name,
            }
        )
    edges = [
        {
            "source_node_id": e.source_node_id,
            "target_node_id": e.target_node_id,
        }
        for e in pipeline.edges
    ]
    return pipeline, nodes, edges


def _merge_parameters(pipeline: Pipeline, supplied: dict[str, Any]) -> dict[str, Any]:
    """Merge supplied parameters with pipeline defaults."""
    merged: dict[str, Any] = {}
    for param in pipeline.parameters:
        name = param["name"]
        if name in supplied:
            merged[name] = supplied[name]
        elif param.get("default") is not None:
            merged[name] = param["default"]
    # Include any extra supplied parameters not in the schema
    for k, v in supplied.items():
        if k not in merged:
            merged[k] = v
    return merged


@router.post("/{pipeline_id}/run")
async def run_pipeline(
    pipeline_id: str,
    body: RunRequest,
    db: Session = Depends(get_db),
) -> RunResponse:
    pipeline, nodes, edges = _load_pipeline(pipeline_id, db)
    parameters = _merge_parameters(pipeline, body.parameters)

    executor = PipelineExecutor(settings)
    result = executor.execute(
        pipeline_id=pipeline_id,
        nodes=nodes,
        edges=edges,
        parameters=parameters,
    )
    exec_result = await result

    # Store run in run_history
    run_id = str(uuid.uuid4())
    now = datetime.now(UTC).isoformat()
    run = RunHistory(
        id=run_id,
        pipeline_id=pipeline_id,
        parameters=parameters,
        status=exec_result.status,
        started_at=now,
        completed_at=now,
        duration_ms=exec_result.duration_ms,
        row_count=exec_result.row_count,
        output_preview=_json_safe({"data": exec_result.data[:50]}) if exec_result.data else None,
        error=exec_result.error,
        node_timings=exec_result.node_timings,
    )
    db.add(run)
    db.commit()

    # Prune old runs
    runs = (
        db.query(RunHistory)
        .filter(RunHistory.pipeline_id == pipeline_id)
        .order_by(RunHistory.started_at.desc())
        .all()
    )
    if len(runs) > settings.max_run_history:
        for old_run in runs[settings.max_run_history :]:
            db.delete(old_run)
        db.commit()

    return RunResponse(
        run_id=run_id,
        status=exec_result.status,
        duration_ms=exec_result.duration_ms,
        row_count=exec_result.row_count,
        data=exec_result.data,
        error=exec_result.error,
        node_timings=exec_result.node_timings,
    )


@router.post("/{pipeline_id}/preview/{node_id}")
async def preview_node(
    pipeline_id: str,
    node_id: str,
    body: RunRequest,
    db: Session = Depends(get_db),
) -> NodePreviewResponse:
    pipeline, nodes, edges = _load_pipeline(pipeline_id, db)
    parameters = _merge_parameters(pipeline, body.parameters)

    # Verify node exists
    node_ids = {n["id"] for n in nodes}
    if node_id not in node_ids:
        raise HTTPException(status_code=404, detail="Node not found")

    executor = PipelineExecutor(settings)
    exec_result = await executor.execute(
        pipeline_id=pipeline_id,
        nodes=nodes,
        edges=edges,
        parameters=parameters,
        target_node_id=node_id,
    )

    # Get schema info from a fresh session if successful
    schema_info: list[dict[str, str]] = []
    if exec_result.status == "success" and exec_result.data:
        # Infer schema from the data keys
        if exec_result.data:
            schema_info = [{"name": k, "type": "VARCHAR"} for k in exec_result.data[0].keys()]

    return NodePreviewResponse(
        run_id=uuid.uuid4(),
        status=exec_result.status,
        duration_ms=exec_result.duration_ms,
        row_count=exec_result.row_count,
        data=exec_result.data,
        error=exec_result.error,
        node_timings=exec_result.node_timings,
        schema_info=schema_info,
    )
