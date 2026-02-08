from __future__ import annotations

from pathlib import Path
from typing import Any


class FileConnector:
    """Loads uploaded files (CSV, JSON, Parquet)."""

    async def fetch(
        self,
        config: dict[str, Any],
        parameters: dict[str, Any],
        env: dict[str, str],
    ) -> Path:
        file_path = Path(config["file_path"])
        if not file_path.exists():
            raise FileNotFoundError(f"Source file not found: {file_path}")
        return file_path

    def duckdb_load_method(self) -> str:
        return "auto"

    def get_file_type(self, config: dict[str, Any]) -> str:
        file_type: str = config.get("file_type", "")
        if file_type:
            return file_type
        suffix = Path(config["file_path"]).suffix.lower()
        return {".csv": "csv", ".json": "json", ".parquet": "parquet"}.get(suffix, "csv")
