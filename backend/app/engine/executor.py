from __future__ import annotations

import time
from dataclasses import dataclass, field
from typing import Any

from app.config import Settings
from app.connectors.api_connector import APIConnector
from app.connectors.file_connector import FileConnector
from app.engine.duckdb_manager import DuckDBSession


class PipelineExecutionError(Exception):
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


class PipelineExecutor:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self.file_connector = FileConnector()
        self.api_connector = APIConnector()

    async def execute(
        self,
        pipeline_id: str,
        sources: list[dict[str, Any]],
        query: str,
        parameters: dict[str, Any],
        preview_limit: int | None = None,
    ) -> ExecutionResult:
        start_time = time.monotonic()
        session: DuckDBSession | None = None

        try:
            # 1. Create DuckDB session
            session = DuckDBSession(
                memory_limit_mb=self.settings.execution_max_memory_mb,
            )

            # 2. Set parameters as DuckDB variables
            for name, value in parameters.items():
                session.set_variable(name, str(value))

            # 3. Load all sources
            for source in sources:
                await self._load_source(session, source, parameters)

            # 4. Execute the query
            session.execute_transform("_result", query)

            # 5. Extract results
            schema_info = session.get_table_schema("_result")
            row_count = session.get_row_count("_result")
            data = session.get_table_data("_result", limit=preview_limit)

            return ExecutionResult(
                status="success",
                duration_ms=int((time.monotonic() - start_time) * 1000),
                row_count=row_count,
                data=data,
                error=None,
                schema_info=schema_info,
            )

        except PipelineExecutionError as e:
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

    async def _load_source(
        self,
        session: DuckDBSession,
        source: dict[str, Any],
        parameters: dict[str, Any],
    ) -> None:
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
