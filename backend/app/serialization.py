"""Shared JSON serialization helpers."""

from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import Any


def json_safe(obj: Any) -> Any:
    """Recursively convert non-JSON-serializable values to strings.

    Handles datetime, date, Decimal, and any other non-serializable types.
    """
    if isinstance(obj, dict):
        return {k: json_safe(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [json_safe(v) for v in obj]
    if isinstance(obj, (datetime, date)):
        return obj.isoformat()
    if isinstance(obj, Decimal):
        return float(obj)
    return obj
