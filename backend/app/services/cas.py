from __future__ import annotations

import hashlib
import json
import shutil
from pathlib import Path
from typing import Any

from sqlalchemy.orm import Session

from app.models.content_store import ContentStore


def sha256_of_string(text: str) -> str:
    """Hash UTF-8 bytes of a string, return hex digest."""
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def sha256_of_file(path: Path) -> str:
    """Streaming SHA-256 of a file using 64KB chunks."""
    h = hashlib.sha256()
    with open(path, "rb") as f:
        while chunk := f.read(65536):
            h.update(chunk)
    return h.hexdigest()


def sha256_of_bytes(data: bytes) -> str:
    """SHA-256 of raw bytes."""
    return hashlib.sha256(data).hexdigest()


def canonicalize_json(obj: Any) -> str:
    """Deterministic JSON: sorted keys, compact separators."""
    return json.dumps(obj, sort_keys=True, separators=(",", ":"))


def canonicalize_source_configs(sources: list[dict[str, Any]]) -> str:
    """Canonical representation of source configs for hashing.

    Sorts by table_name, extracts (table_name, type, config) tuples.
    """
    extracted = sorted(
        [
            {
                "table_name": s["table_name"],
                "type": s["type"],
                "config": s["config"],
            }
            for s in sources
        ],
        key=lambda x: x["table_name"],
    )
    return canonicalize_json(extracted)


def store_content(db: Session, content: str, kind: str) -> str:
    """Upsert text content to content_store, return sha256.

    Adds to the session without committing — caller commits.
    """
    digest = sha256_of_string(content)
    existing = db.get(ContentStore, digest)
    if existing is None:
        entry = ContentStore(
            sha256=digest,
            kind=kind,
            content=content,
            byte_size=len(content.encode("utf-8")),
        )
        db.add(entry)
    return digest


def get_content(db: Session, sha256: str) -> str | None:
    """Look up content by hash."""
    entry = db.get(ContentStore, sha256)
    return entry.content if entry else None


def cas_path(data_dir: str, sha256: str) -> Path:
    """CAS file path with 2-char fanout: {data_dir}/cas/{sha256[:2]}/{sha256}."""
    return Path(data_dir) / "cas" / sha256[:2] / sha256


def store_file(data_dir: str, source_path: Path) -> str:
    """Copy a file into CAS, return sha256. Idempotent."""
    digest = sha256_of_file(source_path)
    dest = cas_path(data_dir, digest)
    if not dest.exists():
        dest.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source_path, dest)
    return digest


def store_bytes(data_dir: str, data: bytes) -> str:
    """Write bytes into CAS, return sha256. Idempotent."""
    digest = sha256_of_bytes(data)
    dest = cas_path(data_dir, digest)
    if not dest.exists():
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_bytes(data)
    return digest


def get_file_path(data_dir: str, sha256: str) -> Path | None:
    """Return CAS file path if it exists, else None."""
    p = cas_path(data_dir, sha256)
    return p if p.exists() else None
