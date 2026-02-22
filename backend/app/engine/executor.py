from __future__ import annotations

import logging
import os
import tempfile
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from app.config import Settings
from app.connectors.api_connector import APIConnector
from app.connectors.file_connector import FileConnector
from app.engine.cte_parser import extract_ctes
from app.engine.duckdb_manager import DuckDBSession
from app.services.cas import sha256_of_file

logger = logging.getLogger(__name__)


class WorkflowExecutionError(Exception):
    def __init__(self, message: str, sql: str | None = None) -> None:
        self.message = message
        self.sql = sql
        super().__init__(message)


@dataclass
class ExecutionResult:
    status: str
    duration_ms: int
    row_count: int | None
    data: list[dict[str, Any]] | None
    error: dict[str, Any] | None
    schema_info: list[dict[str, str]] = field(default_factory=list)
    source_file_hashes: dict[str, str] = field(default_factory=dict)
    source_file_paths: dict[str, Path] = field(default_factory=dict)
    ndjson_result_path: Path | None = field(default=None)


@dataclass
class CTEResult:
    name: str
    ordinal: int
    row_count: int
    data: list[dict[str, Any]]
    schema_info: list[dict[str, str]]


@dataclass
class CTEInspectionResult:
    status: str
    duration_ms: int
    ctes: list[CTEResult]
    error: dict[str, Any] | None


class WorkflowExecutor:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self.file_connector = FileConnector()
        self.api_connector = APIConnector()

    @staticmethod
    def _cleanup_temp_files(temp_files: list[Path]) -> None:
        """Remove temporary files created during source loading."""
        for path in temp_files:
            try:
                os.unlink(path)
            except OSError:
                logger.debug("Failed to remove temp file: %s", path)

    async def execute(
        self,
        sources: list[dict[str, Any]],
        query: str,
        parameters: dict[str, Any],
        preview_limit: int | None = None,
    ) -> ExecutionResult:
        start_time = time.monotonic()
        session: DuckDBSession | None = None
        temp_files: list[Path] = []

        try:
            # 1. Create DuckDB session
            session = DuckDBSession(
                memory_limit_mb=self.settings.execution_max_memory_mb,
            )

            # 2. Set parameters as DuckDB variables
            for name, value in parameters.items():
                session.set_variable(name, str(value))

            # 3. Load all sources
            source_file_hashes: dict[str, str] = {}
            source_file_paths: dict[str, Path] = {}
            for source in sources:
                file_hash, file_path = await self.load_source(
                    session, source, parameters, temp_files,
                )
                source_file_hashes[source["table_name"]] = file_hash
                source_file_paths[source["table_name"]] = file_path

            # 4. Execute the query
            session.execute_transform("_result", query)

            # 5. Extract results
            schema_info = session.get_table_schema("_result")
            row_count = session.get_row_count("_result")
            data = session.get_table_data("_result", limit=preview_limit)

            # 6. Export deterministic NDJSON of full result to temp file
            with tempfile.NamedTemporaryFile(mode="w+b", suffix=".ndjson", delete=False) as tmp:
                ndjson_path = Path(tmp.name)
            session.export_ndjson_sorted_to_file("_result", ndjson_path)

            return ExecutionResult(
                status="success",
                duration_ms=int((time.monotonic() - start_time) * 1000),
                row_count=row_count,
                data=data,
                error=None,
                schema_info=schema_info,
                source_file_hashes=source_file_hashes,
                source_file_paths=source_file_paths,
                ndjson_result_path=ndjson_path,
            )

        except WorkflowExecutionError as e:
            return ExecutionResult(
                status="failed",
                duration_ms=int((time.monotonic() - start_time) * 1000),
                row_count=None,
                data=None,
                error={"message": e.message, "sql": e.sql},
            )
        except Exception as e:
            return ExecutionResult(
                status="failed",
                duration_ms=int((time.monotonic() - start_time) * 1000),
                row_count=None,
                data=None,
                error={"message": str(e), "sql": query},
            )
        finally:
            if session:
                session.close()
            self._cleanup_temp_files(temp_files)

    async def load_source(
        self,
        session: DuckDBSession,
        source: dict[str, Any],
        parameters: dict[str, Any],
        temp_files: list[Path],
    ) -> tuple[str, Path]:
        """Load a source into DuckDB and return (SHA-256 of file, file path).

        API sources create temporary files; pass *temp_files* to track them
        for cleanup after the DuckDB session is closed.
        """
        config = source["config"]
        table_name = source["table_name"]
        env: dict[str, str] = {}  # populated from settings/environment in later stages

        if source["type"] == "file":
            file_path = await self.file_connector.fetch(config, parameters, env)
            file_type = self.file_connector.get_file_type(config)
            if file_type == "json":
                session.load_json(table_name, file_path)
            elif file_type == "parquet":
                session.load_parquet(table_name, file_path)
            else:
                options = config.get("options", {})
                session.load_csv(table_name, file_path, **options)
        elif source["type"] == "api":
            file_path = await self.api_connector.fetch(config, parameters, env)
            session.load_json(table_name, file_path)
            temp_files.append(file_path)
        else:
            msg = f"Unknown source type: {source['type']}"
            raise WorkflowExecutionError(msg)
        return sha256_of_file(file_path), file_path

    async def inspect_ctes(
        self,
        sources: list[dict[str, Any]],
        query: str,
        parameters: dict[str, Any],
    ) -> CTEInspectionResult:
        start_time = time.monotonic()
        session: DuckDBSession | None = None
        temp_files: list[Path] = []

        try:
            cte_infos = extract_ctes(query)
            if not cte_infos:
                return CTEInspectionResult(
                    status="success",
                    duration_ms=int((time.monotonic() - start_time) * 1000),
                    ctes=[],
                    error=None,
                )

            session = DuckDBSession(
                memory_limit_mb=self.settings.execution_max_memory_mb,
            )

            for name, value in parameters.items():
                session.set_variable(name, str(value))

            for source in sources:
                await self.load_source(session, source, parameters, temp_files)

            cte_results: list[CTEResult] = []
            for info in cte_infos:
                table_name = f"_cte_{info.ordinal}"
                session.execute_transform(table_name, info.prefix_sql)
                schema_info = session.get_table_schema(table_name)
                row_count = session.get_row_count(table_name)
                data = session.get_table_data(table_name, limit=100)
                cte_results.append(
                    CTEResult(
                        name=info.name,
                        ordinal=info.ordinal,
                        row_count=row_count,
                        data=data,
                        schema_info=schema_info,
                    )
                )

            return CTEInspectionResult(
                status="success",
                duration_ms=int((time.monotonic() - start_time) * 1000),
                ctes=cte_results,
                error=None,
            )

        except Exception as e:
            return CTEInspectionResult(
                status="failed",
                duration_ms=int((time.monotonic() - start_time) * 1000),
                ctes=[],
                error={"message": str(e)},
            )
        finally:
            if session:
                session.close()
            self._cleanup_temp_files(temp_files)
