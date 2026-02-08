from __future__ import annotations

import re
from pathlib import Path
from typing import Any

import duckdb

_VALID_TABLE_NAME = re.compile(r"^[a-zA-Z_][a-zA-Z0-9_]*$")


def _validate_table_name(name: str) -> str:
    if not _VALID_TABLE_NAME.match(name):
        raise ValueError(f"Invalid table name: {name!r}")
    return name


class DuckDBSession:
    """Wraps an in-memory DuckDB connection for a single pipeline run.
    Disposed after the run completes."""

    def __init__(self, memory_limit_mb: int = 4096) -> None:
        self.conn = duckdb.connect(":memory:")
        self.conn.execute(f"SET memory_limit = '{memory_limit_mb}MB'")

    def set_variable(self, name: str, value: str, var_type: str = "VARCHAR") -> None:
        """Set a DuckDB session variable for pipeline parameter injection."""
        _validate_table_name(name)  # variable names follow same rules
        self.conn.execute(f"SET VARIABLE {name} = '{value}'")

    def load_json(self, table_name: str, file_path: Path) -> None:
        """Load a JSON/ndjson file into a named table."""
        safe_name = _validate_table_name(table_name)
        self.conn.execute(
            f"CREATE TABLE {safe_name} AS SELECT * FROM read_json_auto('{file_path}')"
        )

    def load_csv(self, table_name: str, file_path: Path, **options: Any) -> None:
        """Load a CSV file into a named table."""
        safe_name = _validate_table_name(table_name)
        opts = ""
        if options:
            opt_parts = [
                f"{k}='{v}'" if isinstance(v, str) else f"{k}={v}" for k, v in options.items()
            ]
            opts = ", " + ", ".join(opt_parts)
        self.conn.execute(
            f"CREATE TABLE {safe_name} AS SELECT * FROM read_csv('{file_path}'{opts})"
        )

    def load_parquet(self, table_name: str, file_path: Path) -> None:
        """Load a Parquet file into a named table."""
        safe_name = _validate_table_name(table_name)
        self.conn.execute(f"CREATE TABLE {safe_name} AS SELECT * FROM read_parquet('{file_path}')")

    def execute_transform(self, table_name: str, sql: str) -> None:
        """Execute a transform SQL and store result as a named table.
        External access is disabled so user SQL cannot access the filesystem."""
        safe_name = _validate_table_name(table_name)
        self.conn.execute(f"CREATE TABLE {safe_name} AS ({sql})")

    def get_table_data(self, table_name: str, limit: int | None = None) -> list[dict[str, Any]]:
        """Fetch table contents as a list of dicts."""
        safe_name = _validate_table_name(table_name)
        query = f"SELECT * FROM {safe_name}"
        if limit:
            query += f" LIMIT {limit}"
        result = self.conn.execute(query)
        columns = [desc[0] for desc in result.description]
        return [dict(zip(columns, row)) for row in result.fetchall()]

    def get_table_schema(self, table_name: str) -> list[dict[str, str]]:
        """Return column names and types for a table."""
        safe_name = _validate_table_name(table_name)
        result = self.conn.execute(f"DESCRIBE {safe_name}")
        return [{"name": row[0], "type": row[1]} for row in result.fetchall()]

    def get_row_count(self, table_name: str) -> int:
        safe_name = _validate_table_name(table_name)
        result = self.conn.execute(f"SELECT COUNT(*) FROM {safe_name}")
        row = result.fetchone()
        assert row is not None
        return row[0]  # type: ignore[no-any-return]

    def close(self) -> None:
        self.conn.close()
