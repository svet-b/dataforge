from __future__ import annotations

import json
import re
import tempfile
import time
from pathlib import Path
from typing import Any

import httpx

# Keys in the API response that are metadata, not time-series metrics
_NON_METRIC_KEYS = frozenset({
    "asset_id",
    "asset_name",
    "long_name",
    "latitude",
    "longitude",
    "total_pv_power",
    "region",
    "place",
    "country_code",
    "beta",
    "tref",
    "tags",
    "asset_specific_params",
    "co2_offset_factor",
    "modeled_loss",
    "expected_pr",
    "warnings",
    "grid_tariff_name",
    "grid_tariff_metadata",
    "grid_tariff_id",
    "ppa_tariff_name",
    "ppa_tariff_metadata",
    "ppa_tariff_id",
    "grid_tariff_latest_period",
    "ppa_tariff_latest_period",
})


class AMMPConnector:
    """Fetches data from the AMMP Data API and flattens time-series to wide format."""

    BASE_URL = "https://data-api.ammp.io"

    def __init__(self) -> None:
        self._token: str | None = None
        self._token_expires_at: float = 0.0

    async def _get_token(self, env: dict[str, str]) -> str:
        """Authenticate with the AMMP API and return a JWT token.

        Caches the token and refreshes 5 minutes before expiry.
        """
        now = time.monotonic()
        if self._token and now < self._token_expires_at:
            return self._token

        api_key = env.get("AMMP_DATA_API_KEY", "")
        if not api_key:
            msg = "AMMP_DATA_API_KEY is not configured"
            raise ValueError(msg)

        async with httpx.AsyncClient() as client:
            resp = await client.post(
                f"{self.BASE_URL}/v1/token",
                headers={"X-API-Key": api_key},
            )
            resp.raise_for_status()
            data = resp.json()

        token: str = data["access_token"]
        self._token = token
        # Cache for 55 minutes (token is valid for 60 min)
        self._token_expires_at = now + 55 * 60
        return token

    def _resolve(
        self,
        config: dict[str, Any],
        parameters: dict[str, Any],
        key: str,
        default: str = "",
    ) -> str:
        """Get a config value, falling back to parameters, with template interpolation."""
        val = config.get(key, "")
        if not val:
            val = parameters.get(key, default)
        return self._interpolate(str(val), parameters) if val else default

    @staticmethod
    def _interpolate(template: str, parameters: dict[str, Any]) -> str:
        """Replace {{param_name}} placeholders in a template string."""

        def replacer(match: re.Match[str]) -> str:
            key = match.group(1).strip()
            if key not in parameters:
                raise ValueError(f"Unknown parameter: {key}")
            return str(parameters[key])

        return re.sub(r"\{\{(.+?)\}\}", replacer, template)

    def _build_url(self, config: dict[str, Any], parameters: dict[str, Any]) -> str:
        """Build the full API URL for the configured endpoint."""
        endpoint = config.get("endpoint", "historic-energy")
        asset_id = self._resolve(config, parameters, "asset_id")
        if not asset_id:
            msg = "asset_id is required (set in config or as a workflow parameter)"
            raise ValueError(msg)

        if endpoint == "financial-impact":
            path = f"/v1/assets/{asset_id}/commercial-kpis/financial-impact"
        else:
            path = f"/v1/assets/{asset_id}/historic-energy"
        return f"{self.BASE_URL}{path}"

    def _build_params(
        self, config: dict[str, Any], parameters: dict[str, Any]
    ) -> dict[str, str]:
        """Build query parameters for the API request."""
        params: dict[str, str] = {}
        date_from = self._resolve(config, parameters, "date_from")
        if date_from:
            params["date_from"] = date_from
        date_to = self._resolve(config, parameters, "date_to")
        if date_to:
            params["date_to"] = date_to
        interval = self._resolve(config, parameters, "interval", "1h")
        if interval:
            params["interval"] = interval
        return params

    @staticmethod
    def _extract_metrics(data: dict[str, Any]) -> dict[str, dict[str, Any]]:
        """Extract time-series metric dicts from the API response.

        Handles both shapes:
        - historic-energy: metrics at top level (data.pv_energy)
        - financial-impact: metrics nested under 'data' key (data.data.pv_energy)
        """
        # Check if metrics are nested under a 'data' key (financial-impact shape)
        source = data.get("data", data) if isinstance(data.get("data"), dict) else data

        metrics: dict[str, dict[str, Any]] = {}
        for key, value in source.items():
            if key in _NON_METRIC_KEYS:
                continue
            if isinstance(value, dict) and "data" in value and isinstance(value["data"], list):
                metrics[key] = value
        return metrics

    @staticmethod
    def _flatten_to_wide(metrics: dict[str, dict[str, Any]]) -> list[dict[str, Any]]:
        """Pivot metric time-series into wide-format rows keyed by date.

        Date strings are passed through as-is from the API. DuckDB's read_json_auto
        will parse plain dates ('2025-01-01') as DATE and ISO timestamps
        ('2025-01-01T06:00:00+02:00') as TIMESTAMP, matching the interval granularity.
        """
        # Collect all dates → {metric_name: value}
        date_map: dict[str, dict[str, Any]] = {}
        for metric_name, metric_data in metrics.items():
            for point in metric_data.get("data", []):
                date = point.get("date", "")
                if date not in date_map:
                    date_map[date] = {"date": date}
                date_map[date][metric_name] = point.get("value")

        # Sort by date
        return sorted(date_map.values(), key=lambda r: r["date"])

    async def fetch(
        self,
        config: dict[str, Any],
        parameters: dict[str, Any],
        env: dict[str, str],
    ) -> Path:
        """Fetch data from AMMP API and return path to wide-format NDJSON temp file."""
        token = await self._get_token(env)
        url = self._build_url(config, parameters)
        query_params = self._build_params(config, parameters)

        async with httpx.AsyncClient() as client:
            resp = await client.get(
                url,
                params=query_params,
                headers={"Authorization": f"Bearer {token}"},
                timeout=60.0,
            )
            resp.raise_for_status()
            data = resp.json()

        metrics = self._extract_metrics(data)
        rows = self._flatten_to_wide(metrics)

        tmp = tempfile.NamedTemporaryFile(mode="w", suffix=".ndjson", delete=False)
        for row in rows:
            tmp.write(json.dumps(row) + "\n")
        tmp.close()
        return Path(tmp.name)

    async def fetch_raw(
        self,
        config: dict[str, Any],
        parameters: dict[str, Any],
        env: dict[str, str],
    ) -> tuple[Any, list[Any]]:
        """Fetch raw JSON and return (raw_data, flattened_records) for preview."""
        token = await self._get_token(env)
        url = self._build_url(config, parameters)
        query_params = self._build_params(config, parameters)

        async with httpx.AsyncClient() as client:
            resp = await client.get(
                url,
                params=query_params,
                headers={"Authorization": f"Bearer {token}"},
                timeout=60.0,
            )
            resp.raise_for_status()
            raw_data = resp.json()

        metrics = self._extract_metrics(raw_data)
        rows = self._flatten_to_wide(metrics)
        return raw_data, rows
