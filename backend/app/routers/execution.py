from __future__ import annotations

import csv
import io
import json
import uuid
from datetime import UTC, date, datetime
from decimal import Decimal
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.engine.executor import PipelineExecutor
from app.models.pipeline import Pipeline
from app.models.run import RunHistory
from app.models.uploaded_file import UploadedFile
from app.schemas.execution import CTEInspectionResponse, RunRequest, RunResponse

router = APIRouter(prefix="/api/pipelines", tags=["execution"])


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


def _load_pipeline(
    pipeline_id: str, db: Session
) -> tuple[Pipeline, list[dict[str, Any]], str | None]:
    """Load pipeline, its sources (with file paths resolved), and its query."""
    pipeline = db.get(Pipeline, pipeline_id)
    if not pipeline:
        raise HTTPException(status_code=404, detail="Pipeline not found")

    # Build a filename → storage_path lookup for uploaded files
    uploaded_files = db.query(UploadedFile).filter(UploadedFile.pipeline_id == pipeline_id).all()
    file_path_map = {uf.filename: uf.storage_path for uf in uploaded_files}

    sources = []
    for s in pipeline.sources:
        config = dict(s.config)
        # Resolve filename to file_path for file sources
        if s.type == "file" and "filename" in config and "file_path" not in config:
            filename = config["filename"]
            if filename in file_path_map:
                config["file_path"] = file_path_map[filename]
        sources.append(
            {
                "id": s.id,
                "type": s.type,
                "table_name": s.table_name,
                "config": config,
            }
        )
    return pipeline, sources, pipeline.query


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
    pipeline, sources, query = _load_pipeline(pipeline_id, db)
    if not query or not query.strip():
        raise HTTPException(status_code=400, detail="Pipeline has no query defined")
    parameters = _merge_parameters(pipeline, body.parameters)

    executor = PipelineExecutor(settings)
    exec_result = await executor.execute(
        pipeline_id=pipeline_id,
        sources=sources,
        query=query,
        parameters=parameters,
    )

    schema_info: list[dict[str, str]] = []
    if exec_result.status == "success" and exec_result.schema_info:
        schema_info = exec_result.schema_info

    # Store run in run_history (keep up to 10k rows for downloads)
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
        schema_info=schema_info,
        output_preview=(
            _json_safe({"data": exec_result.data[:10_000]}) if exec_result.data else None
        ),
        error=exec_result.error,
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

    # Return data capped at 100 rows for the UI
    return RunResponse(
        run_id=run_id,
        status=exec_result.status,
        duration_ms=exec_result.duration_ms,
        row_count=exec_result.row_count,
        data=_json_safe(exec_result.data[:100]) if exec_result.data else None,
        schema_info=schema_info,
        error=exec_result.error,
    )


@router.post("/{pipeline_id}/inspect-ctes")
async def inspect_ctes(
    pipeline_id: str,
    body: RunRequest,
    db: Session = Depends(get_db),
) -> CTEInspectionResponse:
    """Inspect intermediate CTE results without creating a run history entry."""
    pipeline, sources, query = _load_pipeline(pipeline_id, db)
    if not query or not query.strip():
        raise HTTPException(status_code=400, detail="Pipeline has no query defined")
    parameters = _merge_parameters(pipeline, body.parameters)

    executor = PipelineExecutor(settings)
    result = await executor.inspect_ctes(
        pipeline_id=pipeline_id,
        sources=sources,
        query=query,
        parameters=parameters,
    )

    return CTEInspectionResponse(
        status=result.status,
        duration_ms=result.duration_ms,
        ctes=[
            {
                "name": c.name,
                "ordinal": c.ordinal,
                "row_count": c.row_count,
                "data": _json_safe(c.data),
                "schema_info": c.schema_info,
            }
            for c in result.ctes
        ],
        error=result.error,
    )


@router.post("/{pipeline_id}/describe-sources")
async def describe_sources(
    pipeline_id: str,
    db: Session = Depends(get_db),
) -> list[dict[str, Any]]:
    """Load each source into a temporary DuckDB session and return schema info.

    Returns: [{"name": "table_name", "columns": [{"name": "col", "type": "VARCHAR"}, ...]}]
    """
    pipeline, sources, _query = _load_pipeline(pipeline_id, db)
    if not sources:
        return []

    from app.engine.duckdb_manager import DuckDBSession

    executor = PipelineExecutor(settings)
    session = DuckDBSession(memory_limit_mb=settings.execution_max_memory_mb)
    result: list[dict[str, Any]] = []
    try:
        for source in sources:
            try:
                await executor._load_source(session, source, {})
                schema = session.get_table_schema(source["table_name"])
                result.append({"name": source["table_name"], "columns": schema})
            except Exception:
                # If a source fails to load, skip it (e.g., missing file)
                result.append({"name": source["table_name"], "columns": []})
    finally:
        session.close()

    return result


@router.get("/{pipeline_id}/runs/{run_id}/download")
def download_run(
    pipeline_id: str,
    run_id: str,
    format: str = Query(default="csv", pattern="^(csv|json)$"),
    db: Session = Depends(get_db),
) -> StreamingResponse:
    pipeline = db.get(Pipeline, pipeline_id)
    if not pipeline:
        raise HTTPException(status_code=404, detail="Pipeline not found")
    run = db.get(RunHistory, run_id)
    if not run or run.pipeline_id != pipeline_id:
        raise HTTPException(status_code=404, detail="Run not found")
    if run.status != "success" or not run.output_preview:
        raise HTTPException(status_code=400, detail="Run has no output data")

    data = run.output_preview.get("data", [])
    if not data:
        raise HTTPException(status_code=400, detail="Run has no output data")

    if format == "json":
        content = json.dumps(data, indent=2, default=str)
        return StreamingResponse(
            io.BytesIO(content.encode()),
            media_type="application/json",
            headers={"Content-Disposition": f"attachment; filename=run_{run_id}.json"},
        )
    else:
        output = io.StringIO()
        writer = csv.DictWriter(output, fieldnames=list(data[0].keys()))
        writer.writeheader()
        writer.writerows(data)
        return StreamingResponse(
            io.BytesIO(output.getvalue().encode()),
            media_type="text/csv",
            headers={"Content-Disposition": f"attachment; filename=run_{run_id}.csv"},
        )
