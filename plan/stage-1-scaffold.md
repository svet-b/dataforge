# Stage 1: Project Scaffold & Database

## Objective

Set up the project skeleton: Docker environment with PostgreSQL, FastAPI backend with async SQLAlchemy, Alembic migrations, and Pydantic models. At the end of this stage, `docker-compose up` starts a working FastAPI server connected to Postgres with all tables created.

## What You Are Building

DataForge is a data transformation platform where users design visual data pipelines (DAGs of SQL transformations) and execute them on demand. This stage lays the foundation — subsequent stages will add the execution engine, API endpoints, frontend, and LLM integration.

## Deliverables

### 1. Docker Environment

**docker-compose.yml:**

```yaml
version: "3.8"

services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: dataforge
      POSTGRES_USER: dataforge
      POSTGRES_PASSWORD: "${DB_PASSWORD:-changeme}"
    volumes:
      - pgdata:/var/lib/postgresql/data
    ports:
      - "5432:5432"
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U dataforge"]
      interval: 5s
      timeout: 3s
      retries: 5

  app:
    build: .
    ports:
      - "8000:8000"
    environment:
      DB_HOST: postgres
      DB_PORT: "5432"
      DB_NAME: dataforge
      DB_USER: dataforge
      DB_PASSWORD: "${DB_PASSWORD:-changeme}"
    volumes:
      - appdata:/data
    depends_on:
      postgres:
        condition: service_healthy

volumes:
  pgdata:
  appdata:
```

Also create a **docker-compose.dev.yml** override that mounts the source directories for hot-reload:

```yaml
version: "3.8"
services:
  app:
    build:
      context: .
      target: dev
    volumes:
      - ./backend:/app/backend
      - appdata:/data
    command: uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

**Dockerfile** (multi-stage: dev + production):

```dockerfile
FROM python:3.12-slim AS base
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends gcc libpq-dev && rm -rf /var/lib/apt/lists/*

FROM base AS dev
COPY backend/pyproject.toml backend/
RUN pip install -e backend/[dev]
COPY backend/ backend/
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]

FROM base AS production
COPY backend/ backend/
RUN pip install backend/
CMD ["sh", "-c", "cd backend && alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port 8000"]
```

Adapt the Dockerfile as needed — the key requirements are:
- Python 3.12
- Backend dependencies installed
- Alembic migrations run on startup in production
- Dev mode supports hot-reload

**.env.example:**

```
DB_PASSWORD=changeme
ANTHROPIC_API_KEY=sk-ant-...
```

### 2. Backend Project Structure

```
backend/
├── pyproject.toml
├── alembic.ini
├── alembic/
│   ├── env.py
│   └── versions/
│       └── 001_initial_schema.py
├── app/
│   ├── __init__.py
│   ├── main.py              # FastAPI app, CORS, lifespan
│   ├── config.py             # Settings via pydantic-settings
│   ├── database.py           # Async SQLAlchemy engine + session
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
    ├── conftest.py           # Fixtures: async test client, test DB
    └── test_health.py        # Smoke test
```

### 3. Python Dependencies (pyproject.toml)

```toml
[project]
name = "dataforge-backend"
version = "0.1.0"
requires-python = ">=3.12"
dependencies = [
    "fastapi>=0.115",
    "uvicorn[standard]>=0.30",
    "sqlalchemy[asyncio]>=2.0",
    "asyncpg>=0.30",
    "alembic>=1.14",
    "pydantic>=2.0",
    "pydantic-settings>=2.0",
    "duckdb>=1.1",
    "httpx>=0.27",
    "pyyaml>=6.0",
]

[project.optional-dependencies]
dev = [
    "pytest>=8.0",
    "pytest-asyncio>=0.24",
    "httpx",  # for TestClient
]
```

### 4. Configuration (config.py)

Use pydantic-settings to load from environment variables:

```python
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    # Database
    db_host: str = "localhost"
    db_port: int = 5432
    db_name: str = "dataforge"
    db_user: str = "dataforge"
    db_password: str = "changeme"

    # Storage
    data_dir: str = "/data"
    max_run_history: int = 20

    # LLM (used in later stages)
    llm_provider: str = "claude"
    llm_model: str = "claude-sonnet-4-5-20250929"
    anthropic_api_key: str = ""

    # Execution (used in later stages)
    execution_max_memory_mb: int = 4096
    execution_timeout_seconds: int = 300
    preview_cache_ttl: int = 300

    @property
    def database_url(self) -> str:
        return f"postgresql+asyncpg://{self.db_user}:{self.db_password}@{self.db_host}:{self.db_port}/{self.db_name}"

    class Config:
        env_file = ".env"
```

### 5. Database Setup (database.py)

Async SQLAlchemy with connection pooling:

```python
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession

engine = create_async_engine(settings.database_url, pool_size=10, max_overflow=20)
async_session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with async_session() as session:
        yield session
```

### 6. SQLAlchemy Models

Implement these models matching the schema below. Use UUID primary keys, JSONB columns, and proper relationships.

**PostgreSQL Schema (what the Alembic migration should create):**

```sql
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE pipelines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    description TEXT,
    parameters JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE nodes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pipeline_id UUID NOT NULL REFERENCES pipelines(id) ON DELETE CASCADE,
    type TEXT NOT NULL CHECK (type IN ('source_api', 'source_file', 'transform', 'output')),
    name TEXT NOT NULL,
    position_x REAL NOT NULL DEFAULT 0,
    position_y REAL NOT NULL DEFAULT 0,
    config JSONB NOT NULL DEFAULT '{}'::jsonb,
    output_table_name TEXT NOT NULL
);

CREATE INDEX idx_nodes_pipeline ON nodes(pipeline_id);

CREATE TABLE edges (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pipeline_id UUID NOT NULL REFERENCES pipelines(id) ON DELETE CASCADE,
    source_node_id UUID NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
    target_node_id UUID NOT NULL REFERENCES nodes(id) ON DELETE CASCADE
);

CREATE INDEX idx_edges_pipeline ON edges(pipeline_id);

CREATE TABLE uploaded_files (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pipeline_id UUID NOT NULL REFERENCES pipelines(id) ON DELETE CASCADE,
    filename TEXT NOT NULL,
    file_type TEXT NOT NULL,
    storage_path TEXT NOT NULL,
    uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE run_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pipeline_id UUID NOT NULL REFERENCES pipelines(id) ON DELETE CASCADE,
    parameters JSONB NOT NULL DEFAULT '{}'::jsonb,
    status TEXT NOT NULL CHECK (status IN ('running', 'success', 'failed')),
    started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at TIMESTAMPTZ,
    duration_ms INTEGER,
    row_count INTEGER,
    output_preview JSONB,
    error JSONB,
    node_timings JSONB
);

CREATE INDEX idx_run_history_pipeline ON run_history(pipeline_id, started_at DESC);
```

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

Configure Alembic for async SQLAlchemy:
- `alembic.ini` with the database URL sourced from the same settings
- `alembic/env.py` configured to use the async engine and import all models
- An initial migration (`001_initial_schema.py`) that creates all tables

### 10. Tests

**conftest.py:** Set up a test database (or use the same database with a transaction rollback strategy). Create fixtures for the async test client.

**test_health.py:**

```python
async def test_health_endpoint(client):
    response = await client.get("/api/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"
```

## Acceptance Criteria

Before this stage is complete, verify:

- [ ] `docker-compose up --build` starts both postgres and app containers
- [ ] The app container waits for Postgres to be healthy before starting
- [ ] Alembic migration runs successfully and creates all 5 tables
- [ ] `GET http://localhost:8000/api/health` returns `{"status": "ok", "version": "0.1.0"}`
- [ ] `GET http://localhost:8000/docs` shows the FastAPI auto-generated docs
- [ ] `pytest` passes with the health check test
- [ ] You can connect to Postgres and verify tables exist: `docker-compose exec postgres psql -U dataforge -c '\dt'`

## What NOT to Build

- No CRUD API endpoints (Stage 3)
- No execution engine (Stage 2)
- No frontend (Stages 4–5)
- No LLM integration (Stage 6)
- No file upload handling (Stage 3)
