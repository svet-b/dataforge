from __future__ import annotations

import json
import re
import tempfile
from pathlib import Path
from typing import Any

import httpx


class APIConnector:
    """Fetches data from REST APIs."""

    def _resolve_headers(
        self,
        config: dict[str, Any],
        parameters: dict[str, Any],
        env: dict[str, str],
    ) -> dict[str, str]:
        """Normalize and interpolate request headers from config."""
        raw_headers = config.get("headers", {})
        # Accept headers as either a dict or a list of {key, value} objects
        if isinstance(raw_headers, list):
            headers_dict: dict[str, str] = {
                h["key"]: h["value"] for h in raw_headers if h.get("key")
            }
        else:
            headers_dict = raw_headers
        return {
            k: self._interpolate(v, parameters, env) for k, v in headers_dict.items()
        }

    async def fetch(
        self,
        config: dict[str, Any],
        parameters: dict[str, Any],
        env: dict[str, str],
    ) -> Path:
        url_template: str = config.get("url_template") or config.get("url") or ""
        url = self._interpolate(url_template, parameters, env)
        method: str = config.get("method", "GET").upper()
        headers = self._resolve_headers(config, parameters, env)
        body_template = config.get("body_template")
        body: dict[str, Any] | None = None
        if body_template:
            body_str = self._interpolate(json.dumps(body_template), parameters, env)
            body = json.loads(body_str)

        pagination = config.get("pagination")
        if pagination:
            records = await self._fetch_paginated(url, method, headers, body, pagination)
        else:
            async with httpx.AsyncClient() as client:
                if method == "POST":
                    response = await client.post(url, headers=headers, json=body)
                else:
                    response = await client.get(url, headers=headers)
                response.raise_for_status()
                data = response.json()

            response_path = config.get("response_path")
            if response_path:
                records = self._extract_by_path(data, response_path)
            elif isinstance(data, list):
                records = data
            else:
                records = [data]

        tmp = tempfile.NamedTemporaryFile(mode="w", suffix=".json", delete=False)
        for record in records:
            tmp.write(json.dumps(record) + "\n")
        tmp.close()
        return Path(tmp.name)

    def _interpolate(self, template: str, parameters: dict[str, Any], env: dict[str, str]) -> str:
        """Replace {{param_name}} and {{env.VAR_NAME}} in a template string."""

        def replacer(match: re.Match[str]) -> str:
            key = match.group(1).strip()
            if key.startswith("env."):
                env_key = key[4:]
                if env_key not in env:
                    raise ValueError(f"Unknown environment variable: {env_key}")
                return env[env_key]
            if key not in parameters:
                raise ValueError(f"Unknown parameter: {key}")
            return str(parameters[key])

        return re.sub(r"\{\{(.+?)\}\}", replacer, template)

    def _extract_by_path(self, data: Any, path: str) -> list[Any]:
        """Navigate nested dict using dot notation."""
        current = data
        for part in path.split("."):
            current = current[part]
        if isinstance(current, list):
            return current
        return [current]

    async def fetch_raw(
        self,
        config: dict[str, Any],
        parameters: dict[str, Any],
        env: dict[str, str],
    ) -> tuple[Any, list[Any]]:
        """Fetch raw JSON from the API and return (raw_data, extracted_records)."""
        url_template: str = config.get("url_template") or config.get("url") or ""
        url = self._interpolate(url_template, parameters, env)
        method: str = config.get("method", "GET").upper()
        headers = self._resolve_headers(config, parameters, env)
        async with httpx.AsyncClient() as client:
            if method == "POST":
                response = await client.post(url, headers=headers)
            else:
                response = await client.get(url, headers=headers)
            response.raise_for_status()
            raw_data = response.json()

        response_path = config.get("response_path")
        if response_path:
            extracted: list[Any] = self._extract_by_path(raw_data, response_path)
        elif isinstance(raw_data, list):
            extracted = raw_data
        else:
            extracted = [raw_data]

        return raw_data, extracted

    async def _fetch_paginated(
        self,
        url: str,
        method: str,
        headers: dict[str, str],
        body: dict[str, Any] | None,
        pagination: dict[str, Any],
    ) -> list[Any]:
        """Handle paginated API responses. Currently supports offset pagination."""
        strategy = pagination.get("strategy", "offset")
        limit = pagination.get("limit", 100)
        page_param = pagination.get("page_param", "page")
        response_path = pagination.get("response_path", "")
        all_records: list[Any] = []

        if strategy == "offset":
            page = pagination.get("start_page", 0)
            async with httpx.AsyncClient() as client:
                while True:
                    sep = "&" if "?" in url else "?"
                    paged_url = f"{url}{sep}{page_param}={page}&limit={limit}"
                    if method == "POST":
                        resp = await client.post(paged_url, headers=headers, json=body)
                    else:
                        resp = await client.get(paged_url, headers=headers)
                    resp.raise_for_status()
                    data = resp.json()
                    if response_path:
                        records = self._extract_by_path(data, response_path)
                    elif isinstance(data, list):
                        records = data
                    else:
                        records = [data]
                    all_records.extend(records)
                    if len(records) < limit:
                        break
                    page += 1
        # TODO: cursor-based pagination

        return all_records
