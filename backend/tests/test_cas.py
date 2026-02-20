import hashlib
import tempfile
from pathlib import Path

from sqlalchemy import StaticPool, create_engine
from sqlalchemy.orm import sessionmaker

from app.models import Base
from app.services import cas


def _make_db():
    engine = create_engine("sqlite://", poolclass=StaticPool)
    Base.metadata.create_all(bind=engine)
    session = sessionmaker(bind=engine)()
    return session


# ── Hash correctness ──────────────────────────────────────────


def test_sha256_of_string_known_digest() -> None:
    # SHA-256 of empty string
    assert cas.sha256_of_string("") == hashlib.sha256(b"").hexdigest()
    # SHA-256 of "hello"
    assert cas.sha256_of_string("hello") == hashlib.sha256(b"hello").hexdigest()


def test_sha256_of_file_matches_string() -> None:
    with tempfile.NamedTemporaryFile(mode="wb", delete=False, suffix=".txt") as f:
        f.write(b"test content")
        f.flush()
        path = Path(f.name)
    assert cas.sha256_of_file(path) == hashlib.sha256(b"test content").hexdigest()
    path.unlink()


def test_sha256_of_bytes() -> None:
    data = b"some bytes"
    assert cas.sha256_of_bytes(data) == hashlib.sha256(data).hexdigest()


# ── Canonicalization ──────────────────────────────────────────


def test_canonicalize_json_sort_order() -> None:
    result = cas.canonicalize_json({"b": 2, "a": 1})
    assert result == '{"a":1,"b":2}'


def test_canonicalize_json_compact_separators() -> None:
    result = cas.canonicalize_json({"key": [1, 2, 3]})
    assert " " not in result
    assert result == '{"key":[1,2,3]}'


def test_canonicalize_source_configs() -> None:
    sources = [
        {"table_name": "z_table", "type": "file", "config": {"path": "z.csv"}, "id": "1"},
        {"table_name": "a_table", "type": "api", "config": {"url": "http://a"}, "id": "2"},
    ]
    result = cas.canonicalize_source_configs(sources)
    # Should be sorted by table_name, "id" excluded
    import json

    parsed = json.loads(result)
    assert parsed[0]["table_name"] == "a_table"
    assert parsed[1]["table_name"] == "z_table"
    # Should not contain "id" key
    assert "id" not in parsed[0]


# ── Content store ─────────────────────────────────────────────


def test_store_and_get_content() -> None:
    db = _make_db()
    digest = cas.store_content(db, "SELECT 1", "query")
    db.commit()

    assert len(digest) == 64  # SHA-256 hex
    content = cas.get_content(db, digest)
    assert content == "SELECT 1"


def test_store_content_idempotent() -> None:
    db = _make_db()
    d1 = cas.store_content(db, "SELECT 1", "query")
    db.commit()
    d2 = cas.store_content(db, "SELECT 1", "query")
    db.commit()
    assert d1 == d2

    # Only one row in content_store
    from app.models.content_store import ContentStore

    count = db.query(ContentStore).count()
    assert count == 1


def test_get_content_missing() -> None:
    db = _make_db()
    assert cas.get_content(db, "nonexistent") is None


# ── File store ────────────────────────────────────────────────


def test_store_file_and_path() -> None:
    with tempfile.TemporaryDirectory() as data_dir:
        with tempfile.NamedTemporaryFile(mode="wb", delete=False, suffix=".csv") as f:
            f.write(b"col1,col2\nval1,val2\n")
            f.flush()
            source = Path(f.name)

        digest = cas.store_file(data_dir, source)
        assert len(digest) == 64

        # CAS file should exist at expected path
        expected = cas.cas_path(data_dir, digest)
        assert expected.exists()
        assert expected.read_bytes() == b"col1,col2\nval1,val2\n"

        source.unlink()


def test_store_file_idempotent() -> None:
    with tempfile.TemporaryDirectory() as data_dir:
        with tempfile.NamedTemporaryFile(mode="wb", delete=False, suffix=".csv") as f:
            f.write(b"data")
            f.flush()
            source = Path(f.name)

        d1 = cas.store_file(data_dir, source)
        d2 = cas.store_file(data_dir, source)
        assert d1 == d2

        source.unlink()


def test_cas_path_fanout() -> None:
    digest = "abcdef1234567890" * 4  # 64-char fake hash
    p = cas.cas_path("/data", digest)
    assert p == Path("/data/cas/ab") / digest


def test_store_bytes_and_get() -> None:
    with tempfile.TemporaryDirectory() as data_dir:
        data = b"ndjson content here"
        digest = cas.store_bytes(data_dir, data)
        assert len(digest) == 64

        path = cas.get_file_path(data_dir, digest)
        assert path is not None
        assert path.read_bytes() == data


def test_get_file_path_missing() -> None:
    with tempfile.TemporaryDirectory() as data_dir:
        assert cas.get_file_path(data_dir, "nonexistent") is None
