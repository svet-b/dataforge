# Stage 1: Project Scaffold & Database

## Objective

Set up the project skeleton: Docker dev environment, FastAPI backend with sync SQLAlchemy and SQLite, Alembic migrations, and Pydantic models. The backend uses Python 3.13 with uv for dependency management, ruff for formatting, and ty for type-checking. At the end of this stage, `docker compose up` starts a working FastAPI server connected to SQLite with all tables created.

## What You Are Building

DataForge is a data transformation platform where users design visual data pipelines (DAGs of SQL transformations) and execute them on demand. This stage lays the foundation — subsequent stages will add the execution engine, API endpoints, frontend, and LLM integration.

## Deliverables

### 1. Docker Dev Environment

This is a development-only setup. No production optimization is needed.

**docker-compose.yml:**

```yaml
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

volumes:
  appdata:
```

Note: The frontend service will be added in Stage 4. For now, only the backend runs in Docker.

**Dockerfile** (development):

```dockerfile
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

Key requirements:
- Python 3.13
- uv for dependency management
- Backend source mounted as a volume for hot-reload
- SQLite database stored in the `/data` volume

**.env.example:**

```
ANTHROPIC_API_KEY=sk-ant-...
```

### 2. Backend Project Structure

```
backend/
├── pyproject.toml            # Managed by uv; includes ruff + ty config
├── uv.lock
├── alembic.ini
├── alembic/
│   ├── env.py
│   └── versions/
│       └── 001_initial_schema.py
├── app/
│   ├── __init__.py
│   ├── main.py              # FastAPI app, CORS, lifespan
│   ├── config.py             # Settings via pydantic-settings
│   ├── database.py           # Sync SQLAlchemy engine + session (SQLite)
│   ├── models/
│   │   ├── __init__.py
│   │   ├── base.py           # SQLAlchemy declarative base
│   │   ├── pipeline.py
│   │   ├── node.py
│   │   ├── edge.py
│   │   ├── uploaded_file.py
│   │   └── run.py
│   └── schemas/
│       ├── __init__.py
│       ├── pipeline.py       # Pydantic models for API request/response
│       ├── node.py
│       ├── edge.py
│       └── run.py
└── tests/
    ├── conftest.py           # Fixtures: test client, test DB
    └── test_health.py        # Smoke test
```

### 3. Python Dependencies (pyproject.toml)

Use `uv init` to create the project, then `uv add` to add dependencies. The `pyproject.toml` should look like this:

```toml
[project]
name = "dataforge-backend"
version = "0.1.0"
requires-python = ">=3.13"
dependencies = [
    "fastapi>=0.115",
    "uvicorn[standard]>=0.34",
    "sqlalchemy>=2.0",
    "alembic>=1.14",
    "pydantic>=2.0",
    "pydantic-settings>=2.0",
    "duckdb>=1.1",
    "httpx>=0.28",
    "pyyaml>=6.0",
]

[dependency-groups]
dev = [
    "pytest>=8.0",
    "pytest-asyncio>=0.24",
    "httpx",
    "ruff>=0.11",
    "ty>=0.0.15",
]

[tool.ruff]
line-length = 99

[tool.ruff.format]
quote-style = "double"

[tool.ruff.lint]
select = ["E", "F", "I", "UP"]
```

Run `uv sync` to install all dependencies and generate `uv.lock`.

**Tooling commands:**
- `uv run ruff format .` — format all Python files
- `uv run ruff check .` — lint all Python files
- `uv run ty check` — type-check all Python files
- `uv run pytest` — run tests

### 4. Configuration (config.py)

Use pydantic-settings to load from environment variables:

```python
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    # Database
    database_url: str = "sqlite:///data/dataforge.db"

    # Storage
    data_dir: str = "/data"
    max_run_history: int = 20

    # LLM (used in later stages)
    llm_model: str = "claude-sonnet-4-5-20250929"
    anthropic_api_key: str = ""

    # Execution (used in later stages)
    execution_max_memory_mb: int = 4096
    execution_timeout_seconds: int = 300
    preview_cache_ttl: int = 300

    model_config = {"env_file": ".env"}
```

### 5. Database Setup (database.py)

Sync SQLAlchemy with SQLite:

```python
from collections.abc import Generator

from sqlalchemy import create_engine, event
from sqlalchemy.orm import Session, sessionmaker

engine = create_engine(
    settings.database_url,
    connect_args={"check_same_thread": False},  # Required for SQLite with FastAPI
)

# Enable foreign key enforcement for every connection
@event.listens_for(engine, "connect")
def set_sqlite_pragma(dbapi_connection, connection_record):
    cursor = dbapi_connection.cursor()
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.close()

SessionLocal = sessionmaker(bind=engine, expire_on_commit=False)

def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
```

**Note:** Database access is synchronous. FastAPI async endpoints can call sync DB functions — FastAPI runs sync dependencies in a threadpool automatically. The rest of the application (HTTP connectors, LLM calls) remains async.

### 6. SQLAlchemy Models

Implement these models matching the schema below. Use TEXT primary keys for UUIDs (generated in Python via `uuid.uuid4()`), JSON columns, and proper relationships with cascade deletes.

**SQLite Schema (what the Alembic migration should create):**

```sql
CREATE TABLE pipelines (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    parameters JSON NOT NULL DEFAULT '[]',
    created_at TEXT NOT NULL,
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
    output_preview JSON,
    error JSON,
    node_timings JSON
);

CREATE INDEX idx_run_history_pipeline ON run_history(pipeline_id, started_at DESC);
```

**SQLAlchemy model notes:**
- Use `String` for UUID columns, with `default=lambda: str(uuid.uuid4())` in the model.
- Use `JSON` type for structured data columns (SQLAlchemy's `JSON` type works with SQLite).
- Use `String` for timestamp columns, with Python-side defaults generating ISO 8601 strings.
- Remember to enable `PRAGMA foreign_keys = ON` on every connection (handled in `database.py`).

### 7. Pydantic Schemas

Create request/response models for all entities. Key schemas:

```python
# schemas/pipeline.py
class PipelineParameter(BaseModel):
    name: str
    type: str  # "string", "date", "integer", "float"
    default: str | None = None
    description: str | None = None

class PipelineCreate(BaseModel):
    name: str
    description: str | None = None
    parameters: list[PipelineParameter] = []

class PipelineResponse(BaseModel):
    id: UUID
    name: str
    description: str | None
    parameters: list[PipelineParameter]
    created_at: datetime
    updated_at: datetime

class PipelineDetailResponse(PipelineResponse):
    nodes: list[NodeResponse]
    edges: list[EdgeResponse]

# schemas/node.py
class NodeCreate(BaseModel):
    type: Literal["source_api", "source_file", "transform", "output"]
    name: str
    position_x: float = 0
    position_y: float = 0
    config: dict = {}
    output_table_name: str

class NodeResponse(BaseModel):
    id: UUID
    pipeline_id: UUID
    type: str
    name: str
    position_x: float
    position_y: float
    config: dict
    output_table_name: str
```

Define similar schemas for Edge, UploadedFile, and RunHistory.

### 8. FastAPI Application (main.py)

```python
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="DataForge", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:8000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/api/health")
async def health_check():
    return {"status": "ok", "version": "0.1.0"}
```

Do NOT implement the full CRUD routers in this stage — just the health endpoint. The routers come in Stages 2 and 3.

### 9. Alembic Setup

Configure Alembic for sync SQLAlchemy with SQLite:
- `alembic.ini` with the database URL sourced from the same settings
- `alembic/env.py` configured to use the sync engine and import all models
- Set `render_as_batch = True` in Alembic's `env.py` (required for SQLite migration support — SQLite doesn't support `ALTER TABLE` for most operations, so Alembic uses batch mode)
- An initial migration (`001_initial_schema.py`) that creates all tables

### 10. Tests

**conftest.py:** Set up a test SQLite database (in-memory or temp file). Create fixtures for the test client using FastAPI's `TestClient`. Use a transaction rollback strategy or recreate the schema for each test.

**test_health.py:**

```python
async def test_health_endpoint(client):
    response = await client.get("/api/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"
```

## Acceptance Criteria

Before this stage is complete, verify:

- [ ] `docker compose up --build` starts the backend container
- [ ] Alembic migration runs successfully and creates all 5 tables in the SQLite database
- [ ] `GET http://localhost:8000/api/health` returns `{"status": "ok", "version": "0.1.0"}`
- [ ] `GET http://localhost:8000/docs` shows the FastAPI auto-generated docs
- [ ] `uv run pytest` passes with the health check test
- [ ] `uv run ruff check .` reports no lint errors
- [ ] `uv run ruff format --check .` reports no formatting issues
- [ ] `uv run ty check` reports no type errors (or only expected ones from third-party stubs)

## What NOT to Build

- No CRUD API endpoints (Stage 3)
- No execution engine (Stage 2)
- No frontend (Stages 4–5)
- No LLM integration (Stage 6)
- No file upload handling (Stage 3)
