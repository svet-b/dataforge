from __future__ import annotations

import time
from dataclasses import dataclass, field
from typing import Any

from app.config import Settings
from app.connectors.api_connector import APIConnector
from app.connectors.file_connector import FileConnector
from app.engine.dag import DAGResolver
from app.engine.duckdb_manager import DuckDBSession


class PipelineExecutionError(Exception):
    def __init__(
        self,
        node_id: str,
        node_name: str,
        message: str,
        sql: str | None = None,
    ) -> None:
        self.node_id = node_id
        self.node_name = node_name
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
    node_timings: dict[str, Any] = field(default_factory=dict)


class PipelineExecutor:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self.file_connector = FileConnector()
        self.api_connector = APIConnector()

    async def execute(
        self,
        pipeline_id: str,
        nodes: list[dict[str, Any]],
        edges: list[dict[str, Any]],
        parameters: dict[str, Any],
        target_node_id: str | None = None,
    ) -> ExecutionResult:
        start_time = time.monotonic()
        session: DuckDBSession | None = None
        node_timings: dict[str, Any] = {}

        try:
            # 1. Resolve DAG
            resolver = DAGResolver(nodes, edges)
            if target_node_id:
                ancestors = resolver.get_ancestors(target_node_id)
                ancestors.add(target_node_id)
                execution_order = [nid for nid in resolver.topological_sort() if nid in ancestors]
            else:
                execution_order = resolver.topological_sort()

            # 2. Create DuckDB session
            session = DuckDBSession(
                memory_limit_mb=self.settings.execution_max_memory_mb,
            )

            # 3. Set parameters as DuckDB variables
            for name, value in parameters.items():
                session.set_variable(name, str(value))

            # 4. Execute nodes
            node_map = {n["id"]: n for n in nodes}
            output_table: str | None = None

            for node_id in execution_order:
                node = node_map[node_id]
                node_start = time.monotonic()

                try:
                    if node["type"] in ("source_api", "source_file"):
                        await self._execute_source(session, node, parameters)
                    elif node["type"] == "transform":
                        self._execute_transform(session, node)
                    elif node["type"] == "output":
                        output_table = node["config"].get(
                            "source_table", node["output_table_name"]
                        )

                    node_timings[str(node_id)] = {
                        "duration_ms": int((time.monotonic() - node_start) * 1000),
                        "row_count": (
                            session.get_row_count(node["output_table_name"])
                            if node["type"] != "output"
                            else None
                        ),
                    }
                except PipelineExecutionError:
                    raise
                except Exception as e:
                    raise PipelineExecutionError(
                        node_id=node_id,
                        node_name=node["name"],
                        message=str(e),
                        sql=node["config"].get("sql") if node["type"] == "transform" else None,
                    ) from e

            # 5. Extract results
            if target_node_id:
                result_table = node_map[target_node_id]["output_table_name"]
            else:
                assert output_table is not None
                result_table = output_table
            data = session.get_table_data(result_table)
            row_count = len(data)

            return ExecutionResult(
                status="success",
                duration_ms=int((time.monotonic() - start_time) * 1000),
                row_count=row_count,
                data=data,
                error=None,
                node_timings=node_timings,
            )

        except PipelineExecutionError as e:
            return ExecutionResult(
                status="failed",
                duration_ms=int((time.monotonic() - start_time) * 1000),
                row_count=None,
                data=None,
                error={
                    "node_id": str(e.node_id),
                    "node_name": e.node_name,
                    "message": e.message,
                    "sql": e.sql,
                },
                node_timings=node_timings,
            )
        finally:
            if session:
                session.close()

    async def _execute_source(
        self,
        session: DuckDBSession,
        node: dict[str, Any],
        parameters: dict[str, Any],
    ) -> None:
        config = node["config"]
        table_name = node["output_table_name"]
        env: dict[str, str] = {}  # populated from settings/environment in later stages

        if node["type"] == "source_file":
            file_path = await self.file_connector.fetch(config, parameters, env)
            file_type = self.file_connector.get_file_type(config)
            if file_type == "json":
                session.load_json(table_name, file_path)
            elif file_type == "parquet":
                session.load_parquet(table_name, file_path)
            else:
                options = config.get("options", {})
                session.load_csv(table_name, file_path, **options)
        elif node["type"] == "source_api":
            file_path = await self.api_connector.fetch(config, parameters, env)
            session.load_json(table_name, file_path)

    def _execute_transform(
        self,
        session: DuckDBSession,
        node: dict[str, Any],
    ) -> None:
        sql = node["config"]["sql"]
        session.execute_transform(node["output_table_name"], sql)
