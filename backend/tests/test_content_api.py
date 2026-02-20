from app.services import cas


def _create_workflow(client, name="Test Workflow"):
    resp = client.post("/api/workflows", json={"name": name})
    assert resp.status_code == 201
    return resp.json()


def _store_content_and_run(client, db, workflow_id, query_text="SELECT 1"):
    query_hash = cas.store_content(db, query_text, "query")
    config_hash = cas.store_content(db, '{"sources":[]}', "source_config")
    params_hash = cas.store_content(db, '{"x":1}', "parameters")
    db.commit()

    from datetime import UTC, datetime

    from app.models.run import RunHistory

    run = RunHistory(
        workflow_id=workflow_id,
        parameters={"x": 1},
        status="success",
        started_at=datetime.now(UTC).isoformat(),
        completed_at=datetime.now(UTC).isoformat(),
        duration_ms=42,
        row_count=1,
        query_hash=query_hash,
        source_config_hash=config_hash,
        parameters_hash=params_hash,
    )
    db.add(run)
    db.commit()
    return run, query_hash


def test_get_content_found(client, db):
    wf = _create_workflow(client)
    _run, query_hash = _store_content_and_run(client, db, wf["id"])

    resp = client.get(f"/api/content/{query_hash}")
    assert resp.status_code == 200
    data = resp.json()
    assert data["sha256"] == query_hash
    assert data["kind"] == "query"
    assert data["content"] == "SELECT 1"
    assert data["byte_size"] == len(b"SELECT 1")


def test_get_content_not_found(client):
    fake_hash = "0" * 64
    resp = client.get(f"/api/content/{fake_hash}")
    assert resp.status_code == 404


def test_query_history_basic(client, db):
    wf = _create_workflow(client)
    _store_content_and_run(client, db, wf["id"], "SELECT 1")
    _store_content_and_run(client, db, wf["id"], "SELECT 1")
    _store_content_and_run(client, db, wf["id"], "SELECT 2")

    resp = client.get(f"/api/workflows/{wf['id']}/query-history")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 2

    # Most recently used first
    queries = [entry["query"] for entry in data]
    assert "SELECT 2" in queries
    assert "SELECT 1" in queries

    # Check deduplication — SELECT 1 was used twice
    select1 = next(e for e in data if e["query"] == "SELECT 1")
    assert select1["run_count"] == 2


def test_query_history_empty(client):
    wf = _create_workflow(client)
    resp = client.get(f"/api/workflows/{wf['id']}/query-history")
    assert resp.status_code == 200
    assert resp.json() == []


def test_query_history_isolates_workflows(client, db):
    wf1 = _create_workflow(client, "WF1")
    wf2 = _create_workflow(client, "WF2")
    _store_content_and_run(client, db, wf1["id"], "SELECT 1")
    _store_content_and_run(client, db, wf2["id"], "SELECT 2")

    resp1 = client.get(f"/api/workflows/{wf1['id']}/query-history")
    assert len(resp1.json()) == 1
    assert resp1.json()[0]["query"] == "SELECT 1"

    resp2 = client.get(f"/api/workflows/{wf2['id']}/query-history")
    assert len(resp2.json()) == 1
    assert resp2.json()[0]["query"] == "SELECT 2"
