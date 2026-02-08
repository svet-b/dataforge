# DataForge — Design Document

**Data Transformation & Analysis Platform**
**Version:** 0.1 (Draft)
**Date:** February 2026

---

## 1. Executive Summary

DataForge is a self-hosted data transformation and analysis platform that combines the interactive design capabilities of tools like Tableau and Power BI with the pipeline execution model of an ETL system. Users design data processing workflows visually using a DAG (directed acyclic graph) editor, with optional LLM-assisted SQL generation. Once a workflow is finalized, it can be stored and executed on demand via an API, enabling automated, repeatable data processing.

### Core Value Proposition

- **Design visually, execute programmatically.** Build workflows interactively with live data previews, then deploy them as API-callable pipelines.
- **LLM-assisted authoring.** Describe transformations in natural language; the system generates DuckDB SQL. Users can always inspect and edit the generated SQL.
- **Lightweight and self-contained.** DuckDB as the embedded analytical engine means no external database server. The entire platform runs in a single Docker container or a small set of services.

### Motivating Example

An energy utility worker needs to generate monthly bills for industrial customers from smart meter data. The meter data is available via a REST API (JSON). The billing logic involves cleaning raw readings, aggregating across meters, applying time-of-use tariffs, and computing demand charges.

With DataForge, this worker:

1. Designs a pipeline visually — source nodes pull from the meter API and a rate schedule file, transform nodes clean and aggregate the data, and a final node computes bill line items.
2. Previews results at each step using sample data.
3. Saves the pipeline.
4. Each month, an external system (or the worker themselves) calls `POST /api/pipelines/{id}/run` with parameters like `{ "start_date": "2026-02-01", "end_date": "2026-02-28", "customer_id": "ACME-001" }` and receives the computed bill as JSON.

---

## 2. Architecture Overview

### 2.1 High-Level Components

```
┌─────────────────────────────────────────────────────────┐
│                    Frontend (SvelteKit)                  │
│                                                         │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────────┐  │
│  │  DAG Editor  │  │  Data Preview│  │  SQL Editor    │  │
│  │  (Svelvet)   │  │  Panel       │  │  Panel         │  │
│  └──────────────┘  └──────────────┘  └───────────────┘  │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────────┐  │
│  │  LLM Chat    │  │  Parameter   │  │  Run History   │  │
│  │  Panel       │  │  Config      │  │  Panel         │  │
│  └──────────────┘  └──────────────┘  └───────────────┘  │
└───────────────────────┬─────────────────────────────────┘
                        │ HTTP/WebSocket
┌───────────────────────▼─────────────────────────────────┐
│                  Backend (FastAPI / Python)              │
│                                                         │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────────┐  │
│  │  Pipeline    │  │  Pipeline    │  │  LLM          │  │
│  │  Management  │  │  Execution   │  │  Service       │  │
│  │  API         │  │  Engine      │  │               │  │
│  └──────────────┘  └──────────────┘  └───────────────┘  │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────────┐  │
│  │  Source      │  │  DuckDB      │  │  Run History   │  │
│  │  Connectors  │  │  Manager     │  │  Store         │  │
│  └──────────────┘  └──────────────┘  └───────────────┘  │
└─────────────────────────────────────────────────────────┘
                        │
          ┌─────────────┼─────────────┐
          ▼             ▼             ▼
    ┌──────────┐  ┌──────────┐  ┌──────────┐
    │ Upstream  │  │ Uploaded │  │ SQLite   │
    │ REST APIs │  │ Files    │  │ (metadata│
    │           │  │          │  │  store)  │
    └──────────┘  └──────────┘  └──────────┘
```

### 2.2 Component Responsibilities

| Component | Responsibility |
|---|---|
| **Frontend (SvelteKit)** | Visual DAG editor, node configuration, data preview, SQL editing, LLM chat interface, parameter management, run history viewer |
| **Pipeline Management API** | CRUD operations for pipelines, nodes, edges, and parameters. Stores pipeline definitions. |
| **Pipeline Execution Engine** | Resolves the DAG, executes nodes in topological order, manages DuckDB sessions, returns results. |
| **LLM Service** | Accepts natural language + schema context, returns generated SQL. Pluggable provider backend. |
| **Source Connectors** | Fetch data from upstream REST APIs or load uploaded files into DuckDB tables. |
| **DuckDB Manager** | Creates and manages ephemeral DuckDB instances per pipeline execution. Handles table registration, query execution, and result extraction. |
| **Run History Store** | Persists the last N runs per pipeline (parameters, timing, status, output summary, errors). |
| **SQLite (Metadata Store)** | Stores pipeline definitions, node configs, parameters, and run history. Embedded database stored as a single file — no separate container or process needed. Simple, zero-configuration, and perfectly suited for a single-user self-hosted tool. |

### 2.3 Design Principles

1. **Pipelines are data, not code.** A pipeline definition is a JSON-serializable DAG of nodes and edges. This makes it storable, versionable, and portable.
2. **DuckDB is the execution backbone.** Every transform node compiles down to a DuckDB SQL query. This provides a uniform, inspectable, and LLM-friendly execution model.
3. **Design-time and run-time share the same engine.** The preview you see in the UI uses the exact same execution path as an API-triggered run. No surprises when going from design to production.
4. **Fail loudly.** Pipeline execution should produce clear, step-by-step error messages when something goes wrong, including which node failed, the SQL that was attempted, and the DuckDB error.

---

## 3. Data Model

### 3.1 Core Entities

#### Pipeline

```json
{
  "id": "uuid",
  "name": "Industrial Customer Monthly Bill",
  "description": "Generates monthly bill from meter data for industrial customers",
  "parameters": [
    { "name": "start_date", "type": "date", "default": "2026-01-01", "description": "Billing period start" },
    { "name": "end_date", "type": "date", "default": "2026-01-31", "description": "Billing period end" },
    { "name": "customer_id", "type": "string", "default": "ACME-001", "description": "Customer identifier" }
  ],
  "created_at": "2026-02-07T10:00:00Z",
  "updated_at": "2026-02-07T14:30:00Z"
}
```

#### Node

Each node in the DAG has a type and a type-specific configuration.

```json
{
  "id": "uuid",
  "pipeline_id": "uuid",
  "type": "source_api | source_file | transform | output",
  "name": "Fetch Meter Readings",
  "position": { "x": 100, "y": 200 },
  "config": { "...type-specific..." },
  "output_table_name": "meter_readings"
}
```

The `output_table_name` is the DuckDB table name that this node's output is registered as. Downstream nodes reference it in their SQL.

#### Edge

```json
{
  "id": "uuid",
  "pipeline_id": "uuid",
  "source_node_id": "uuid",
  "target_node_id": "uuid"
}
```

#### Run Record

```json
{
  "id": "uuid",
  "pipeline_id": "uuid",
  "parameters": { "start_date": "2026-02-01", "...": "..." },
  "status": "success | failed | running",
  "started_at": "2026-02-07T15:00:00Z",
  "completed_at": "2026-02-07T15:00:03Z",
  "duration_ms": 3012,
  "row_count": 42,
  "output_preview": [ "...first 100 rows as JSON..." ],
  "error": null,
  "node_timings": {
    "node-uuid-1": { "duration_ms": 500, "row_count": 15000 },
    "node-uuid-2": { "duration_ms": 1200, "row_count": 42 }
  }
}
```

### 3.2 Node Type Configurations

#### Source: REST API

```json
{
  "type": "source_api",
  "config": {
    "url_template": "https://metering-api.example.com/readings?customer={{customer_id}}&from={{start_date}}&to={{end_date}}",
    "method": "GET",
    "headers": {
      "Authorization": "Bearer {{env.METERING_API_KEY}}"
    },
    "response_path": "data.readings",
    "pagination": {
      "type": "offset",
      "page_param": "page",
      "limit_param": "limit",
      "limit": 1000
    }
  }
}
```

Key features of the API source:

- **`url_template`**: Supports `{{parameter_name}}` interpolation from pipeline parameters. Also supports `{{env.VAR_NAME}}` for secrets.
- **`response_path`**: JSONPath-like dot notation to extract the array of records from the API response (e.g., if the API wraps results in `{ "data": { "readings": [...] } }`).
- **`pagination`**: Optional. Supports `offset`, `cursor`, and `link_header` strategies.

#### Source: File Upload

```json
{
  "type": "source_file",
  "config": {
    "file_id": "uuid-of-uploaded-file",
    "file_type": "csv | excel | parquet | json",
    "options": {
      "sheet_name": "Sheet1",
      "delimiter": ",",
      "header_row": 1
    }
  }
}
```

At design time, the user uploads a file which is stored locally. At run time, the same file is used (for reference data like rate schedules) or a new file can be supplied via the API.

#### Transform

```json
{
  "type": "transform",
  "config": {
    "sql": "SELECT meter_id, date_trunc('hour', reading_timestamp) AS hour, AVG(voltage) AS avg_voltage, SUM(energy_kwh) AS total_kwh FROM meter_readings WHERE reading_timestamp BETWEEN $start_date AND $end_date GROUP BY meter_id, hour ORDER BY meter_id, hour",
    "description": "Aggregate raw meter readings to hourly intervals",
    "llm_prompt": "Aggregate the raw meter readings to hourly intervals. Average the voltage readings and sum the energy consumption per meter per hour.",
    "llm_generated": true
  }
}
```

The `sql` field is the actual DuckDB SQL that will be executed. The `llm_prompt` and `llm_generated` fields are metadata — they record how the SQL was created for auditability. The user can always edit the `sql` directly.

**Pipeline parameters are available as DuckDB variables** using `$parameter_name` syntax (DuckDB's `SET VARIABLE` / `getvariable()` mechanism).

#### Output

```json
{
  "type": "output",
  "config": {
    "source_table": "final_bill_lines"
  }
}
```

The output node simply designates which table's contents become the pipeline's result. A pipeline must have exactly one output node (v1 simplification — multiple outputs can be added later).

### 3.3 Metadata Storage (SQLite)

SQLite stores all pipeline definitions, uploaded file metadata, and run history. It is an embedded database — a single file on disk with no separate server process. This keeps the deployment simple and is well-suited for a single-user, self-hosted tool.

Schema:

```sql
CREATE TABLE pipelines (
    id TEXT PRIMARY KEY,  -- UUID generated in Python
    name TEXT NOT NULL,
    description TEXT,
    parameters JSON NOT NULL DEFAULT '[]',
    created_at TEXT NOT NULL,  -- ISO 8601 timestamps
    updated_at TEXT NOT NULL
);

CREATE TABLE nodes (
    id TEXT PRIMARY KEY,
    pipeline_id TEXT NOT NULL REFERENCES pipelines(id) ON DELETE CASCADE,
    type TEXT NOT NULL CHECK (type IN ('source_api', 'source_file', 'transform', 'output')),
    name TEXT NOT NULL,
    position_x REAL NOT NULL DEFAULT 0,
    position_y REAL NOT NULL DEFAULT 0,
    config JSON NOT NULL DEFAULT '{}',
    output_table_name TEXT NOT NULL
);

CREATE INDEX idx_nodes_pipeline ON nodes(pipeline_id);

CREATE TABLE edges (
    id TEXT PRIMARY KEY,
    pipeline_id TEXT NOT NULL REFERENCES pipelines(id) ON DELETE CASCADE,
    source_node_id TEXT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
    target_node_id TEXT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE
);

CREATE INDEX idx_edges_pipeline ON edges(pipeline_id);

CREATE TABLE uploaded_files (
    id TEXT PRIMARY KEY,
    pipeline_id TEXT NOT NULL REFERENCES pipelines(id) ON DELETE CASCADE,
    filename TEXT NOT NULL,
    file_type TEXT NOT NULL,
    storage_path TEXT NOT NULL,
    uploaded_at TEXT NOT NULL
);

CREATE TABLE run_history (
    id TEXT PRIMARY KEY,
    pipeline_id TEXT NOT NULL REFERENCES pipelines(id) ON DELETE CASCADE,
    parameters JSON NOT NULL DEFAULT '{}',
    status TEXT NOT NULL CHECK (status IN ('running', 'success', 'failed')),
    started_at TEXT NOT NULL,
    completed_at TEXT,
    duration_ms INTEGER,
    row_count INTEGER,
    output_preview JSON,    -- First 100 rows
    error JSON,
    node_timings JSON
);

CREATE INDEX idx_run_history_pipeline ON run_history(pipeline_id, started_at DESC);
```

**Notes on SQLite specifics:**
- UUIDs are stored as TEXT and generated in Python (`uuid.uuid4()`).
- Timestamps are stored as ISO 8601 TEXT strings and generated in Python.
- JSON columns use SQLite's built-in JSON support (available since SQLite 3.38+).
- Foreign key enforcement must be enabled per connection: `PRAGMA foreign_keys = ON`.

**Database connection:** The backend connects via SQLAlchemy's synchronous engine with the `sqlite3` stdlib driver. Configuration:

```yaml
database:
  url: "sqlite:///data/dataforge.db"
```

**Migrations:** Use Alembic for schema migrations, ensuring smooth upgrades as the schema evolves.

---

## 4. Pipeline Execution Engine

### 4.1 Execution Flow

When a pipeline run is triggered (either via the UI preview or the API):

```
1. RESOLVE PARAMETERS
   - Merge supplied parameters with pipeline defaults
   - Validate types and required parameters

2. RESOLVE EXECUTION ORDER
   - Topologically sort the DAG
   - Detect and reject cycles

3. CREATE DUCKDB SESSION
   - Spin up an in-memory DuckDB instance
   - Set pipeline parameters as DuckDB variables:
       SET VARIABLE start_date = '2026-02-01';
       SET VARIABLE end_date = '2026-02-28';
       SET VARIABLE customer_id = 'ACME-001';

4. EXECUTE NODES IN ORDER
   For each node in topological order:

   a. SOURCE_API node:
      - Interpolate URL template with parameters
      - Fetch data from API (with pagination if configured)
      - Parse JSON response, extract via response_path
      - Load resulting records into DuckDB:
          CREATE TABLE {output_table_name} AS SELECT * FROM read_json_auto('{temp_file}');

   b. SOURCE_FILE node:
      - Load file into DuckDB using appropriate reader:
          CREATE TABLE {output_table_name} AS SELECT * FROM read_csv_auto('{path}');
          CREATE TABLE {output_table_name} AS SELECT * FROM read_parquet('{path}');
          -- etc.

   c. TRANSFORM node:
      - Execute the SQL query:
          CREATE TABLE {output_table_name} AS ({sql});
      - The SQL can reference any upstream node's output_table_name

   d. OUTPUT node:
      - Mark the designated table as the final result

5. EXTRACT RESULTS
   - SELECT * FROM {output_table_name} of the output node
   - Serialize to JSON

6. RECORD RUN HISTORY
   - Store run metadata, timing, and output preview

7. TEAR DOWN
   - Destroy the DuckDB instance (it was in-memory, so just release it)
```

### 4.2 DuckDB Variable System

Pipeline parameters are injected into DuckDB as variables at session initialization. Transform SQL can reference them in two ways:

```sql
-- Using getvariable() function (explicit, works everywhere)
SELECT * FROM meter_readings
WHERE reading_date >= getvariable('start_date')
  AND reading_date <= getvariable('end_date');

-- Using $name shorthand (cleaner, works in most contexts)
SELECT * FROM meter_readings
WHERE reading_date >= $start_date
  AND reading_date <= $end_date;
```

The LLM should be instructed to prefer the `$name` syntax for readability, but the system should document both approaches.

### 4.3 Error Handling

Each node execution is wrapped in error handling. If a node fails:

1. The error is captured with context: node name, node type, SQL (if transform), DuckDB error message.
2. Execution halts (no partial results in v1).
3. The run record is saved with `status: "failed"` and the full error detail.
4. In the UI, the failed node is highlighted red with the error message displayed.

### 4.4 Design-Time Preview

When the user is building a pipeline in the UI:

- Clicking "Preview" on any node triggers a partial pipeline execution up to and including that node (only its ancestor subgraph).
- Results are displayed in a data table below the DAG canvas.
- Preview uses the pipeline's default parameter values (which the user can override in the Parameter Config panel).
- For API sources during design time, results are cached for 5 minutes to avoid hammering the upstream API on every preview click.

---

## 5. API Design

### 5.1 Pipeline Management API

Used by the frontend for CRUD operations. Prefixed with `/api`.

```
GET    /api/pipelines                  List all pipelines
POST   /api/pipelines                  Create a new pipeline
GET    /api/pipelines/{id}             Get pipeline (includes nodes, edges, parameters)
PUT    /api/pipelines/{id}             Update pipeline metadata
DELETE /api/pipelines/{id}             Delete pipeline and all associated data

POST   /api/pipelines/{id}/nodes       Add a node
PUT    /api/pipelines/{id}/nodes/{nid} Update a node
DELETE /api/pipelines/{id}/nodes/{nid} Delete a node

POST   /api/pipelines/{id}/edges       Add an edge
DELETE /api/pipelines/{id}/edges/{eid} Delete an edge

POST   /api/pipelines/{id}/files       Upload a file (multipart)
DELETE /api/pipelines/{id}/files/{fid} Delete an uploaded file

GET    /api/pipelines/{id}/runs        List run history (last N)
GET    /api/pipelines/{id}/runs/{rid}  Get run detail
```

### 5.2 Pipeline Execution API

Used both by the frontend (for previews) and by external systems (for production runs).

```
POST   /api/pipelines/{id}/run
```

**Request body:**

```json
{
  "parameters": {
    "start_date": "2026-02-01",
    "end_date": "2026-02-28",
    "customer_id": "ACME-001"
  }
}
```

**Response (success):**

```json
{
  "run_id": "uuid",
  "status": "success",
  "duration_ms": 3012,
  "row_count": 42,
  "data": [
    { "line_item": "Energy Charge", "amount": 1245.67, "unit": "USD", "...": "..." },
    { "line_item": "Demand Charge", "amount": 450.00, "unit": "USD", "...": "..." }
  ],
  "node_timings": { "...": "..." }
}
```

**Response (failure):**

```json
{
  "run_id": "uuid",
  "status": "failed",
  "error": {
    "node_id": "uuid",
    "node_name": "Aggregate Readings",
    "message": "Column 'volage' not found. Did you mean 'voltage'?",
    "sql": "SELECT ... FROM ..."
  }
}
```

#### Preview Endpoint

```
POST   /api/pipelines/{id}/preview/{node_id}
```

Executes the pipeline up to and including the specified node. Returns the same response shape but only the data from that node's output table. Used by the frontend for step-by-step preview during design.

### 5.3 LLM API

Internal endpoint used by the frontend for SQL generation.

```
POST   /api/llm/generate-sql
```

**Request body:**

```json
{
  "prompt": "Aggregate the raw meter readings to hourly intervals. Average the voltage and sum the energy per meter per hour.",
  "available_tables": [
    {
      "name": "meter_readings",
      "columns": [
        { "name": "meter_id", "type": "VARCHAR" },
        { "name": "reading_timestamp", "type": "TIMESTAMP" },
        { "name": "voltage", "type": "DOUBLE" },
        { "name": "energy_kwh", "type": "DOUBLE" }
      ]
    }
  ],
  "pipeline_parameters": [
    { "name": "start_date", "type": "date" },
    { "name": "end_date", "type": "date" }
  ]
}
```

**Response:**

```json
{
  "sql": "SELECT\n  meter_id,\n  date_trunc('hour', reading_timestamp) AS hour,\n  AVG(voltage) AS avg_voltage,\n  SUM(energy_kwh) AS total_kwh\nFROM meter_readings\nWHERE reading_timestamp BETWEEN $start_date AND $end_date\nGROUP BY meter_id, hour\nORDER BY meter_id, hour",
  "explanation": "Groups readings by meter and hour, averaging voltage and summing energy. Filters to the billing period using pipeline parameters."
}
```

---

## 6. LLM Integration

### 6.1 Architecture

The LLM service is a thin abstraction layer:

```python
class LLMProvider(Protocol):
    async def generate(self, system_prompt: str, user_prompt: str) -> str:
        ...

class ClaudeProvider(LLMProvider):
    """Provider using Anthropic Claude API."""
    ...
```

Configuration is via environment variables or a config file:

```yaml
llm:
  api_key: "${ANTHROPIC_API_KEY}"
  model: "claude-sonnet-4-5-20250929"
```

### 6.2 System Prompt for SQL Generation

The system prompt provided to the LLM is critical to quality. It should include:

1. **DuckDB SQL dialect specifics** — DuckDB supports modern SQL features like `QUALIFY`, `EXCLUDE`, `COLUMNS(*)`, list comprehensions, `PIVOT`/`UNPIVOT`, and has excellent JSON and date/time functions. The prompt should highlight these capabilities and common DuckDB idioms.
2. **Available schema** — Table names, column names, and types from upstream nodes.
3. **Pipeline parameters** — Names, types, and descriptions. Instruct the LLM to use `$param_name` syntax.
4. **Constraints** — The SQL must be a single SELECT statement (since it will be wrapped in `CREATE TABLE ... AS (...)`). No DDL, no side effects.
5. **Style guidance** — Readable SQL with meaningful aliases, appropriate use of CTEs for complex logic.

A template for the system prompt:

```
You are a SQL assistant generating DuckDB SQL queries for a data pipeline.

DuckDB SQL dialect notes:
- Supports standard SQL plus: QUALIFY, EXCLUDE, COLUMNS(*), PIVOT/UNPIVOT
- Date functions: date_trunc, date_part, date_diff, strftime, etc.
- JSON: json_extract, json_extract_string, -> and ->> operators
- Aggregates: quantile_cont, arg_min, arg_max, list(), etc.
- Window functions fully supported with QUALIFY for filtering

Rules:
- Output ONLY a SELECT statement (it will be wrapped in CREATE TABLE AS)
- Reference pipeline parameters using $param_name syntax
- Use CTEs for complex multi-step logic
- Use meaningful column aliases
- Add comments for non-obvious logic

Available tables:
{schema_description}

Pipeline parameters:
{parameter_description}
```

### 6.3 User Interaction Flow

In the frontend, when a user configures a transform node:

1. User types a natural language description in the "Describe transformation" input.
2. User clicks "Generate SQL" (or presses a keyboard shortcut).
3. Frontend sends the prompt + schema context to `/api/llm/generate-sql`.
4. The generated SQL appears in the SQL editor panel, highlighted to indicate it's LLM-generated.
5. User reviews, optionally edits, and clicks "Apply".
6. User can click "Preview" to test the SQL against actual data.
7. If unsatisfied, user can refine their natural language prompt and regenerate, or edit the SQL directly.

The LLM chat panel also supports iterative refinement: "Add a filter for only active meters" appends to the conversation context, and the LLM regenerates with the full history.

---

## 7. Frontend Design

### 7.1 Tech Stack

- **SvelteKit** — Application framework
- **Svelvet** — Node graph / DAG editor library
- **CodeMirror 6** — SQL editor with syntax highlighting (DuckDB dialect)
- **TanStack Table** (Svelte adapter) — Data preview tables with sorting, filtering, pagination
- **Tailwind CSS** — Utility-first styling

### 7.2 Layout

```
┌──────────────────────────────────────────────────────────────┐
│  Toolbar: [Pipeline Name] [Save] [Run] [Parameters] [History]│
├──────────────────────────────────────────────────────────────┤
│                                                              │
│                    DAG Canvas (Svelvet)                       │
│                                                              │
│   ┌──────┐       ┌──────────┐       ┌──────────┐            │
│   │ Meter│──────▶│ Hourly   │──────▶│ Compute  │──────▶[OUT]│
│   │ API  │       │ Aggregate│       │ Charges  │            │
│   └──────┘       └──────────┘       └──────────┘            │
│                       │                                      │
│   ┌──────┐            │                                      │
│   │ Rate │────────────┘                                      │
│   │ File │                                                   │
│   └──────┘                                                   │
│                                                              │
├──────────────────────────────────────────────────────────────┤
│  Node Detail Panel (appears when node selected)              │
│  ┌────────────────────────┬──────────────────────────────┐   │
│  │  LLM Chat / Config     │  SQL Editor (CodeMirror)     │   │
│  │                        │                              │   │
│  │  "Aggregate readings   │  SELECT meter_id,            │   │
│  │   to hourly intervals" │    date_trunc('hour', ...)   │   │
│  │                        │    ...                       │   │
│  │  [Generate SQL]        │  [Apply] [Preview]           │   │
│  ├────────────────────────┴──────────────────────────────┤   │
│  │  Data Preview Table                                   │   │
│  │  ┌──────────┬─────────────┬───────────┬─────────────┐ │   │
│  │  │ meter_id │ hour        │ avg_volt  │ total_kwh   │ │   │
│  │  ├──────────┼─────────────┼───────────┼─────────────┤ │   │
│  │  │ M-001    │ 2026-01-01… │ 232.1     │ 45.6        │ │   │
│  │  └──────────┴─────────────┴───────────┴─────────────┘ │   │
│  └───────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────┘
```

### 7.3 Node Types — Visual Design

Each node type should have a distinct visual appearance on the canvas:

| Node Type | Color / Icon | Description |
|---|---|---|
| Source: API | Blue, cloud/download icon | Fetches from external REST API |
| Source: File | Green, file icon | Loads from uploaded file |
| Transform | Orange, gear/code icon | SQL transformation |
| Output | Purple, flag/export icon | Designates final output |

### 7.4 Key UI Interactions

**Adding a node:** Right-click canvas → context menu with node types, or drag from a palette sidebar.

**Connecting nodes:** Drag from a node's output port to another node's input port. Edges are directional. The system prevents cycles (rejects edge creation that would introduce a cycle).

**Configuring a source node (API):** Click the node → Node Detail Panel shows a form with fields for URL template, method, headers, response path, pagination config. A "Test Connection" button fetches a sample response and shows a preview.

**Configuring a transform node:** Click the node → Node Detail Panel shows the LLM chat pane (left) and SQL editor (right). The schema of upstream tables (columns, types) is displayed as context. User can either write SQL directly or use the LLM.

**Previewing data:** Click "Preview" on any node → the system executes the subgraph up to that node and displays results in the Data Preview Table. Column types are shown in the header. Row count is displayed.

**Managing parameters:** Click "Parameters" in the toolbar → modal/sidebar showing pipeline parameters. User can add, edit, delete parameters with name, type, default value, and description. During design, default values are used for previews.

### 7.5 Node Configuration Panel by Type

**API Source configuration form fields:**

- URL Template (text input, with parameter autocomplete)
- HTTP Method (dropdown: GET, POST)
- Headers (key-value editor, supports `{{env.VAR_NAME}}`)
- Request Body Template (for POST, JSON editor with parameter interpolation)
- Response Path (dot notation, with autocomplete from test response)
- Pagination type (none, offset, cursor, link_header) + related fields
- "Test Connection" button → shows raw response + extracted records

**File Source configuration form fields:**

- File upload drag-and-drop zone
- File type (auto-detected, overridable)
- CSV: delimiter, header row, encoding
- Excel: sheet name/index
- Preview of parsed data

**Transform configuration:**

- Natural language input + "Generate SQL" button
- CodeMirror SQL editor (with DuckDB syntax highlighting)
- Schema reference sidebar (upstream table names, columns, types)
- Parameter reference sidebar (available `$param` variables)
- "Apply" and "Preview" buttons

---

## 8. Source Connector Design

### 8.1 Connector Interface

```python
class SourceConnector(Protocol):
    async def fetch(
        self,
        config: dict,
        parameters: dict[str, Any],
        env: dict[str, str]
    ) -> Path:
        """
        Fetch data and return path to a temporary file
        that DuckDB can ingest (JSON, CSV, or Parquet).
        """
        ...

    def duckdb_load_sql(self, table_name: str, file_path: Path) -> str:
        """
        Return the DuckDB SQL to load the fetched file into a table.
        E.g.: CREATE TABLE {table_name} AS SELECT * FROM read_json_auto('{file_path}');
        """
        ...
```

### 8.2 API Connector

Responsibilities:

1. **Template interpolation** — Replace `{{param_name}}` in URL, headers, and body with parameter values. Replace `{{env.VAR_NAME}}` with environment variable values.
2. **HTTP request** — Execute the request using `httpx` (async).
3. **Response extraction** — Navigate the JSON response using `response_path` to find the data array.
4. **Pagination** — If configured, iterate through pages until exhausted, concatenating results.
5. **Write to temp file** — Write the extracted records as newline-delimited JSON for initial DuckDB ingestion via `read_json_auto`. This avoids an expensive JSON→Parquet conversion step on the write path, since DuckDB's ingestion is fast and immediately converts to its columnar in-memory format.
6. **Cache as Parquet (optional)** — After successful ingestion, if preview caching is enabled, the system writes the DuckDB table out as a Parquet file to the cache directory. Subsequent preview requests within the cache TTL read from the Parquet file instead of re-fetching from the API, providing significantly faster load times (columnar, compressed, typed).

The caching flow:

```
First request:  API → ndjson (temp) → DuckDB ingest → result
                                     └→ COPY TO '{cache_path}' (FORMAT PARQUET)

Cached request: Parquet (cache) → DuckDB ingest → result
                (skips API call entirely)
```

This gives us the best of both worlds: minimal write-path overhead (no schema inference or Parquet encoding on the hot path), with fast reads from cache when available.

### 8.3 File Connector

Responsibilities:

1. Look up the uploaded file's storage path.
2. Return the path directly (DuckDB can read CSV, Parquet, and JSON natively).
3. Generate appropriate `read_csv_auto` / `read_parquet` / `read_json_auto` SQL with any user-specified options (delimiter, header row, etc.).

### 8.4 Future Connectors (v2+)

The connector interface is designed to be extensible. Future connectors could include:

- **Database connector** — PostgreSQL, MySQL, etc. via DuckDB's `postgres_scan` / `mysql_scan` extensions.
- **S3 / GCS connector** — Read Parquet or CSV from cloud storage.
- **GraphQL connector** — For APIs that use GraphQL.

---

## 9. Configuration & Deployment

### 9.1 Configuration

All configuration via environment variables (12-factor app), with optional `config.yaml` override.

```yaml
# config.yaml
server:
  host: "0.0.0.0"
  port: 8000

database:
  url: "sqlite:///data/dataforge.db"

storage:
  data_dir: "/data"            # Uploaded files, cache, temp files
  max_run_history: 20          # Runs to keep per pipeline

llm:
  model: "claude-sonnet-4-5-20250929"
  api_key: "${ANTHROPIC_API_KEY}"

execution:
  max_memory_mb: 4096          # DuckDB memory limit per run
  timeout_seconds: 300         # Max pipeline execution time
  preview_cache_ttl: 300       # Seconds to cache API responses as Parquet during preview
```

### 9.2 Docker Development Environment

The application uses Docker Compose for local development. Since we use SQLite (embedded), there is no separate database container. The compose file mounts source directories as volumes for hot-reload.

```yaml
# docker-compose.yml  (development)
services:
  backend:
    build:
      context: .
      dockerfile: Dockerfile
    ports:
      - "8000:8000"
    environment:
      DATABASE_URL: "sqlite:////data/dataforge.db"
      ANTHROPIC_API_KEY: "${ANTHROPIC_API_KEY:-}"
    volumes:
      - ./backend:/app/backend
      - appdata:/data
    command: uv run uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload

  frontend:
    build:
      context: ./frontend
      dockerfile: Dockerfile.dev
    ports:
      - "5173:5173"
    volumes:
      - ./frontend:/app
      - /app/node_modules
    command: npm run dev -- --host 0.0.0.0

volumes:
  appdata:
```

```dockerfile
# Dockerfile  (backend, development)
FROM python:3.13-slim

# Install uv
COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/

WORKDIR /app

# Copy dependency files and install
COPY backend/pyproject.toml backend/uv.lock ./backend/
RUN cd backend && uv sync

# Source code is volume-mounted in dev, but copy for image layer caching
COPY backend/ ./backend/

WORKDIR /app/backend
CMD ["uv", "run", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]
```

```dockerfile
# frontend/Dockerfile.dev
FROM node:20-slim

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]
```

### 9.3 Data Directory Structure

```
/data/
  files/                    # Uploaded user files
    {pipeline_id}/
      {file_id}_{filename}
  cache/                    # Parquet cache for API source responses
    {pipeline_id}/
      {node_id}_{param_hash}.parquet
  temp/                     # Ephemeral files (ndjson API responses, etc.)
```

The `/data` directory holds the SQLite database file, uploaded files, cached Parquet, and ephemeral temp files.

---

## 10. Security Considerations

### 10.1 SQL Injection

Since users (and the LLM) author SQL directly, and that SQL runs against an ephemeral, isolated DuckDB instance:

- **The blast radius is limited.** Each pipeline run creates a fresh in-memory DuckDB. There's no persistent database to corrupt, and no access to the host filesystem beyond the data directory.
- **Restrict DuckDB capabilities.** Disable DuckDB extensions that allow filesystem access (`httpfs`, `file_system`) or shell execution at the session level. Only allow `read_json_auto`, `read_csv_auto`, `read_parquet` on explicitly whitelisted file paths.
- **Validate SQL structure.** Before executing, do a lightweight check that the SQL is a SELECT statement (no DDL, no `COPY`, no `ATTACH`). This can be a simple regex/parser check, not a full SQL validator.

### 10.2 Secrets Management

API keys and other secrets should never be stored in pipeline definitions:

- The `{{env.VAR_NAME}}` syntax in API source configs resolves against server-side environment variables.
- The frontend never receives or displays resolved secret values — only the template syntax.
- For v2+, consider a proper secrets store integration (Vault, etc.).

### 10.3 API Source Safety

When fetching from upstream APIs:

- Enforce a configurable timeout (default 30s per request).
- Enforce a maximum response size (default 100MB per source node).
- Rate limiting on the execution API to prevent abuse.
- Optionally restrict allowed upstream domains via a whitelist in config.

---

## 11. Implementation Plan

### Phase 1: Foundation (Weeks 1–3)

**Goal:** Core backend with pipeline CRUD, DuckDB execution of a hardcoded pipeline, and a minimal frontend showing the DAG.

Deliverables:

- FastAPI project scaffold with SQLite metadata store (sync SQLAlchemy)
- Pipeline, Node, Edge CRUD endpoints
- DuckDB execution engine: topological sort, node execution, parameter injection
- File source connector (CSV only)
- Minimal SvelteKit app with Svelvet DAG canvas
- Can create a pipeline with file source → transform → output, execute it, and see JSON results

### Phase 2: Interactive Design (Weeks 4–6)

**Goal:** Full design-time experience in the UI.

Deliverables:

- Node configuration panels for all node types
- CodeMirror SQL editor integration
- Data preview (partial pipeline execution, result table display)
- Parameter management UI
- API source connector with template interpolation and pagination
- File upload and management

### Phase 3: LLM Integration (Weeks 7–8)

**Goal:** LLM-assisted SQL generation.

Deliverables:

- LLM service with Claude (Anthropic) provider
- System prompt engineering for DuckDB SQL generation
- LLM chat panel in the frontend (per transform node)
- Schema context injection (upstream table schemas passed to LLM)
- Iterative refinement (conversation history maintained per node)

### Phase 4: Production Readiness (Weeks 9–10)

**Goal:** Reliable execution, history, and deployment.

Deliverables:

- Run history storage and UI
- Error handling and display (per-node errors, clear messages)
- Execution timeout and memory limits
- Preview caching for API sources
- Docker Compose dev environment
- Configuration via environment variables and config.yaml
- Security hardening (DuckDB sandboxing, SQL validation, secrets handling)
- Basic load testing and performance benchmarking

---

## 12. Tech Stack Summary

| Layer | Technology | Rationale |
|---|---|---|
| Frontend framework | SvelteKit | Lightweight, excellent reactivity, good DX |
| DAG editor | Svelvet | Svelte-native node graph library |
| SQL editor | CodeMirror 6 | Best-in-class code editor, DuckDB mode available |
| Data tables | TanStack Table (Svelte) | Feature-rich, framework-agnostic |
| Styling | Tailwind CSS | Rapid, consistent styling |
| Backend framework | FastAPI (Python 3.13) | Async, auto-generated OpenAPI docs, great ecosystem |
| Analytical engine | DuckDB (Python bindings) | Embeddable, fast OLAP, excellent SQL dialect, native JSON/CSV/Parquet support |
| Metadata store | SQLite | Embedded, zero-config, single-file database — ideal for self-hosted single-user tool |
| DB access | SQLAlchemy (sync) | Sync engine with SQLite; simple and reliable |
| Migrations | Alembic | Reliable schema evolution |
| Package manager | uv (astral.sh) | Fast Python package and project manager |
| Formatter | ruff | Fast Python linter and formatter |
| Type checker | mypy | Established type checker |
| HTTP client | httpx | Async Python HTTP client for API source connectors |
| LLM client | anthropic SDK | Claude API for LLM-assisted SQL generation |
| Containerization | Docker Compose | Dev environment with hot-reload |

---

## 13. Open Questions & Future Considerations

These are explicitly deferred from v1 but should inform architectural decisions:

1. **Multi-user and authentication.** The data model includes no `user_id` currently. When adding multi-user support, add `user_id` to `pipelines` and `run_history`, and introduce an auth middleware. At that point, consider migrating from SQLite to PostgreSQL for concurrent multi-user access.

2. **Scheduled execution.** Adding cron-like scheduling is a thin layer on top of the existing API execution. A separate scheduler service (or even a systemd timer / cron job) can call `POST /api/pipelines/{id}/run` on a schedule.

3. **Multiple output formats.** The output node could gain a `format` config supporting CSV, Excel, PDF, etc. The execution engine would add a final serialization step.

4. **Pipeline versioning.** Store pipeline definitions as immutable versions. Allow rollback. Important for audit trails in regulated industries (like energy billing).

5. **Streaming / large datasets.** If datasets exceed memory, DuckDB can be configured to use disk-based storage. The execution engine could also support chunked processing (e.g., process one customer at a time and concatenate results).

6. **Pipeline templates / marketplace.** Allow users to share and reuse pipeline patterns (e.g., "Standard Monthly Bill" template).

7. **Webhook output.** Push results to a downstream system on completion rather than only returning via API response.

8. **Real-time / event-driven execution.** Trigger pipeline runs from a message queue (Kafka, RabbitMQ) for near-real-time processing.

---

## Appendix A: Example Pipeline — Industrial Customer Monthly Bill

This walkthrough shows how the motivating example would be implemented.

### Pipeline Parameters

| Name | Type | Default | Description |
|---|---|---|---|
| start_date | date | 2026-01-01 | Billing period start |
| end_date | date | 2026-01-31 | Billing period end |
| customer_id | string | ACME-001 | Customer identifier |

### Nodes

**Node 1: Fetch Meter Readings** (source_api)

```
URL: https://metering.example.com/api/readings?customer={{customer_id}}&from={{start_date}}&to={{end_date}}
Response Path: data.readings
Output Table: raw_readings
```

**Node 2: Load Rate Schedule** (source_file)

```
File: rate_schedule_2026.csv
Output Table: rate_schedule
```

**Node 3: Hourly Aggregation** (transform)

```sql
SELECT
    meter_id,
    date_trunc('hour', reading_timestamp) AS hour,
    AVG(voltage_v) AS avg_voltage,
    MAX(current_a) AS peak_current,
    SUM(active_energy_kwh) AS energy_kwh,
    SUM(reactive_energy_kvarh) AS reactive_kvarh
FROM raw_readings
GROUP BY meter_id, date_trunc('hour', reading_timestamp)
```
Output Table: `hourly_readings`

**Node 4: Compute Charges** (transform)

```sql
WITH daily_demand AS (
    SELECT
        date_trunc('day', hour) AS day,
        MAX(energy_kwh * 4) AS peak_demand_kw  -- 15min equivalent from hourly
    FROM hourly_readings
    GROUP BY date_trunc('day', hour)
),
billing_period AS (
    SELECT
        SUM(h.energy_kwh) AS total_kwh,
        SUM(h.reactive_kvarh) AS total_kvarh,
        MAX(d.peak_demand_kw) AS max_demand_kw
    FROM hourly_readings h
    CROSS JOIN daily_demand d
)
SELECT
    'Energy Charge' AS line_item,
    bp.total_kwh AS quantity,
    'kWh' AS unit,
    rs.energy_rate AS rate,
    ROUND(bp.total_kwh * rs.energy_rate, 2) AS amount
FROM billing_period bp
CROSS JOIN rate_schedule rs
WHERE rs.charge_type = 'energy'

UNION ALL

SELECT
    'Demand Charge',
    bp.max_demand_kw,
    'kW',
    rs.demand_rate,
    ROUND(bp.max_demand_kw * rs.demand_rate, 2)
FROM billing_period bp
CROSS JOIN rate_schedule rs
WHERE rs.charge_type = 'demand'

UNION ALL

SELECT
    'Reactive Power Penalty',
    bp.total_kvarh,
    'kVArh',
    rs.reactive_rate,
    ROUND(bp.total_kvarh * rs.reactive_rate, 2)
FROM billing_period bp
CROSS JOIN rate_schedule rs
WHERE rs.charge_type = 'reactive'
```
Output Table: `bill_lines`

**Node 5: Output** (output)

```
Source Table: bill_lines
```

### DAG

```
[Fetch Meter Readings] ──▶ [Hourly Aggregation] ──▶ [Compute Charges] ──▶ [Output]
                                      ▲
[Load Rate Schedule] ─────────────────┘
```

### API Call

```bash
curl -X POST http://localhost:8000/api/pipelines/bill-pipeline-id/run \
  -H "Content-Type: application/json" \
  -d '{
    "parameters": {
      "start_date": "2026-02-01",
      "end_date": "2026-02-28",
      "customer_id": "ACME-001"
    }
  }'
```

### Response

```json
{
  "run_id": "run-uuid",
  "status": "success",
  "duration_ms": 2150,
  "row_count": 3,
  "data": [
    { "line_item": "Energy Charge", "quantity": 12450.5, "unit": "kWh", "rate": 0.085, "amount": 1058.29 },
    { "line_item": "Demand Charge", "quantity": 245.3, "unit": "kW", "rate": 12.50, "amount": 3066.25 },
    { "line_item": "Reactive Power Penalty", "quantity": 1230.0, "unit": "kVArh", "rate": 0.02, "amount": 24.60 }
  ]
}
```
