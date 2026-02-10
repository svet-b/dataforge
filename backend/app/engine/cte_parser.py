from __future__ import annotations

from dataclasses import dataclass

import sqlglot
from sqlglot import exp


@dataclass
class CTEInfo:
    name: str
    prefix_sql: str
    ordinal: int


def extract_ctes(sql: str) -> list[CTEInfo]:
    """Parse SQL and extract CTE definitions with prefix queries.

    For each CTE, builds a query containing all CTEs up to and including that one,
    followed by SELECT * FROM <cte_name> LIMIT 100.

    Returns empty list for queries without CTEs.
    Raises ValueError on unparseable SQL.
    """
    try:
        parsed = sqlglot.parse_one(sql, dialect="duckdb")
    except sqlglot.errors.ParseError as e:
        raise ValueError(f"Failed to parse SQL: {e}") from e

    cte_nodes = list(parsed.find_all(exp.CTE))
    if not cte_nodes:
        return []

    # Extract CTEs in order from the top-level WITH clause
    with_node = parsed.find(exp.With)
    if with_node is None:
        return []

    cte_nodes = list(with_node.find_all(exp.CTE))
    results: list[CTEInfo] = []

    for i, cte in enumerate(cte_nodes):
        alias = cte.alias
        # Build a WITH clause containing CTEs 0..i, then SELECT * FROM alias
        prefix_ctes = cte_nodes[: i + 1]
        cte_parts = [cte_node.sql(dialect="duckdb") for cte_node in prefix_ctes]
        with_clause = "WITH " + ", ".join(cte_parts)
        prefix_sql = f"{with_clause} SELECT * FROM {alias} LIMIT 100"

        results.append(CTEInfo(name=alias, prefix_sql=prefix_sql, ordinal=i))

    return results
