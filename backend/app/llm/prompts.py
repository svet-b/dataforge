from __future__ import annotations

import re

DUCKDB_SQL_SYSTEM_PROMPT = """\
You are a SQL assistant generating DuckDB SQL queries for a data transformation pipeline.

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
3. Reference pipeline parameters using getvariable('param_name') syntax \
(e.g., getvariable('start_date'), getvariable('customer_id')).
4. Use CTEs (WITH clauses) for complex multi-step logic \
\u2014 each CTE should have a clear, descriptive name.
5. Use meaningful column aliases that describe the data.
6. Add SQL comments for non-obvious logic.
7. Prefer explicit column names over SELECT * in your queries.
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

{parameter_description}"""


def build_system_prompt(
    tables: list[dict[str, object]], parameters: list[dict[str, object]]
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

    return DUCKDB_SQL_SYSTEM_PROMPT.replace("{schema_description}", schema_description).replace(
        "{parameter_description}", parameter_description
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
