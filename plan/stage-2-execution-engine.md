# Stage 2: Pipeline Execution Engine

## Objective

Implement the core DuckDB-based pipeline execution engine. This is the computational heart of DataForge — it resolves the DAG, executes nodes in topological order, manages ephemeral DuckDB sessions, and returns results. By the end of this stage, you can programmatically create a pipeline and execute it via `POST /api/pipelines/{id}/run`.

## Prerequisites

Stage 1 is complete. The project has:
- Docker environment with Postgres
- FastAPI app with async SQLAlchemy
- All database models and Pydantic schemas
- Health check endpoint

**Read the existing code first** to understand naming conventions, import patterns, and project structure before adding new files.

## Deliverables

### 1. DAG Resolver (`app/engine/dag.py`)

Implement topological sorting and cycle detection for pipeline DAGs.

```python
from uuid import UUID

class DAGError(Exception):
    """Raised when the DAG is invalid (cycles, disconnected output, etc.)."""
    pass

class DAGResolver:
    def __init__(self, nodes: list[dict], edges: list[dict]):
        """
        nodes: list of {"id": UUID, "type": str, ...}
        edges: list of {"source_node_id": UUID, "target_node_id": UUID}
        """
        ...

    def topological_sort(self) -> list[UUID]:
        """
        Return node IDs in execution order.
        Raises DAGError if the graph contains cycles.
        """
        ...

    def get_ancestors(self, node_id: UUID) -> set[UUID]:
        """
        Return all ancestor node IDs for a given node (for partial preview execution).
        """
        ...

    def validate(self) -> list[str]:
        """
        Validate the DAG structure. Return a list of error messages (empty if valid).
        Checks:
        - No cycles
        - Exactly one output node
        - All nodes are reachable from at least one source
        - Output node has at least one incoming edge
        """
        ...
```

Use Kahn's algorithm for topological sort (it naturally detects cycles). The implementation should be pure Python with no external dependencies.

### 2. DuckDB Manager (`app/engine/duckdb_manager.py`)

Manages ephemeral DuckDB instances for pipeline execution.

```python
import duckdb
from pathlib import Path

class DuckDBSession:
    """
    Wraps an in-memory DuckDB connection for a single pipeline run.
    Disposed after the run completes.
    """

    def __init__(self, memory_limit_mb: int = 4096):
        self.conn = duckdb.connect(":memory:")
        self.conn.execute(f"SET memory_limit = '{memory_limit_mb}MB'")
        # Disable dangerous extensions
        self.conn.execute("SET enable_external_access = false")

    def set_variable(self, name: str, value: str, var_type: str = "VARCHAR"):
        """Set a DuckDB session variable for pipeline parameter injection."""
        self.conn.execute(f"SET VARIABLE {name} = '{value}'")

    def load_json(self, table_name: str, file_path: Path):
        """Load a JSON/ndjson file into a named table."""
        self.conn.execute(
            f"CREATE TABLE {table_name} AS SELECT * FROM read_json_auto('{file_path}')"
        )

    def load_csv(self, table_name: str, file_path: Path, **options):
        """Load a CSV file into a named table. Options: delimiter, header, etc."""
        ...

    def load_parquet(self, table_name: str, file_path: Path):
        """Load a Parquet file into a named table."""
        ...

    def execute_transform(self, table_name: str, sql: str):
        """Execute a transform SQL and store result as a named table."""
        # Validate SQL is a SELECT (lightweight check)
        self.conn.execute(f"CREATE TABLE {table_name} AS ({sql})")

    def get_table_data(self, table_name: str, limit: int | None = None) -> list[dict]:
        """Fetch table contents as a list of dicts."""
        query = f"SELECT * FROM {table_name}"
        if limit:
            query += f" LIMIT {limit}"
        result = self.conn.execute(query)
        columns = [desc[0] for desc in result.description]
        return [dict(zip(columns, row)) for row in result.fetchall()]

    def get_table_schema(self, table_name: str) -> list[dict]:
        """Return column names and types for a table."""
        result = self.conn.execute(f"DESCRIBE {table_name}")
        return [{"name": row[0], "type": row[1]} for row in result.fetchall()]

    def get_row_count(self, table_name: str) -> int:
        result = self.conn.execute(f"SELECT COUNT(*) FROM {table_name}")
        return result.fetchone()[0]

    def close(self):
        self.conn.close()
```

**Important DuckDB notes:**
- `SET enable_external_access = false` prevents the SQL from accessing the filesystem or network directly — only tables already loaded by the connectors are accessible.
- Each run gets its own connection. There's no connection pooling for DuckDB — connections are cheap.
- Be careful with SQL injection in table names. Validate that `table_name` matches `^[a-zA-Z_][a-zA-Z0-9_]*$`.

### 3. Source Connectors

#### Base interface (`app/connectors/base.py`):

```python
from typing import Protocol, Any
from pathlib import Path

class SourceConnector(Protocol):
    async def fetch(
        self,
        config: dict,
        parameters: dict[str, Any],
        env: dict[str, str]
    ) -> Path:
        """Fetch data, return path to a temp file for DuckDB ingestion."""
        ...

    def duckdb_load_method(self) -> str:
        """Return 'json', 'csv', or 'parquet'."""
        ...
```

#### File Connector (`app/connectors/file_connector.py`):

```python
class FileConnector:
    """Loads uploaded files (CSV, JSON, Parquet, Excel)."""

    async def fetch(self, config: dict, parameters: dict, env: dict) -> Path:
        """
        config contains:
          - file_path: str (absolute path to the uploaded file)
          - file_type: str ("csv", "json", "parquet", "excel")
          - options: dict (delimiter, header_row, sheet_name, etc.)

        For most file types, just return the path directly since DuckDB can read them natively.
        For Excel, convert to CSV first using openpyxl or let DuckDB handle it via the spatial extension.
        """
        ...
```

#### API Connector (`app/connectors/api_connector.py`):

```python
import httpx
import json
import tempfile
from pathlib import Path

class APIConnector:
    """Fetches data from REST APIs."""

    async def fetch(self, config: dict, parameters: dict, env: dict) -> Path:
        """
        config contains:
          - url_template: str (e.g., "https://api.example.com/data?from={{start_date}}")
          - method: str ("GET" or "POST")
          - headers: dict (may contain {{env.VAR_NAME}} templates)
          - body_template: dict | None (for POST requests)
          - response_path: str (dot notation, e.g., "data.readings")
          - pagination: dict | None

        Flow:
        1. Interpolate url_template, headers, body with parameters and env values
        2. Make HTTP request(s) — handle pagination if configured
        3. Extract data array using response_path
        4. Write as newline-delimited JSON to a temp file
        5. Return the temp file path
        """
        ...

    def _interpolate(self, template: str, parameters: dict, env: dict) -> str:
        """Replace {{param_name}} and {{env.VAR_NAME}} in a template string."""
        ...

    def _extract_by_path(self, data: dict, path: str) -> list:
        """Navigate nested dict using dot notation. E.g., 'data.readings' -> data["data"]["readings"]"""
        ...

    async def _fetch_paginated(self, url: str, method: str, headers: dict,
                                body: dict | None, pagination: dict) -> list:
        """Handle paginated API responses. Supports offset and cursor pagination."""
        ...
```

**Template interpolation rules:**
- `{{param_name}}` → replaced with the value from `parameters[param_name]`
- `{{env.VAR_NAME}}` → replaced with the value from `env[VAR_NAME]`
- Unknown templates should raise a clear error

**Pagination strategies:**
- **offset**: Increment a `page` parameter until the response returns fewer items than `limit`
- **cursor**: Extract a cursor/token from the response and pass it in the next request
- For v1, implementing just `offset` pagination is sufficient. Document `cursor` as a TODO.

### 4. Pipeline Executor (`app/engine/executor.py`)

The main orchestrator that ties everything together:

```python
import time
from uuid import UUID
from datetime import datetime, timezone

class PipelineExecutionError(Exception):
    def __init__(self, node_id: UUID, node_name: str, message: str, sql: str | None = None):
        self.node_id = node_id
        self.node_name = node_name
        self.message = message
        self.sql = sql

class ExecutionResult:
    run_id: UUID
    status: str  # "success" or "failed"
    duration_ms: int
    row_count: int | None
    data: list[dict] | None
    error: dict | None
    node_timings: dict

class PipelineExecutor:
    def __init__(self, settings):
        self.settings = settings

    async def execute(
        self,
        pipeline_id: UUID,
        nodes: list[dict],
        edges: list[dict],
        parameters: dict,
        target_node_id: UUID | None = None  # For preview: only execute up to this node
    ) -> ExecutionResult:
        """
        Full pipeline execution flow:

        1. Resolve DAG and get execution order
           - If target_node_id is set, only execute ancestors + target (preview mode)
        2. Create DuckDB session
        3. Set pipeline parameters as DuckDB variables
        4. For each node in execution order:
           a. Source nodes: use the appropriate connector to fetch data, load into DuckDB
           b. Transform nodes: execute SQL, create result table
           c. Output node: mark as the result table
        5. Extract results from the output/target table
        6. Return ExecutionResult

        Each node execution is timed. If any node fails, execution halts and
        the error is captured with full context.
        """
        start_time = time.monotonic()
        session = None
        node_timings = {}

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
            session = DuckDBSession(memory_limit_mb=self.settings.execution_max_memory_mb)

            # 3. Set parameters as DuckDB variables
            for name, value in parameters.items():
                session.set_variable(name, str(value))

            # 4. Execute nodes
            node_map = {n["id"]: n for n in nodes}
            output_table = None

            for node_id in execution_order:
                node = node_map[node_id]
                node_start = time.monotonic()

                try:
                    if node["type"] in ("source_api", "source_file"):
                        await self._execute_source(session, node, parameters)
                    elif node["type"] == "transform":
                        self._execute_transform(session, node)
                    elif node["type"] == "output":
                        output_table = node["config"].get("source_table", node["output_table_name"])

                    node_timings[str(node_id)] = {
                        "duration_ms": int((time.monotonic() - node_start) * 1000),
                        "row_count": session.get_row_count(node["output_table_name"])
                            if node["type"] != "output" else None
                    }
                except Exception as e:
                    raise PipelineExecutionError(
                        node_id=node_id,
                        node_name=node["name"],
                        message=str(e),
                        sql=node["config"].get("sql") if node["type"] == "transform" else None
                    )

            # 5. Extract results
            result_table = target_node_id and node_map[target_node_id]["output_table_name"] or output_table
            data = session.get_table_data(result_table)
            row_count = len(data)

            return ExecutionResult(
                status="success",
                duration_ms=int((time.monotonic() - start_time) * 1000),
                row_count=row_count,
                data=data,
                error=None,
                node_timings=node_timings
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
                    "sql": e.sql
                },
                node_timings=node_timings
            )
        finally:
            if session:
                session.close()
```

### 5. Execution API Endpoints (`app/routers/execution.py`)

```python
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

router = APIRouter(prefix="/api/pipelines", tags=["execution"])

@router.post("/{pipeline_id}/run")
async def run_pipeline(
    pipeline_id: UUID,
    body: RunRequest,  # {"parameters": {...}}
    db: AsyncSession = Depends(get_db)
):
    """
    Execute a pipeline with the given parameters.

    1. Load pipeline, nodes, edges from Postgres
    2. Merge supplied parameters with pipeline defaults
    3. Execute via PipelineExecutor
    4. Store run in run_history
    5. Prune old runs (keep last N)
    6. Return result
    """
    ...

@router.post("/{pipeline_id}/preview/{node_id}")
async def preview_node(
    pipeline_id: UUID,
    node_id: UUID,
    body: RunRequest,
    db: AsyncSession = Depends(get_db)
):
    """
    Execute pipeline up to and including the specified node.
    Returns that node's output data for design-time preview.
    Uses target_node_id parameter of PipelineExecutor.
    """
    ...
```

**Pydantic schemas for execution:**

```python
class RunRequest(BaseModel):
    parameters: dict[str, Any] = {}

class RunResponse(BaseModel):
    run_id: UUID
    status: str
    duration_ms: int
    row_count: int | None
    data: list[dict] | None
    error: dict | None
    node_timings: dict

class NodePreviewResponse(RunResponse):
    schema_info: list[dict]  # Column names and types from the previewed table
```

### 6. Tests

#### `tests/test_dag.py`

```python
def test_simple_linear_dag():
    """A -> B -> C -> D should sort to [A, B, C, D]."""
    ...

def test_branching_dag():
    """A -> C, B -> C, C -> D should sort to something like [A, B, C, D] or [B, A, C, D]."""
    ...

def test_cycle_detection():
    """A -> B -> C -> A should raise DAGError."""
    ...

def test_get_ancestors():
    """For A -> B -> C, ancestors of C should be {A, B}."""
    ...

def test_validate_no_output_node():
    """DAG with no output node should return error."""
    ...

def test_validate_multiple_output_nodes():
    """DAG with two output nodes should return error."""
    ...
```

#### `tests/test_executor.py`

Create a sample CSV file in `tests/fixtures/sample_meter_data.csv`:

```csv
meter_id,reading_timestamp,voltage,current_a,energy_kwh
M-001,2026-01-01 00:00:00,231.5,45.2,12.3
M-001,2026-01-01 01:00:00,232.1,44.8,11.9
M-001,2026-01-01 02:00:00,230.8,46.1,12.7
M-002,2026-01-01 00:00:00,229.3,52.0,14.1
M-002,2026-01-01 01:00:00,230.5,51.2,13.8
M-002,2026-01-01 02:00:00,231.0,50.5,14.5
```

```python
async def test_simple_pipeline_execution():
    """
    Create a pipeline: CSV source -> transform (aggregate) -> output.
    Verify execution produces correct results.
    """
    nodes = [
        {"id": "1", "type": "source_file", "name": "Load Data",
         "config": {"file_path": "tests/fixtures/sample_meter_data.csv", "file_type": "csv"},
         "output_table_name": "raw_data"},
        {"id": "2", "type": "transform", "name": "Aggregate",
         "config": {"sql": "SELECT meter_id, SUM(energy_kwh) AS total FROM raw_data GROUP BY meter_id"},
         "output_table_name": "aggregated"},
        {"id": "3", "type": "output", "name": "Output",
         "config": {"source_table": "aggregated"},
         "output_table_name": "aggregated"},
    ]
    edges = [
        {"source_node_id": "1", "target_node_id": "2"},
        {"source_node_id": "2", "target_node_id": "3"},
    ]
    ...

async def test_pipeline_with_parameters():
    """Verify DuckDB variables are accessible in SQL via $param syntax."""
    ...

async def test_transform_error_handling():
    """Verify that bad SQL produces a clear error with node context."""
    ...

async def test_preview_partial_execution():
    """Verify that preview only executes the subgraph up to the target node."""
    ...
```

#### `tests/test_connectors.py`

```python
async def test_file_connector_csv():
    """Load a CSV file and verify row count and schema."""
    ...

async def test_api_connector_interpolation():
    """Verify template interpolation replaces {{param}} and {{env.VAR}} correctly."""
    ...

async def test_api_connector_response_path():
    """Verify nested response extraction with dot notation."""
    ...
```

For the API connector tests, you can mock the HTTP calls using `httpx`'s transport mocking or `respx` library.

### 7. Register the Router

Add the execution router to `main.py`:

```python
from app.routers import execution
app.include_router(execution.router)
```

## Acceptance Criteria

- [ ] `pytest tests/test_dag.py` — all DAG tests pass (sort, cycles, ancestors, validation)
- [ ] `pytest tests/test_executor.py` — pipeline execution works end-to-end with CSV source
- [ ] `pytest tests/test_connectors.py` — file connector loads CSVs correctly, API connector interpolation works
- [ ] `POST /api/pipelines/{id}/run` executes a real pipeline stored in Postgres and returns JSON results
- [ ] `POST /api/pipelines/{id}/preview/{node_id}` returns partial results for a specific node
- [ ] Bad SQL in a transform node returns a clear error with node name, SQL, and DuckDB error message
- [ ] DuckDB sessions are properly cleaned up (no memory leaks from unclosed connections)

## What NOT to Build

- No CRUD endpoints for creating/editing pipelines via API (Stage 3) — for testing, insert data directly into Postgres or use the executor with in-memory data
- No frontend (Stages 4–5)
- No LLM integration (Stage 6)
- No Parquet caching for API sources (defer to Stage 3 or a later polish pass)
