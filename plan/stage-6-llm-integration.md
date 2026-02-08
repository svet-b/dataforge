# Stage 6: LLM Integration

## Objective

Add LLM-assisted SQL generation to DataForge. Users can describe a transformation in natural language, and the system generates DuckDB SQL via an LLM (defaulting to Claude). The backend exposes a pluggable LLM provider system, and the frontend adds a chat panel to the transform node configuration.

## Prerequisites

Stages 1–5 are complete. The full backend and frontend work end-to-end.

**Read the existing code** — especially the transform node config component, the API client, and the backend router patterns.

## Deliverables

### 1. LLM Provider System (Backend)

#### Base Protocol (`app/llm/base.py`)

```python
from typing import Protocol

class LLMProvider(Protocol):
    async def generate(self, system_prompt: str, user_prompt: str) -> str:
        """Send a prompt to the LLM and return the text response."""
        ...

    async def generate_with_history(
        self,
        system_prompt: str,
        messages: list[dict[str, str]]
    ) -> str:
        """Send a multi-turn conversation to the LLM and return the latest response."""
        ...
```

#### Claude Provider (`app/llm/claude_provider.py`)

```python
import anthropic

class ClaudeProvider:
    def __init__(self, api_key: str, model: str = "claude-sonnet-4-5-20250929"):
        self.client = anthropic.AsyncAnthropic(api_key=api_key)
        self.model = model

    async def generate(self, system_prompt: str, user_prompt: str) -> str:
        response = await self.client.messages.create(
            model=self.model,
            max_tokens=4096,
            system=system_prompt,
            messages=[{"role": "user", "content": user_prompt}]
        )
        return response.content[0].text

    async def generate_with_history(self, system_prompt: str, messages: list[dict]) -> str:
        response = await self.client.messages.create(
            model=self.model,
            max_tokens=4096,
            system=system_prompt,
            messages=messages
        )
        return response.content[0].text
```

#### OpenAI Provider (`app/llm/openai_provider.py`)

For OpenAI-compatible APIs (including Azure OpenAI, local vLLM, etc.):

```python
from openai import AsyncOpenAI

class OpenAIProvider:
    def __init__(self, api_key: str, model: str = "gpt-4o", base_url: str | None = None):
        self.client = AsyncOpenAI(api_key=api_key, base_url=base_url)
        self.model = model

    async def generate(self, system_prompt: str, user_prompt: str) -> str:
        response = await self.client.chat.completions.create(
            model=self.model,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt}
            ]
        )
        return response.choices[0].message.content
    ...
```

#### Ollama Provider (`app/llm/ollama_provider.py`)

For local models via Ollama:

```python
import httpx

class OllamaProvider:
    def __init__(self, base_url: str = "http://localhost:11434", model: str = "llama3"):
        self.base_url = base_url
        self.model = model

    async def generate(self, system_prompt: str, user_prompt: str) -> str:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{self.base_url}/api/chat",
                json={
                    "model": self.model,
                    "messages": [
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": user_prompt}
                    ],
                    "stream": False
                },
                timeout=120.0
            )
            return response.json()["message"]["content"]
    ...
```

#### Provider Factory (`app/llm/__init__.py`)

```python
def create_llm_provider(settings) -> LLMProvider:
    match settings.llm_provider:
        case "claude":
            return ClaudeProvider(api_key=settings.anthropic_api_key, model=settings.llm_model)
        case "openai":
            return OpenAIProvider(api_key=settings.openai_api_key, model=settings.llm_model)
        case "ollama":
            return OllamaProvider(base_url=settings.ollama_base_url, model=settings.llm_model)
        case _:
            raise ValueError(f"Unknown LLM provider: {settings.llm_provider}")
```

Add any needed settings fields to config.py: `openai_api_key`, `ollama_base_url`.

### 2. SQL Generation System Prompt (`app/llm/prompts.py`)

This is the most important piece of the LLM integration. The system prompt must be carefully crafted for DuckDB SQL quality.

```python
DUCKDB_SQL_SYSTEM_PROMPT = """You are a SQL assistant generating DuckDB SQL queries for a data transformation pipeline.

## DuckDB SQL Dialect

DuckDB is a modern analytical SQL engine. You should leverage its features:

### Core SQL
- Standard SQL with CTEs (WITH clauses), window functions, subqueries
- QUALIFY clause: filter window function results directly
  SELECT *, ROW_NUMBER() OVER (PARTITION BY id ORDER BY ts DESC) AS rn
  FROM readings QUALIFY rn = 1
- EXCLUDE/REPLACE in SELECT:
  SELECT * EXCLUDE (internal_id, debug_flag) FROM readings
  SELECT * REPLACE (voltage * 1.02 AS voltage) FROM readings
- COLUMNS() for pattern-based column selection:
  SELECT COLUMNS('.*_kwh') FROM readings

### Date/Time Functions
- date_trunc('hour', ts), date_trunc('month', ts), etc.
- date_part('hour', ts), date_part('dow', ts)
- date_diff('day', start_date, end_date)
- strftime(ts, '%Y-%m-%d')
- current_date, current_timestamp
- Interval arithmetic: ts + INTERVAL '1 hour'

### Aggregations
- Standard: SUM, AVG, MIN, MAX, COUNT, COUNT(DISTINCT ...)
- Statistical: STDDEV, VARIANCE, quantile_cont(0.95)
- List: list(col), list_distinct(col)
- Conditional: COUNT(*) FILTER (WHERE condition)
- First/last by ordering: arg_min(value, order_col), arg_max(value, order_col)

### JSON Functions
- json_extract(col, '$.field') or col->'field'
- json_extract_string(col, '$.field') or col->>'field'
- Nested: col->'level1'->'level2'->>'leaf'

### String Functions
- concat, string_split, regexp_extract, regexp_replace
- trim, lower, upper, length, substring

### Window Functions
- ROW_NUMBER(), RANK(), DENSE_RANK()
- LAG(col, n), LEAD(col, n)
- SUM(col) OVER (PARTITION BY ... ORDER BY ... ROWS BETWEEN ...)
- Use QUALIFY to filter directly on window results

### Other Useful Features
- PIVOT / UNPIVOT for reshaping data
- CASE WHEN for conditional logic
- COALESCE, NULLIF, IFNULL
- CAST(col AS TYPE) or col::TYPE
- generate_series() for generating sequences
- unnest() for expanding arrays

## Rules

1. Output ONLY a SELECT statement. It will be wrapped in CREATE TABLE AS (...).
2. Do NOT output any DDL (CREATE, DROP, ALTER), DML (INSERT, UPDATE, DELETE), or COPY statements.
3. Reference pipeline parameters using $param_name syntax (e.g., $start_date, $customer_id).
4. Use CTEs (WITH clauses) for complex multi-step logic — each CTE should have a clear, descriptive name.
5. Use meaningful column aliases that describe the data.
6. Add SQL comments for non-obvious logic.
7. Prefer explicit column names over SELECT * in transforms.
8. Handle potential NULL values appropriately with COALESCE or NULLIF where relevant.
9. When aggregating, always include all non-aggregated columns in GROUP BY.

## Output Format

Return your response in this exact format:

```sql
<the SQL query>
```

Explanation: <1-2 sentence explanation of what the query does>

Do not include anything else in your response.

## Available Tables

{schema_description}

## Pipeline Parameters

{parameter_description}
"""


def build_system_prompt(tables: list[dict], parameters: list[dict]) -> str:
    """Build the complete system prompt with schema and parameter context."""
    schema_lines = []
    for table in tables:
        cols = ", ".join(f"{c['name']} ({c['type']})" for c in table["columns"])
        schema_lines.append(f"- {table['name']}: {cols}")
    schema_description = "\n".join(schema_lines) if schema_lines else "No tables available yet."

    param_lines = []
    for p in parameters:
        desc = f" — {p['description']}" if p.get("description") else ""
        param_lines.append(f"- ${p['name']} ({p['type']}){desc}")
    parameter_description = "\n".join(param_lines) if param_lines else "No parameters defined."

    return DUCKDB_SQL_SYSTEM_PROMPT.replace(
        "{schema_description}", schema_description
    ).replace(
        "{parameter_description}", parameter_description
    )


def parse_llm_response(response: str) -> tuple[str, str]:
    """
    Extract SQL and explanation from the LLM response.
    Returns (sql, explanation).
    """
    # Try to extract SQL from code block
    import re
    sql_match = re.search(r'```sql\s*(.*?)\s*```', response, re.DOTALL)
    if sql_match:
        sql = sql_match.group(1).strip()
    else:
        # Fallback: try to extract just the SQL (everything before "Explanation:")
        sql = response.strip()

    # Extract explanation
    explanation = ""
    exp_match = re.search(r'Explanation:\s*(.*)', response, re.DOTALL)
    if exp_match:
        explanation = exp_match.group(1).strip()

    return sql, explanation
```

### 3. LLM API Endpoint (`app/routers/llm.py`)

```python
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

router = APIRouter(prefix="/api/llm", tags=["llm"])

class GenerateSQLRequest(BaseModel):
    prompt: str
    available_tables: list[dict]  # [{"name": str, "columns": [{"name": str, "type": str}]}]
    pipeline_parameters: list[dict]  # [{"name": str, "type": str, "description": str}]
    conversation_history: list[dict] = []  # [{"role": "user"|"assistant", "content": str}]

class GenerateSQLResponse(BaseModel):
    sql: str
    explanation: str

@router.post("/generate-sql", response_model=GenerateSQLResponse)
async def generate_sql(body: GenerateSQLRequest):
    """
    Generate DuckDB SQL from a natural language description.

    If conversation_history is provided, use it for iterative refinement
    (e.g., "now also filter for active meters").
    """
    system_prompt = build_system_prompt(body.available_tables, body.pipeline_parameters)

    if body.conversation_history:
        # Multi-turn: append the new prompt to the conversation
        messages = body.conversation_history + [{"role": "user", "content": body.prompt}]
        response = await llm_provider.generate_with_history(system_prompt, messages)
    else:
        response = await llm_provider.generate(system_prompt, body.prompt)

    sql, explanation = parse_llm_response(response)

    if not sql:
        raise HTTPException(status_code=422, detail="Could not extract SQL from LLM response")

    return GenerateSQLResponse(sql=sql, explanation=explanation)


@router.get("/status")
async def llm_status():
    """Check if the LLM provider is configured and reachable."""
    try:
        # Simple test call
        response = await llm_provider.generate(
            "You are a test assistant.", "Reply with just 'ok'."
        )
        return {"status": "ok", "provider": settings.llm_provider, "model": settings.llm_model}
    except Exception as e:
        return {"status": "error", "provider": settings.llm_provider, "error": str(e)}
```

Register the router in `main.py`:

```python
from app.routers import llm
app.include_router(llm.router)
```

### 4. Schema Inference for LLM Context

When the user wants to generate SQL for a transform node, the frontend needs to send the upstream tables' schemas. There are two approaches:

**Approach A (preferred): Use DuckDB DESCRIBE after a preview run.**
If a node has been previewed, we know its output schema. Store schema info in the pipeline store after each preview. The frontend sends this cached schema to the LLM endpoint.

**Approach B (fallback): Add a backend endpoint that infers schema.**

```python
@router.post("/{pipeline_id}/schema/{node_id}")
async def get_node_schema(pipeline_id: UUID, node_id: UUID, ...):
    """Execute the subgraph up to the given node and return DESCRIBE output."""
    ...
```

Implement Approach A in the frontend (cache schema after preview), with Approach B as fallback for nodes that haven't been previewed yet.

### 5. Frontend: LLM Chat Panel (`components/llm-chat/LlmChat.svelte`)

Add an "AI Assistant" section to the Transform Config panel. Position it in the left column, above or alongside the Schema Reference:

```
┌─────────────────────────────┬────────────────────────────────────┐
│  AI Assistant                │  SQL Editor (CodeMirror):          │
│  ┌──────────────────────┐   │  ┌──────────────────────────────┐  │
│  │ Chat history:         │   │  │ SELECT                       │  │
│  │                       │   │  │   meter_id,                  │  │
│  │ You: Aggregate meter  │   │  │   SUM(energy_kwh)            │  │
│  │ readings to hourly    │   │  │ FROM meter_readings          │  │
│  │ intervals             │   │  │ GROUP BY meter_id            │  │
│  │                       │   │  │                              │  │
│  │ AI: ✓ Generated SQL   │   │  └──────────────────────────────┘  │
│  │ (groups by meter and  │   │                                    │
│  │ hour, sums energy)    │   │  [Apply] [Preview]                 │
│  │                       │   │                                    │
│  │ You: Also add a       │   │                                    │
│  │ filter for voltage    │   │                                    │
│  │ above 200V            │   │                                    │
│  │                       │   │                                    │
│  │ AI: ✓ Updated SQL     │   │                                    │
│  │ (added WHERE clause)  │   │                                    │
│  └──────────────────────┘   │                                    │
│                             │                                    │
│  ┌──────────────────────┐   │                                    │
│  │ Describe your query...│   │                                    │
│  │                  [⏎] │   │                                    │
│  └──────────────────────┘   │                                    │
│                             │                                    │
│  Schema Reference:          │                                    │
│  (collapsible)              │                                    │
└─────────────────────────────┴────────────────────────────────────┘
```

**Chat interaction flow:**

1. User types a natural language description in the input box.
2. User presses Enter or clicks the send button.
3. The component:
   a. Collects upstream table schemas (from cached preview data or via API)
   b. Collects pipeline parameters
   c. Sends request to `POST /api/llm/generate-sql` with prompt, schemas, parameters, and conversation history
4. While waiting, show a loading indicator in the chat.
5. On response:
   a. Display the explanation in the chat history
   b. **Automatically populate the SQL editor** with the generated SQL
   c. Add a subtle highlight/badge on the SQL editor indicating "AI-generated"
   d. Store the conversation turn in component state for iterative refinement
6. User can then:
   - Click "Preview" to test the generated SQL
   - Edit the SQL manually in the CodeMirror editor
   - Type another message to refine (e.g., "also add a HAVING clause for groups with > 100 readings")

**Chat state management:**

Store per-node conversation history in the pipeline store:

```typescript
interface TransformNodeChat {
  nodeId: string;
  messages: Array<{
    role: 'user' | 'assistant';
    content: string;
    sql?: string;  // The SQL that was generated for this turn
  }>;
}
```

This history is maintained only in the client — it's not persisted to the backend (keeping it simple for v1). If the user refreshes, the chat history is lost but the SQL they applied is saved in the node config.

**Error handling:**

- If the LLM endpoint returns an error (e.g., no API key configured), show a clear message: "AI assistant unavailable. Please configure an API key in settings. You can still write SQL manually."
- If the generated SQL fails to preview, show the error and suggest the user try refining their description.

### 6. LLM Status Indicator

Add a small indicator in the toolbar or settings area showing LLM status:
- Green dot + "AI ready" if `/api/llm/status` returns ok
- Gray dot + "AI unavailable" if not configured
- Clicking it could open a settings panel for configuring the LLM provider (stretch goal for v1 — could just link to documentation about environment variables)

### 7. Configuration Updates

Add to `config.py`:

```python
# LLM settings
llm_provider: str = "claude"
llm_model: str = "claude-sonnet-4-5-20250929"
anthropic_api_key: str = ""
openai_api_key: str = ""
ollama_base_url: str = "http://localhost:11434"
```

Add to `docker-compose.yml` app environment:

```yaml
ANTHROPIC_API_KEY: "${ANTHROPIC_API_KEY:-}"
LLM_PROVIDER: "${LLM_PROVIDER:-claude}"
LLM_MODEL: "${LLM_MODEL:-claude-sonnet-4-5-20250929}"
```

Update `.env.example`:

```
ANTHROPIC_API_KEY=sk-ant-...
# Or for OpenAI:
# LLM_PROVIDER=openai
# OPENAI_API_KEY=sk-...
# Or for Ollama:
# LLM_PROVIDER=ollama
# OLLAMA_BASE_URL=http://localhost:11434
# LLM_MODEL=llama3
```

### 8. Backend Dependencies

Add to `pyproject.toml`:

```toml
"anthropic>=0.40",
"openai>=1.50",
```

Ollama uses `httpx` which is already a dependency.

### 9. Tests

#### `tests/test_llm.py`

```python
def test_build_system_prompt():
    """Verify system prompt includes table schemas and parameters."""
    tables = [{"name": "readings", "columns": [{"name": "meter_id", "type": "VARCHAR"}]}]
    params = [{"name": "start_date", "type": "date", "description": "Start of period"}]
    prompt = build_system_prompt(tables, params)
    assert "readings" in prompt
    assert "$start_date" in prompt
    assert "Start of period" in prompt

def test_parse_llm_response_with_code_block():
    """Parse SQL from a response with ```sql code block."""
    response = "```sql\nSELECT * FROM readings\n```\n\nExplanation: Gets all readings."
    sql, explanation = parse_llm_response(response)
    assert sql == "SELECT * FROM readings"
    assert "all readings" in explanation

def test_parse_llm_response_without_code_block():
    """Parse SQL when LLM doesn't use code blocks."""
    response = "SELECT * FROM readings\n\nExplanation: Gets everything."
    sql, explanation = parse_llm_response(response)
    assert "SELECT" in sql

async def test_generate_sql_endpoint_mocked():
    """
    Mock the LLM provider and verify the endpoint:
    - Builds correct system prompt from schema
    - Returns SQL and explanation
    - Handles conversation history
    """
    ...

async def test_llm_status_endpoint():
    """Verify /api/llm/status returns provider info."""
    ...
```

Use dependency injection or monkeypatching to mock the LLM provider in tests, so tests don't require a real API key.

## Acceptance Criteria

- [ ] `POST /api/llm/generate-sql` returns valid DuckDB SQL from a natural language prompt
- [ ] The system prompt includes upstream table schemas and pipeline parameters
- [ ] Conversation history is supported for iterative refinement
- [ ] LLM response is parsed correctly (SQL extracted from code blocks)
- [ ] Frontend: LLM chat panel is visible in the Transform Config panel
- [ ] Frontend: typing a description and pressing Enter generates SQL
- [ ] Frontend: generated SQL automatically appears in the CodeMirror editor
- [ ] Frontend: conversation history allows refinement ("also add a filter for...")
- [ ] Frontend: LLM unavailability shows a clear message (not a crash)
- [ ] `GET /api/llm/status` reports the configured provider and reachability
- [ ] The provider is pluggable — changing `LLM_PROVIDER` env var switches between Claude/OpenAI/Ollama
- [ ] All existing tests still pass
- [ ] Backend tests for prompt building and response parsing pass (mocked, no real API key needed)

## What This Completes

With Stage 6 done, DataForge is feature-complete for v1:
- Visual pipeline designer with DAG editor
- Four node types: API source, file source, SQL transform, output
- DuckDB-based execution engine with parameter injection
- LLM-assisted SQL authoring with iterative refinement
- Data preview at each pipeline step
- Pipeline execution via API
- Run history with error diagnostics
- Docker deployment with Postgres

The platform is ready for end-to-end testing and initial use.
