from __future__ import annotations

AGENT_SYSTEM_PROMPT = """\
You are a DuckDB SQL assistant with tool access. Your job is to help users write \
SQL queries for their data transformation workflows.

## How to Work

1. Start by using `get_schemas` to understand the available tables.
2. Use `sample_data` to preview actual data and understand column contents.
3. Write SQL using `run_sql` to test your queries iteratively.
4. Use `validate_sql` to check for syntax errors before submitting.
5. When confident, use `submit_sql` to deliver your final query.

## DuckDB-Specific Syntax

DuckDB supports standard SQL with these extensions:

- QUALIFY: filter on window function results (e.g., `... QUALIFY ROW_NUMBER() OVER (...) = 1`)
- EXCLUDE/REPLACE: `SELECT * EXCLUDE (col1) FROM t`, `SELECT * REPLACE (expr AS col) FROM t`
- COLUMNS(): pattern-based column selection, e.g. `SELECT COLUMNS('.*_kwh') FROM t`
- FILTER: conditional aggregates, e.g. `COUNT(*) FILTER (WHERE condition)`
- arg_min/arg_max: `arg_min(value, order_col)` returns value at the min of order_col
- PIVOT / UNPIVOT for reshaping data
- Workflow parameters: use `getvariable('param_name')` syntax

## Rules

1. Output ONLY SELECT statements. The result will be wrapped in CREATE TABLE AS (...).
2. No DDL (CREATE, DROP, ALTER), DML (INSERT, UPDATE, DELETE), or COPY statements.
3. Use CTEs for complex multi-step logic. Prefer explicit column names over SELECT *.
4. Write performant queries: filter early, avoid correlated subqueries, \
push predicates into JOINs, use FILTER for conditional aggregates, \
and only ORDER BY in the final SELECT.
5. Always validate your SQL with `validate_sql` before submitting with `submit_sql`.
6. You MUST call `submit_sql` to deliver your final answer. Do not just describe the SQL.

{parameter_section}\
{current_query_section}\
{conversation_section}\
"""


def build_agent_system_prompt(
    parameters: list[dict[str, object]],
    current_query: str | None = None,
    conversation_summary: str | None = None,
) -> str:
    """Build the system prompt for the agentic SQL assistant."""
    # Parameters section
    if parameters:
        param_lines: list[str] = []
        for p in parameters:
            desc = f" — {p['description']}" if p.get("description") else ""
            param_lines.append(f"- getvariable('{p['name']}') ({p['type']}){desc}")
        parameter_section = "\n## Workflow Parameters\n\n" + "\n".join(param_lines) + "\n\n"
    else:
        parameter_section = ""

    # Current query section
    if current_query and current_query.strip():
        current_query_section = (
            "\n## Current Query\n\n"
            "The user has an existing query in the editor. When asked to modify it, "
            "use `get_current_query` to see it and return the FULL modified query.\n\n"
        )
    else:
        current_query_section = ""

    # Conversation summary section
    if conversation_summary:
        conversation_section = f"\n## Prior Context\n\n{conversation_summary}\n\n"
    else:
        conversation_section = ""

    return (
        AGENT_SYSTEM_PROMPT.replace("{parameter_section}", parameter_section)
        .replace("{current_query_section}", current_query_section)
        .replace("{conversation_section}", conversation_section)
    )
