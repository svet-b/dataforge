from __future__ import annotations

AGENT_SYSTEM_PROMPT = """\
You are a DuckDB SQL assistant with tool access. Your job is to help users write \
SQL queries for their data transformation workflows.

## How to Work

The available tables and their schemas are listed below — you do not need to \
call any tool to discover them.

1. Use `sample_data` on 1-2 key tables to understand data shape and representative values.
2. Write and test SQL with `run_sql`, **always using a small date/row filter** (e.g. \
`WHERE timestamp < '<start> + 2 days'`) when working with large tables. \
This keeps test queries fast and avoids timeouts.
3. Once your approach is validated on the sample, use `validate_sql` to confirm \
the full (unfiltered) query is syntactically correct.
4. Call `submit_sql` with the full, unfiltered query. Do **not** run the full \
query through `run_sql` before submitting — `validate_sql` is sufficient.

**Be decisive**: 1-2 exploration steps are enough. Sample, build, test on a small \
sample, validate syntax, then submit. Avoid running the same query multiple times.

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
5. When testing with `run_sql`, always add a restrictive filter (e.g. date range, \
`LIMIT` on a CTE) so the query returns quickly. Remove the filter only in the \
final `submit_sql` query.
6. Use `validate_sql` to check the final unfiltered query for syntax errors, \
then immediately call `submit_sql`. Do not run the full query through `run_sql`.
7. You MUST call `submit_sql` to deliver your final answer. Do not just describe the SQL.

{schema_section}\
{parameter_section}\
{current_query_section}\
{conversation_section}\
"""


def build_agent_system_prompt(
    tables: list[dict[str, object]],
    parameters: list[dict[str, object]],
    current_query: str | None = None,
    conversation_summary: str | None = None,
) -> str:
    """Build the system prompt for the agentic SQL assistant."""
    # Schema section — pre-populated so the agent doesn't need to call get_schemas
    if tables:
        schema_lines: list[str] = []
        for t in tables:
            name = t["name"]
            cols = t.get("columns", [])
            assert isinstance(cols, list)
            row_count = t.get("row_count")
            col_str = ", ".join(f"{c['name']} ({c['type']})" for c in cols)
            count_str = f" — {row_count:,} rows" if isinstance(row_count, int) else ""
            schema_lines.append(f"### {name}{count_str}\n{col_str}")
        schema_section = "\n## Available Tables\n\n" + "\n\n".join(schema_lines) + "\n\n"
    else:
        schema_section = "\n## Available Tables\n\nNo source tables loaded yet.\n\n"

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
        AGENT_SYSTEM_PROMPT.replace("{schema_section}", schema_section)
        .replace("{parameter_section}", parameter_section)
        .replace("{current_query_section}", current_query_section)
        .replace("{conversation_section}", conversation_section)
    )
