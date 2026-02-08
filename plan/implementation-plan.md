# DataForge — Claude Code Implementation Plan

## Overview

This document describes how to implement the DataForge platform using Claude Code agents. The implementation is split into **6 sequential stages**, each designed to be executed as an independent Claude Code session. Each stage has its own detailed spec file and a suggested prompt.

The key principles behind this decomposition:

1. **Each stage produces a working, testable artifact.** No stage ends with code that can't be verified.
2. **Each stage builds on the previous one.** The agent is given the previous stage's output as working context.
3. **Stages are small enough for a single Claude Code session** (roughly 1–3 hours of agent work each).
4. **Validation is built in.** Each stage includes concrete acceptance tests the agent must pass before the stage is considered done.

## Repository Structure (Target)

```
dataforge/
├── docker-compose.yml            # Dev environment
├── Dockerfile                    # Backend dev container
├── .env.example
├── README.md
├── backend/
│   ├── pyproject.toml
│   ├── uv.lock                   # Managed by uv
│   ├── alembic.ini
│   ├── alembic/
│   │   └── versions/
│   ├── app/
│   │   ├── main.py
│   │   ├── config.py
│   │   ├── database.py           # Sync SQLAlchemy + SQLite
│   │   ├── models/
│   │   │   ├── pipeline.py
│   │   │   ├── node.py
│   │   │   ├── edge.py
│   │   │   └── run.py
│   │   ├── schemas/              # Pydantic request/response models
│   │   ├── routers/
│   │   │   ├── pipelines.py
│   │   │   ├── execution.py
│   │   │   └── llm.py
│   │   ├── engine/
│   │   │   ├── executor.py       # Pipeline execution engine
│   │   │   ├── dag.py            # DAG resolution / topological sort
│   │   │   └── duckdb_manager.py # DuckDB session management
│   │   ├── connectors/
│   │   │   ├── base.py
│   │   │   ├── api_connector.py
│   │   │   └── file_connector.py
│   │   └── llm/
│   │       ├── claude_provider.py
│   │       └── prompts.py
│   └── tests/
│       ├── test_dag.py
│       ├── test_executor.py
│       ├── test_connectors.py
│       ├── test_api.py
│       └── fixtures/
│           └── sample_data.csv
└── frontend/
    ├── package.json
    ├── svelte.config.js
    ├── tailwind.config.js
    ├── src/
    │   ├── routes/
    │   │   ├── +layout.svelte
    │   │   ├── +page.svelte          # Pipeline list
    │   │   └── pipelines/
    │   │       └── [id]/
    │   │           └── +page.svelte   # Pipeline editor
    │   ├── lib/
    │   │   ├── components/
    │   │   │   ├── dag/               # DAG canvas components
    │   │   │   ├── nodes/             # Node type config panels
    │   │   │   ├── preview/           # Data preview table
    │   │   │   ├── sql-editor/        # CodeMirror wrapper
    │   │   │   └── llm-chat/          # LLM chat panel
    │   │   ├── stores/                # Svelte stores for state
    │   │   └── api/                   # Backend API client
    │   └── app.css
    └── static/
```

## Stage Sequence

| Stage | Name | Depends On | Focus | Estimated Effort |
|-------|------|------------|-------|-----------------|
| 1 | Project Scaffold & Database | — | Docker, SQLite, FastAPI, Alembic, basic models | 1–2 hours |
| 2 | Pipeline Execution Engine | Stage 1 | DuckDB engine, DAG resolution, connectors, execution API | 2–3 hours |
| 3 | Pipeline Management API | Stages 1–2 | Full CRUD endpoints, file upload, validation | 1–2 hours |
| 4 | Frontend Foundation | Stages 1–3 | SvelteKit scaffold, DAG editor, node config panels | 2–3 hours |
| 5 | Frontend Interactive Features | Stages 1–4 | Data preview, SQL editor, parameter management, run history | 2–3 hours |
| 6 | LLM Integration | Stages 1–5 | Claude LLM service, SQL generation, chat UI panel | 1–2 hours |

## How to Use This Plan

### Prerequisites

Before starting, ensure you have:
- A working directory for the project (e.g., `~/projects/dataforge`)
- Docker (with Compose) installed
- The design document (`DataForge-Design-Document.md`) available for reference
- The stage-specific spec files (provided alongside this document)

### For Each Stage

1. **Start a new Claude Code session.**
2. **Provide the stage spec file** as context (copy-paste or use `@file` reference).
3. **Use the suggested prompt** (provided below and in each spec file).
4. **Let the agent work.** It will create files, run tests, and iterate.
5. **Verify the acceptance criteria** listed in the spec before moving to the next stage.
6. **Commit the result** to version control before starting the next stage.

### Important: Context Management

Each Claude Code session has limited context. To keep agents focused:
- Only provide the relevant stage spec, NOT the full design document.
- Each spec file is self-contained — it includes all information the agent needs from the design doc.
- If an agent needs to understand a previous stage's code, it can read the files in the repo.

---

## Stage 1: Project Scaffold & Database

**Spec file:** `stage-1-scaffold.md`

**What it does:** Sets up the project skeleton — Docker dev environment, SQLite, FastAPI with sync SQLAlchemy, Alembic migrations, and basic Pydantic models. The backend uses Python 3.13 with uv for dependency management, ruff for formatting, and ty for type-checking. At the end of this stage, you can `docker compose up` and have a running FastAPI server connected to SQLite.

**Prompt for Claude Code:**

```
Read the spec file @plan/stage-1-scaffold.md and implement it fully. 

You are building the foundation for a data pipeline platform called DataForge. This stage sets up the project structure, Docker environment, database, and basic FastAPI application.

Work in the current directory. Create all files, ensure docker compose up works, and verify the acceptance criteria listed in the spec. Run the tests you write to make sure everything passes.

Do NOT implement the pipeline execution engine, frontend, or LLM integration — those come in later stages. Focus only on what's specified in the spec.
```

---

## Stage 2: Pipeline Execution Engine

**Spec file:** `stage-2-execution-engine.md`

**What it does:** Implements the core DuckDB-based execution engine — DAG resolution, node execution in topological order, parameter injection, source connectors (file + API), and the `/run` and `/preview` API endpoints. This is the most complex backend stage. Database access uses sync SQLAlchemy (SQLite), while connectors use async httpx for HTTP calls.

**Prompt for Claude Code:**

```
Read the spec file @plan/stage-2-execution-engine.md and implement it fully.

You are adding the pipeline execution engine to an existing DataForge project. The project scaffold (FastAPI, SQLite, Alembic, models) already exists from a previous stage — read the existing code first to understand the patterns and conventions before adding new code.

Implement the DuckDB execution engine, DAG resolver, source connectors, and execution API endpoints. Write tests for the DAG resolver and executor using the sample data fixtures described in the spec.

Run all tests (both existing and new) to ensure nothing is broken.
```

---

## Stage 3: Pipeline Management API

**Spec file:** `stage-3-management-api.md`

**What it does:** Implements the full CRUD API for pipelines, nodes, edges, and uploaded files. Includes validation (cycle detection on edge creation, unique output table names, exactly one output node enforcement).

**Prompt for Claude Code:**

```
Read the spec file @plan/stage-3-management-api.md and implement it fully.

You are adding the pipeline management CRUD API to an existing DataForge project. The project scaffold and execution engine already exist — read the existing code to understand patterns before adding new code.

Implement all CRUD endpoints, file upload handling, and validation logic. Write API tests using httpx/pytest that verify all endpoints and edge cases listed in the spec.

Run all tests to make sure everything passes.
```

---

## Stage 4: Frontend Foundation

**Spec file:** `stage-4-frontend-foundation.md`

**What it does:** Sets up the SvelteKit project with Svelvet DAG editor, Tailwind, and basic pages — pipeline list and pipeline editor with a working node graph. Connects to the backend API. At the end, you can create a pipeline, add/remove nodes, connect them, and save.

**Prompt for Claude Code:**

```
Read the spec file @plan/stage-4-frontend-foundation.md and implement it fully.

You are building the frontend for DataForge, connecting to an existing FastAPI backend. The backend is already running — you can test against it.

Create the SvelteKit project in the frontend/ directory. Set up Svelvet for the DAG editor, Tailwind for styling, and implement the pipeline list page and pipeline editor page with a working node graph.

Focus on the DAG canvas and basic node CRUD. Do NOT implement data preview, SQL editor, or LLM chat — those come in later stages.

Test by starting the dev server and verifying you can create pipelines, add nodes, and connect them visually.
```

---

## Stage 5: Frontend Interactive Features

**Spec file:** `stage-5-frontend-interactive.md`

**What it does:** Adds the node configuration panels (API source form, file upload, transform SQL editor), data preview table, parameter management, and run history display. This is where the design-time experience comes together.

**Prompt for Claude Code:**

```
Read the spec file @plan/stage-5-frontend-interactive.md and implement it fully.

You are adding interactive features to the existing DataForge frontend. The SvelteKit app with DAG editor already exists — read the existing code to understand component patterns before adding new features.

Implement node configuration panels for each node type, the CodeMirror SQL editor, data preview table, parameter management UI, and run history panel.

Test each feature against the running backend. Verify you can configure nodes, write SQL, preview data, and see run results.
```

---

## Stage 6: LLM Integration

**Spec file:** `stage-6-llm-integration.md`

**What it does:** Adds the Claude (Anthropic) LLM provider, the `/api/llm/generate-sql` endpoint, and the LLM chat panel in the frontend. This is the final layer.

**Prompt for Claude Code:**

```
Read the spec file @plan/stage-6-llm-integration.md and implement it fully.

You are adding LLM-assisted SQL generation to the existing DataForge platform. Both the backend and frontend already exist — read the existing code to understand patterns.

Implement the Claude LLM provider, the SQL generation endpoint, and the chat panel in the frontend. The system prompt for SQL generation is critical — pay close attention to the DuckDB dialect specifics in the spec.

Test with a real API key if available, or mock the LLM responses for automated tests.
```

---

## Post-Implementation Checklist

After all 6 stages are complete, do a final review pass:

- [ ] `docker compose up` starts the backend and frontend dev servers cleanly
- [ ] Frontend loads at `http://localhost:5173` (dev) or `http://localhost:8000` (prod build)
- [ ] Can create a pipeline, add source + transform + output nodes, connect them
- [ ] Can upload a CSV file as a source
- [ ] Can write SQL in a transform node and preview results
- [ ] Can use the LLM to generate SQL from a natural language description
- [ ] Can run a pipeline via the API: `curl -X POST http://localhost:8000/api/pipelines/{id}/run`
- [ ] Run history shows in the UI
- [ ] Error messages display correctly when SQL is invalid
- [ ] Parameters are properly injected into DuckDB and API source URLs

## Tips for Working with Claude Code

1. **Let the agent read existing code first.** Always tell it to explore the repo before writing. This prevents it from duplicating or conflicting with existing patterns.

2. **Commit between stages.** This gives each agent a clean starting point and lets you roll back if a stage goes sideways.

3. **If a stage fails, re-run it** rather than trying to fix issues in the next stage. Each stage should leave the codebase in a clean, working state.

4. **Provide the .env file** with `ANTHROPIC_API_KEY` so the agent can test LLM integration.

5. **For Stage 4+, have the backend running** (`docker compose up backend`) so the frontend agent can test API integration live.
