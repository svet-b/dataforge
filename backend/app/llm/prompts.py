from __future__ import annotations

import re

DUCKDB_SQL_SYSTEM_PROMPT = """\
You are a SQL assistant generating DuckDB SQL queries for a data transformation workflow.

## DuckDB-Specific Syntax

DuckDB supports standard SQL. Note these DuckDB-specific features:

- QUALIFY: filter on window function results (e.g., `... QUALIFY ROW_NUMBER() OVER (...) = 1`)
- EXCLUDE/REPLACE: `SELECT * EXCLUDE (col1) FROM t`, `SELECT * REPLACE (expr AS col) FROM t`
- COLUMNS(): pattern-based column selection, e.g. `SELECT COLUMNS('.*_kwh') FROM t`
- FILTER: conditional aggregates, e.g. `COUNT(*) FILTER (WHERE condition)`
- arg_min/arg_max: `arg_min(value, order_col)` returns value at the min of order_col
- PIVOT / UNPIVOT for reshaping data
- Workflow parameters: use `getvariable('param_name')` syntax

## Rules

1. Output ONLY a SELECT statement. It will be wrapped in CREATE TABLE AS (...).
2. No DDL (CREATE, DROP, ALTER), DML (INSERT, UPDATE, DELETE), or COPY statements.
3. Use CTEs for complex multi-step logic. Prefer explicit column names over SELECT *.
4. Write performant queries: filter early, avoid correlated subqueries, \
push predicates into JOINs, use FILTER for conditional aggregates, \
and only ORDER BY in the final SELECT.
5. Add SQL comments for non-obvious logic.

## Output Format

Return your response in this exact format:

```sql
<the SQL query>
```

Explanation: <1-2 sentence explanation of what the query does>

Do not include anything else in your response.

## Available Tables

{schema_description}

## Workflow Parameters

{parameter_description}

## Current Query

{current_query_description}"""


def build_system_prompt(
    tables: list[dict[str, object]],
    parameters: list[dict[str, object]],
    current_query: str | None = None,
) -> str:
    """Build the complete system prompt with schema and parameter context."""
    schema_lines: list[str] = []
    for table in tables:
        columns = table.get("columns", [])
        assert isinstance(columns, list)
        cols = ", ".join(f"{c['name']} ({c['type']})" for c in columns)
        schema_lines.append(f"- {table['name']}: {cols}")
    schema_description = "\n".join(schema_lines) if schema_lines else "No tables available yet."

    param_lines: list[str] = []
    for p in parameters:
        desc = f" \u2014 {p['description']}" if p.get("description") else ""
        param_lines.append(f"- getvariable('{p['name']}') ({p['type']}){desc}")
    parameter_description = "\n".join(param_lines) if param_lines else "No parameters defined."

    if current_query and current_query.strip():
        current_query_description = (
            "The user's current SQL query is shown below. When the user asks to modify "
            'the query (e.g., "add a WHERE clause", "sort by date"), use this as the '
            "starting point and return the FULL modified query.\n\n"
            f"```sql\n{current_query.strip()}\n```"
        )
    else:
        current_query_description = "No query written yet. Generate a new query from scratch."

    return (
        DUCKDB_SQL_SYSTEM_PROMPT.replace("{schema_description}", schema_description)
        .replace("{parameter_description}", parameter_description)
        .replace("{current_query_description}", current_query_description)
    )


def parse_llm_response(response: str) -> tuple[str, str]:
    """Extract SQL and explanation from the LLM response.

    Returns (sql, explanation).
    """
    sql_match = re.search(r"```sql\s*(.*?)\s*```", response, re.DOTALL)
    if sql_match:
        sql = sql_match.group(1).strip()
    else:
        # Fallback: everything before "Explanation:"
        sql = response.strip()

    explanation = ""
    exp_match = re.search(r"Explanation:\s*(.*)", response, re.DOTALL)
    if exp_match:
        explanation = exp_match.group(1).strip()

    return sql, explanation
