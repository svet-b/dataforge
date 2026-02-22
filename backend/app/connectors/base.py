from __future__ import annotations

from pathlib import Path
from typing import Any, Protocol


class SourceConnector(Protocol):
    async def fetch(
        self,
        config: dict[str, Any],
        parameters: dict[str, Any],
        env: dict[str, str],
    ) -> Path:
        """Fetch data, return path to a temp file for DuckDB ingestion."""
        ...
