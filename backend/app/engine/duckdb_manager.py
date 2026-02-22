from __future__ import annotations

import json
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
    """Wraps an in-memory DuckDB connection for a single workflow run.
    Disposed after the run completes."""

    def __init__(self, memory_limit_mb: int = 4096) -> None:
        self.conn = duckdb.connect(":memory:")
        self.conn.execute(f"SET memory_limit = '{memory_limit_mb}MB'")

    def _list_tables(self) -> list[str]:
        """Return names of all user-created tables in the session."""
        result = self.conn.execute(
            "SELECT table_name FROM information_schema.tables "
            "WHERE table_schema = 'main'"
        )
        return [row[0] for row in result.fetchall()]

    def _list_variables(self) -> list[tuple[str, str]]:
        """Return all session variables as (name, value) pairs."""
        result = self.conn.execute("SELECT name, value FROM duckdb_variables()")
        return [(row[0], str(row[1])) for row in result.fetchall()]

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

    def _copy_table_to(self, target: duckdb.DuckDBPyConnection, table_name: str) -> None:
        """Copy a table from this session's connection into *target*."""
        schema = self.conn.execute(f"DESCRIBE {table_name}").fetchall()
        cols = ", ".join(f'"{row[0]}" {row[1]}' for row in schema)
        target.execute(f"CREATE TABLE {table_name} ({cols})")
        rows = self.conn.execute(f"SELECT * FROM {table_name}").fetchall()
        if rows:
            placeholders = ", ".join(["?"] * len(schema))
            target.executemany(f"INSERT INTO {table_name} VALUES ({placeholders})", rows)

    def execute_transform(self, table_name: str, sql: str) -> None:
        """Execute a transform SQL and store result as a named table.

        User SQL is executed in a sandboxed DuckDB connection that has
        ``enable_external_access`` disabled at creation time.  This prevents
        functions like ``read_csv()`` or ``read_parquet()`` from reaching the
        filesystem.  Source tables and variables are copied into the sandbox
        so the user query can reference them normally.
        """
        safe_name = _validate_table_name(table_name)

        # Build a sandboxed connection with external access disabled.
        sandbox = duckdb.connect(":memory:", config={"enable_external_access": "false"})
        try:
            # Copy all existing tables into the sandbox.
            for src_name in self._list_tables():
                self._copy_table_to(sandbox, src_name)

            # Copy session variables.
            for var_name, var_value in self._list_variables():
                escaped = var_value.replace("'", "''")
                sandbox.execute(f"SET VARIABLE {var_name} = '{escaped}'")

            # Execute user SQL inside the sandbox.
            sandbox.execute(f"CREATE TABLE {safe_name} AS ({sql})")

            # Copy the result back into the main connection.
            result_schema = sandbox.execute(f"DESCRIBE {safe_name}").fetchall()
            result_cols = ", ".join(f'"{r[0]}" {r[1]}' for r in result_schema)
            self.conn.execute(f"CREATE TABLE {safe_name} ({result_cols})")
            result_rows = sandbox.execute(f"SELECT * FROM {safe_name}").fetchall()
            if result_rows:
                ph = ", ".join(["?"] * len(result_schema))
                self.conn.executemany(
                    f"INSERT INTO {safe_name} VALUES ({ph})", result_rows
                )
        finally:
            sandbox.close()

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
        safe_name = _validate_table_name(table_name)
        # Get column names for ORDER BY
        schema = self.get_table_schema(safe_name)
        order_cols = ", ".join(f'"{col["name"]}"' for col in schema)
        result = self.conn.execute(f"SELECT * FROM {safe_name} ORDER BY {order_cols}")
        columns = [desc[0] for desc in result.description]
        lines: list[str] = []
        for row in result.fetchall():
            record = dict(zip(columns, row))
            lines.append(json.dumps(record, sort_keys=True, separators=(",", ":"), default=str))
        return "\n".join(lines).encode("utf-8")

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
