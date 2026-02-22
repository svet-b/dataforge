from __future__ import annotations

import csv
import io
import json
import os
import time
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.config import settings
from app.connectors.api_connector import APIConnector
from app.database import get_db
from app.engine.duckdb_manager import DuckDBSession
from app.engine.executor import WorkflowExecutor
from app.ids import generate_cuid
from app.models.run import RunHistory
from app.models.uploaded_file import UploadedFile
from app.models.workflow import Workflow
from app.schemas.execution import (
    CTEInspectionResponse,
    RunRequest,
    RunResponse,
    SourcePreviewResponse,
    SourceRawResponse,
    SourceSchemaResponse,
    ValidateQueryRequest,
    ValidateQueryResponse,
)
from app.serialization import json_safe
from app.services import cas

router = APIRouter(prefix="/api/workflows", tags=["execution"])


def _load_workflow(
    workflow_id: str, db: Session
) -> tuple[Workflow, list[dict[str, Any]], str | None]:
    """Load workflow, its sources (with file paths resolved), and its query."""
    workflow = db.get(Workflow, workflow_id)
    if not workflow:
        raise HTTPException(status_code=404, detail="Workflow not found")

    # Build a filename → storage_path lookup for uploaded files
    uploaded_files = db.query(UploadedFile).filter(UploadedFile.workflow_id == workflow_id).all()
    file_path_map = {uf.filename: uf.storage_path for uf in uploaded_files}

    sources = []
    for s in workflow.sources:
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
    return workflow, sources, workflow.query


def _merge_parameters(workflow: Workflow, supplied: dict[str, Any]) -> dict[str, Any]:
    """Merge supplied parameters with workflow defaults."""
    merged: dict[str, Any] = {}
    for param in workflow.parameters:
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


@router.post("/{workflow_id}/run")
async def run_workflow(
    workflow_id: str,
    body: RunRequest,
    db: Session = Depends(get_db),
) -> RunResponse:
    workflow, sources, query = _load_workflow(workflow_id, db)
    if not query or not query.strip():
        raise HTTPException(status_code=400, detail="Workflow has no query defined")
    parameters = _merge_parameters(workflow, body.parameters)

    started_at = datetime.now(UTC).isoformat()
    executor = WorkflowExecutor(settings)
    exec_result = await executor.execute(
        sources=sources,
        query=query,
        parameters=parameters,
    )

    schema_info: list[dict[str, str]] = []
    if exec_result.status == "success" and exec_result.schema_info:
        schema_info = exec_result.schema_info

    # Compute provenance hashes for successful runs
    query_hash: str | None = None
    source_config_hash: str | None = None
    parameters_hash: str | None = None
    source_data_hash: str | None = None
    result_hash: str | None = None

    if exec_result.status == "success":
        query_hash = cas.store_content(db, query, "query")
        source_config_hash = cas.store_content(
            db, cas.canonicalize_source_configs(sources), "source_config"
        )
        parameters_hash = cas.store_content(
            db, cas.canonicalize_json(parameters), "parameters"
        )
        # Store source files in CAS
        for _table_name, file_path in exec_result.source_file_paths.items():
            cas.store_file(settings.data_dir, file_path)
        source_data_hash = cas.store_content(
            db, cas.canonicalize_json(exec_result.source_file_hashes), "source_data"
        )
        # Store result NDJSON in CAS (file-based, no FK)
        if exec_result.ndjson_result_path is not None:
            result_hash = cas.store_file(settings.data_dir, exec_result.ndjson_result_path)

    # Store run in run_history (keep up to 10k rows for downloads)
    run_id = generate_cuid()
    completed_at = datetime.now(UTC).isoformat()
    run = RunHistory(
        id=run_id,
        workflow_id=workflow_id,
        parameters=parameters,
        status=exec_result.status,
        started_at=started_at,
        completed_at=completed_at,
        duration_ms=exec_result.duration_ms,
        row_count=exec_result.row_count,
        schema_info=schema_info,
        output_preview=(
            json_safe({"data": exec_result.data[:10_000]}) if exec_result.data else None
        ),
        error=exec_result.error,
        query_hash=query_hash,
        source_config_hash=source_config_hash,
        parameters_hash=parameters_hash,
        source_data_hash=source_data_hash,
        result_hash=result_hash,
    )
    db.add(run)
    db.commit()

    # Prune old runs
    runs = (
        db.query(RunHistory)
        .filter(RunHistory.workflow_id == workflow_id)
        .order_by(RunHistory.started_at.desc())
        .all()
    )
    if len(runs) > settings.max_run_history:
        for old_run in runs[settings.max_run_history :]:
            db.delete(old_run)
        db.commit()

    # Return data capped at 100 rows for the UI
    try:
        return RunResponse(
            run_id=run_id,
            status=exec_result.status,
            duration_ms=exec_result.duration_ms,
            row_count=exec_result.row_count,
            data=json_safe(exec_result.data[:100]) if exec_result.data else None,
            schema_info=schema_info,
            error=exec_result.error,
            query_hash=query_hash,
            source_config_hash=source_config_hash,
            parameters_hash=parameters_hash,
            source_data_hash=source_data_hash,
            result_hash=result_hash,
        )
    finally:
        if exec_result.ndjson_result_path is not None:
            try:
                os.unlink(exec_result.ndjson_result_path)
            except OSError:
                pass


@router.post("/{workflow_id}/inspect-ctes")
async def inspect_ctes(
    workflow_id: str,
    body: RunRequest,
    db: Session = Depends(get_db),
) -> CTEInspectionResponse:
    """Inspect intermediate CTE results without creating a run history entry."""
    workflow, sources, query = _load_workflow(workflow_id, db)
    if not query or not query.strip():
        raise HTTPException(status_code=400, detail="Workflow has no query defined")
    parameters = _merge_parameters(workflow, body.parameters)

    executor = WorkflowExecutor(settings)
    result = await executor.inspect_ctes(
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
                "data": json_safe(c.data),
                "schema_info": c.schema_info,
            }
            for c in result.ctes
        ],
        error=result.error,
    )


@router.post("/{workflow_id}/validate-query")
async def validate_query(
    workflow_id: str,
    body: ValidateQueryRequest,
    db: Session = Depends(get_db),
) -> ValidateQueryResponse:
    """Validate a SQL query against the workflow's sources without executing it."""
    workflow, sources, _query = _load_workflow(workflow_id, db)
    parameters = _merge_parameters(workflow, {})

    executor = WorkflowExecutor(settings)
    session = DuckDBSession(memory_limit_mb=settings.execution_max_memory_mb)
    temp_files: list[Path] = []
    try:
        for name, value in parameters.items():
            session.set_variable(name, str(value))

        for source in sources:
            await executor.load_source(session, source, parameters, temp_files)

        error = session.validate_query(body.query)
        if error is None:
            return ValidateQueryResponse(valid=True)
        return ValidateQueryResponse(valid=False, error=error)
    except Exception as e:
        return ValidateQueryResponse(valid=False, error=str(e))
    finally:
        session.close()
        executor._cleanup_temp_files(temp_files)


@router.post("/{workflow_id}/preview-sources")
async def preview_sources(
    workflow_id: str,
    db: Session = Depends(get_db),
) -> SourcePreviewResponse:
    """Load each source and return schema + data preview (up to 100 rows)."""
    _workflow, sources, _query = _load_workflow(workflow_id, db)
    if not sources:
        return SourcePreviewResponse(status="success", duration_ms=0, sources=[])

    start_time = time.monotonic()
    executor = WorkflowExecutor(settings)
    session = DuckDBSession(memory_limit_mb=settings.execution_max_memory_mb)
    temp_files: list[Path] = []
    results: list[dict[str, Any]] = []
    try:
        for source in sources:
            table_name = source["table_name"]
            try:
                await executor.load_source(session, source, {}, temp_files)
                schema = session.get_table_schema(table_name)
                row_count = session.get_row_count(table_name)
                data = session.get_table_data(table_name, limit=100)
                results.append(
                    {
                        "name": table_name,
                        "row_count": row_count,
                        "data": json_safe(data),
                        "schema_info": schema,
                    }
                )
            except Exception as e:
                results.append(
                    {
                        "name": table_name,
                        "row_count": 0,
                        "data": [],
                        "schema_info": [],
                        "error": str(e),
                    }
                )
    finally:
        session.close()
        executor._cleanup_temp_files(temp_files)

    return SourcePreviewResponse(
        status="success",
        duration_ms=int((time.monotonic() - start_time) * 1000),
        sources=results,
    )


@router.post("/{workflow_id}/sources/{source_id}/schema")
async def source_schema(
    workflow_id: str,
    source_id: str,
    db: Session = Depends(get_db),
) -> SourceSchemaResponse:
    """Load a single source into DuckDB and return its schema and row count."""
    _workflow, sources, _query = _load_workflow(workflow_id, db)

    source_dict = next((s for s in sources if s["id"] == source_id), None)
    if source_dict is None:
        raise HTTPException(status_code=404, detail="Source not found")

    executor = WorkflowExecutor(settings)
    session = DuckDBSession(memory_limit_mb=settings.execution_max_memory_mb)
    temp_files: list[Path] = []
    try:
        await executor.load_source(session, source_dict, {}, temp_files)
        columns = session.get_table_schema(source_dict["table_name"])
        row_count = session.get_row_count(source_dict["table_name"])
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    finally:
        session.close()
        executor._cleanup_temp_files(temp_files)

    return SourceSchemaResponse(columns=columns, row_count=row_count)


@router.post("/{workflow_id}/sources/{source_id}/raw-response")
async def source_raw_response(
    workflow_id: str,
    source_id: str,
    db: Session = Depends(get_db),
) -> SourceRawResponse:
    """Fetch raw JSON response from an API source for preview and path selection."""
    _workflow, sources, _query = _load_workflow(workflow_id, db)

    source_dict = next((s for s in sources if s["id"] == source_id), None)
    if source_dict is None:
        raise HTTPException(status_code=404, detail="Source not found")

    if source_dict["type"] != "api":
        raise HTTPException(status_code=400, detail="Source is not an API source")

    config = source_dict["config"]
    connector = APIConnector()
    try:
        raw_data, extracted = await connector.fetch_raw(config, {}, {})
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e)) from e

    return SourceRawResponse(
        raw_data=json_safe(raw_data),
        extracted_records=json_safe(extracted[:50]),
        extracted_count=len(extracted),
    )


def _load_preview_data(run: RunHistory) -> list[dict[str, Any]]:
    """Fallback for older runs that only have output_preview."""
    if run.output_preview:
        return run.output_preview.get("data", [])
    return []


def _stream_json_array(cas_file: Path):
    """Stream NDJSON from CAS as a JSON array without full materialization."""
    def _iter():
        yield b"[\n"
        first = True
        with cas_file.open("r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                if not first:
                    yield b",\n"
                yield line.encode("utf-8")
                first = False
        yield b"\n]\n"
    return _iter()


def _stream_csv(cas_file: Path):
    """Stream NDJSON from CAS as CSV without loading all rows."""
    def _iter():
        writer_out = io.StringIO()
        writer: csv.DictWriter | None = None
        with cas_file.open("r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                row = json.loads(line)
                if writer is None:
                    writer = csv.DictWriter(writer_out, fieldnames=list(row.keys()))
                    writer.writeheader()
                    yield writer_out.getvalue().encode("utf-8")
                    writer_out.seek(0)
                    writer_out.truncate(0)
                writer.writerow(row)
                yield writer_out.getvalue().encode("utf-8")
                writer_out.seek(0)
                writer_out.truncate(0)
    return _iter()


def _load_run_data(run: RunHistory) -> list[dict[str, Any]]:
    """Load full result data for legacy runs without CAS-backed output."""
    if run.result_hash:
        return []
    return _load_preview_data(run)


@router.get("/{workflow_id}/runs/{run_id}/download")
def download_run(
    workflow_id: str,
    run_id: str,
    format: str = Query(default="csv", pattern="^(csv|json)$"),
    db: Session = Depends(get_db),
) -> StreamingResponse:
    workflow = db.get(Workflow, workflow_id)
    if not workflow:
        raise HTTPException(status_code=404, detail="Workflow not found")
    run = db.get(RunHistory, run_id)
    if not run or run.workflow_id != workflow_id:
        raise HTTPException(status_code=404, detail="Run not found")
    if run.status != "success":
        raise HTTPException(status_code=400, detail="Run has no output data")

    if run.result_hash:
        cas_file = cas.get_file_path(settings.data_dir, run.result_hash)
        if cas_file is None:
            raise HTTPException(status_code=404, detail="Result data not found in CAS")
        stream = _stream_json_array(cas_file) if format == "json" else _stream_csv(cas_file)
        media_type = "application/json" if format == "json" else "text/csv"
        filename = f"run_{run_id}.json" if format == "json" else f"run_{run_id}.csv"
        return StreamingResponse(
            stream,
            media_type=media_type,
            headers={"Content-Disposition": f"attachment; filename={filename}"},
        )

    data = _load_preview_data(run)
    if not data:
        raise HTTPException(status_code=400, detail="Run has no output data")

    if format == "json":
        content = json.dumps(data, indent=2, default=str)
        return StreamingResponse(
            io.BytesIO(content.encode()),
            media_type="application/json",
            headers={"Content-Disposition": f"attachment; filename=run_{run_id}.json"},
        )

    output = io.StringIO()
    writer = csv.DictWriter(output, fieldnames=list(data[0].keys()))
    writer.writeheader()
    writer.writerows(data)
    return StreamingResponse(
        io.BytesIO(output.getvalue().encode()),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=run_{run_id}.csv"},
    )
