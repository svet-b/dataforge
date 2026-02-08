# Stage 3: Pipeline Management API

## Objective

Implement the full CRUD API for pipelines, nodes, edges, and uploaded files. This gives the frontend (and API users) everything they need to create, edit, and manage pipeline definitions. Includes validation logic for DAG integrity.

## Prerequisites

Stages 1–2 are complete. The project has:
- Docker dev environment with SQLite + sync SQLAlchemy
- Database models and schemas
- Pipeline execution engine (DuckDB, DAG resolver, connectors)
- Execution endpoints (`/run`, `/preview`)

**Read the existing code first** — especially the models, schemas, and execution router — to match conventions.

## Deliverables

### 1. Pipeline Router (`app/routers/pipelines.py`)

Implement all CRUD endpoints:

```
GET    /api/pipelines                  List all pipelines (summary only)
POST   /api/pipelines                  Create a new pipeline
GET    /api/pipelines/{id}             Get full pipeline detail (nodes, edges, parameters)
PUT    /api/pipelines/{id}             Update pipeline metadata (name, description, parameters)
DELETE /api/pipelines/{id}             Delete pipeline and all related data (cascade)

POST   /api/pipelines/{id}/nodes       Add a node
PUT    /api/pipelines/{id}/nodes/{nid} Update a node (config, name, position, output_table_name)
DELETE /api/pipelines/{id}/nodes/{nid} Delete a node (also deletes connected edges)

POST   /api/pipelines/{id}/edges       Add an edge
DELETE /api/pipelines/{id}/edges/{eid} Delete an edge

POST   /api/pipelines/{id}/files       Upload a file (multipart form data)
DELETE /api/pipelines/{id}/files/{fid} Delete an uploaded file (also deletes from disk)
GET    /api/pipelines/{id}/files       List uploaded files for a pipeline

GET    /api/pipelines/{id}/runs        List run history (last N, newest first)
GET    /api/pipelines/{id}/runs/{rid}  Get run detail
```

### 2. Endpoint Specifications

#### List Pipelines

```
GET /api/pipelines
```

Returns a summary list — id, name, description, parameter count, node count, created_at, updated_at. Sorted by updated_at descending.

Response:
```json
[
  {
    "id": "uuid",
    "name": "Monthly Billing",
    "description": "...",
    "parameter_count": 3,
    "node_count": 5,
    "created_at": "...",
    "updated_at": "..."
  }
]
```

#### Get Pipeline Detail

```
GET /api/pipelines/{id}
```

Returns the full pipeline including all nodes and edges (everything needed to render the DAG in the UI).

Response: `PipelineDetailResponse` — pipeline fields + `nodes: list[NodeResponse]` + `edges: list[EdgeResponse]`

#### Create Pipeline

```
POST /api/pipelines
Body: { "name": "My Pipeline", "description": "...", "parameters": [...] }
```

Creates a new empty pipeline (no nodes or edges). Returns the created pipeline.

#### Update Pipeline

```
PUT /api/pipelines/{id}
Body: { "name": "Updated Name", "description": "...", "parameters": [...] }
```

Updates metadata only. Returns the updated pipeline. Sets `updated_at` to now.

#### Delete Pipeline

```
DELETE /api/pipelines/{id}
```

Deletes the pipeline and all related data (nodes, edges, files, run history). Cascade deletes should be handled by the database foreign keys, but also clean up uploaded files from disk.

#### Add Node

```
POST /api/pipelines/{id}/nodes
Body: {
  "type": "transform",
  "name": "Aggregate Readings",
  "position_x": 300,
  "position_y": 200,
  "config": { "sql": "SELECT ..." },
  "output_table_name": "hourly_readings"
}
```

**Validation:**
- `output_table_name` must be unique within the pipeline
- `output_table_name` must match `^[a-zA-Z_][a-zA-Z0-9_]*$` (valid SQL identifier)
- `type` must be one of: `source_api`, `source_file`, `transform`, `output`

Returns the created node. Also sets pipeline `updated_at`.

#### Update Node

```
PUT /api/pipelines/{id}/nodes/{nid}
Body: { "name": "...", "config": {...}, "position_x": ..., "position_y": ..., "output_table_name": "..." }
```

All fields are optional (partial update). Validate `output_table_name` uniqueness if changed.

#### Delete Node

```
DELETE /api/pipelines/{id}/nodes/{nid}
```

Deletes the node AND all edges connected to it (both incoming and outgoing). This prevents orphaned edges.

#### Add Edge

```
POST /api/pipelines/{id}/edges
Body: { "source_node_id": "uuid", "target_node_id": "uuid" }
```

**Validation (critical):**
- Both nodes must exist and belong to the same pipeline
- Adding this edge must NOT create a cycle in the DAG
- No duplicate edges (same source → target)

**Cycle detection:** After tentatively adding the edge, run topological sort on the full graph. If it detects a cycle, reject the edge with a 400 error.

Returns the created edge.

#### Delete Edge

```
DELETE /api/pipelines/{id}/edges/{eid}
```

Simple delete. Returns 204.

#### Upload File

```
POST /api/pipelines/{id}/files
Content-Type: multipart/form-data
Body: file (the actual file)
```

- Store the file to disk at `{data_dir}/files/{pipeline_id}/{file_id}_{original_filename}`
- Create a record in the `uploaded_files` table
- Auto-detect file type from extension (.csv, .json, .parquet, .xlsx, .xls)
- Return file metadata including the file_id

#### List Files

```
GET /api/pipelines/{id}/files
```

Returns list of uploaded files for the pipeline (id, filename, file_type, uploaded_at).

#### Delete File

```
DELETE /api/pipelines/{id}/files/{fid}
```

Delete from both database and disk. Return 204.

#### List Run History

```
GET /api/pipelines/{id}/runs?limit=20
```

Returns last N runs, newest first. Include: id, status, parameters, started_at, duration_ms, row_count, error summary (not full output_preview).

#### Get Run Detail

```
GET /api/pipelines/{id}/runs/{rid}
```

Returns full run detail including output_preview (first 100 rows), node_timings, and full error.

### 3. Validation Service (`app/services/validation.py`)

Centralize validation logic that's reused across endpoints:

```python
import re

TABLE_NAME_PATTERN = re.compile(r'^[a-zA-Z_][a-zA-Z0-9_]*$')

def validate_table_name(name: str, pipeline_id: UUID, exclude_node_id: UUID | None, db: Session) -> str | None:
    """Returns error message if invalid, None if valid."""
    if not TABLE_NAME_PATTERN.match(name):
        return f"Invalid table name '{name}'. Must be a valid SQL identifier."
    # Check uniqueness within pipeline (excluding the current node for updates)
    ...

def validate_no_cycles(pipeline_id: UUID, new_source: UUID, new_target: UUID, db: Session) -> str | None:
    """Returns error message if adding this edge would create a cycle."""
    # Load all nodes and edges, add the new edge, run topological sort
    ...
```

### 4. Error Responses

Use consistent error response format:

```python
from fastapi import HTTPException

# 404 for not found
raise HTTPException(status_code=404, detail="Pipeline not found")

# 400 for validation errors
raise HTTPException(status_code=400, detail="Adding this edge would create a cycle in the DAG")

# 409 for conflicts
raise HTTPException(status_code=409, detail="A node with output_table_name 'readings' already exists in this pipeline")
```

### 5. Register Router

Add to `main.py`:

```python
from app.routers import pipelines
app.include_router(pipelines.router)
```

### 6. Tests (`tests/test_api.py`)

Write comprehensive API tests using the async test client:

```python
# Pipeline CRUD
async def test_create_pipeline():
    """Create a pipeline with name, description, and parameters."""
    ...

async def test_list_pipelines():
    """Create several pipelines, verify list returns them sorted by updated_at."""
    ...

async def test_get_pipeline_detail():
    """Create pipeline with nodes and edges, verify detail response includes all."""
    ...

async def test_update_pipeline():
    """Update name and parameters, verify updated_at changes."""
    ...

async def test_delete_pipeline_cascades():
    """Delete pipeline, verify nodes, edges, and runs are also deleted."""
    ...

# Node CRUD
async def test_add_node():
    """Add a node, verify it appears in pipeline detail."""
    ...

async def test_add_node_duplicate_table_name():
    """Adding a node with a duplicate output_table_name should return 409."""
    ...

async def test_add_node_invalid_table_name():
    """Table names like '123abc' or 'drop table' should be rejected."""
    ...

async def test_delete_node_removes_edges():
    """Deleting a node should also delete all its connected edges."""
    ...

# Edge CRUD
async def test_add_edge():
    """Add an edge between two nodes."""
    ...

async def test_add_edge_creates_cycle():
    """A -> B -> C, then adding C -> A should return 400."""
    ...

async def test_add_edge_duplicate():
    """Adding the same edge twice should return 409."""
    ...

async def test_add_edge_cross_pipeline():
    """Edge between nodes in different pipelines should return 400."""
    ...

# File upload
async def test_upload_csv():
    """Upload a CSV file, verify it's stored and listed."""
    ...

async def test_delete_file_removes_from_disk():
    """Delete a file, verify it's gone from both DB and disk."""
    ...

# Run history
async def test_run_history_returns_recent():
    """Execute pipeline several times, verify history returns newest first."""
    ...

# Integration: full workflow
async def test_full_workflow():
    """
    1. Create pipeline with parameters
    2. Add source_file node
    3. Upload a CSV
    4. Add transform node with SQL
    5. Add output node
    6. Connect with edges
    7. Execute pipeline
    8. Verify results
    9. Check run history
    """
    ...
```

## Acceptance Criteria

- [ ] All CRUD endpoints work correctly (create, read, update, delete for pipelines, nodes, edges, files)
- [ ] Cycle detection rejects invalid edges with a clear error message
- [ ] Duplicate output_table_name is rejected
- [ ] Invalid table names are rejected
- [ ] Deleting a node cascades to its edges
- [ ] Deleting a pipeline cascades to all related data
- [ ] File upload stores to disk and creates a DB record
- [ ] File delete removes from both DB and disk
- [ ] Run history endpoint returns last N runs, newest first
- [ ] Full workflow test passes: create pipeline → add nodes → upload file → connect → execute → check history
- [ ] All existing tests (from Stages 1–2) still pass
- [ ] `GET /api/docs` shows all endpoints with correct request/response schemas

## What NOT to Build

- No frontend (Stages 4–5)
- No LLM integration (Stage 6)
- No Parquet caching (polish pass)
- No authentication or multi-user (deferred)
