from __future__ import annotations

import json
import re
import tempfile
from pathlib import Path
from typing import Any

import duckdb

_VALID_TABLE_NAME = re.compile(r"^[a-zA-Z_][a-zA-Z0-9_]*$")


def _validate_table_name(name: str) -> str:
    if not _VALID_TABLE_NAME.match(name):
        raise ValueError(f"Invalid table name: {name!r}")
    return name


class DuckDBSession:
    """Wraps an in-memory DuckDB connection for a single workflow run.
    Disposed after the run completes."""

    def __init__(self, memory_limit_mb: int = 4096) -> None:
        self.conn = duckdb.connect(":memory:")
        self.conn.execute(f"SET memory_limit = '{memory_limit_mb}MB'")

    def set_variable(self, name: str, value: str) -> None:
        """Set a DuckDB session variable for workflow parameter injection."""
        _validate_table_name(name)  # variable names follow same rules
        escaped_value = value.replace("'", "''")
        self.conn.execute(f"SET VARIABLE {name} = '{escaped_value}'")

    def load_json(self, table_name: str, file_path: Path) -> None:
        """Load a JSON/ndjson file into a named table."""
        safe_name = _validate_table_name(table_name)
        self.conn.execute(
            f"CREATE TABLE {safe_name} AS SELECT * FROM read_json_auto('{file_path}')"
        )

    def cast_column(self, table_name: str, column_name: str, target_type: str) -> None:
        """ALTER a column's type in-place (e.g. VARCHAR → TIMESTAMPTZ)."""
        safe_table = _validate_table_name(table_name)
        safe_col = _validate_table_name(column_name)
        self.conn.execute(f"ALTER TABLE {safe_table} ALTER COLUMN {safe_col} TYPE {target_type}")

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
        """Execute a transform SQL and store result as a named table."""
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
        if row is None:
            return 0
        return row[0]  # type: ignore[no-any-return]

    def export_ndjson_sorted(self, table_name: str) -> bytes:
        """Export table as deterministically sorted NDJSON (ORDER BY all columns)."""
        with tempfile.NamedTemporaryFile(mode="w+b", suffix=".ndjson", delete=False) as tmp:
            tmp_path = Path(tmp.name)
        self.export_ndjson_sorted_to_file(table_name, tmp_path)
        try:
            return tmp_path.read_bytes()
        finally:
            tmp_path.unlink(missing_ok=True)

    def export_ndjson_sorted_to_file(self, table_name: str, output_path: Path) -> None:
        """Export table as deterministically sorted NDJSON directly to disk."""
        safe_name = _validate_table_name(table_name)
        # Get column names for ORDER BY
        schema = self.get_table_schema(safe_name)
        order_cols = ", ".join(f'"{col["name"]}"' for col in schema)
        result = self.conn.execute(f"SELECT * FROM {safe_name} ORDER BY {order_cols}")
        columns = [desc[0] for desc in result.description]
        with output_path.open("w", encoding="utf-8") as f:
            while True:
                batch = result.fetchmany(10_000)
                if not batch:
                    break
                for row in batch:
                    record = dict(zip(columns, row))
                    line = json.dumps(record, sort_keys=True, separators=(",", ":"), default=str)
                    f.write(line)
                    f.write("\n")

    def validate_query(self, sql: str) -> str | None:
        """Validate a SQL query using EXPLAIN without executing it.

        Returns None on success, or an error message string on failure.
        """
        try:
            self.conn.execute(f"EXPLAIN ({sql})")
            return None
        except duckdb.Error as e:
            return str(e)

    def close(self) -> None:
        self.conn.close()
