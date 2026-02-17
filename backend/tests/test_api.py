from pathlib import Path
from typing import Any

from fastapi.testclient import TestClient

FIXTURES_DIR = Path(__file__).parent / "fixtures"


def _create_workflow(
    client: TestClient,
    name: str = "Test Workflow",
    description: str | None = "A test workflow",
    parameters: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    body: dict[str, Any] = {"name": name, "description": description}
    if parameters is not None:
        body["parameters"] = parameters
    resp = client.post("/api/workflows", json=body)
    assert resp.status_code == 201
    return resp.json()


def _add_source(
    client: TestClient,
    workflow_id: str,
    source_type: str = "file",
    table_name: str = "my_table",
    config: dict[str, Any] | None = None,
) -> dict[str, Any]:
    resp = client.post(
        f"/api/workflows/{workflow_id}/sources",
        json={
            "type": source_type,
            "table_name": table_name,
            "config": config or {},
        },
    )
    assert resp.status_code == 201
    return resp.json()


# ── Workflow CRUD ──────────────────────────────────────────────


def test_create_workflow(client: TestClient) -> None:
    data = _create_workflow(
        client,
        parameters=[{"name": "start_date", "type": "date", "default": "2026-01-01"}],
    )
    assert data["name"] == "Test Workflow"
    assert data["description"] == "A test workflow"
    assert len(data["parameters"]) == 1
    assert data["parameters"][0]["name"] == "start_date"


def test_list_workflows(client: TestClient) -> None:
    _create_workflow(client, name="Workflow A")
    _create_workflow(client, name="Workflow B")
    resp = client.get("/api/workflows")
    assert resp.status_code == 200
    workflows = resp.json()
    assert len(workflows) == 2
    # Sorted by updated_at desc, so B (created second) first
    assert workflows[0]["name"] == "Workflow B"
    assert "source_count" in workflows[0]


def test_get_workflow_detail(client: TestClient) -> None:
    workflow = _create_workflow(client)
    pid = workflow["id"]
    _add_source(client, pid, "file", "raw_data")
    _add_source(client, pid, "api", "api_data")

    resp = client.get(f"/api/workflows/{pid}")
    assert resp.status_code == 200
    detail = resp.json()
    assert len(detail["sources"]) == 2


def test_update_workflow(client: TestClient) -> None:
    workflow = _create_workflow(client)
    pid = workflow["id"]
    original_updated = workflow["updated_at"]

    resp = client.put(
        f"/api/workflows/{pid}",
        json={
            "name": "Updated Name",
            "query": "SELECT 1",
            "parameters": [{"name": "x", "type": "string"}],
        },
    )
    assert resp.status_code == 200
    updated = resp.json()
    assert updated["name"] == "Updated Name"
    assert updated["query"] == "SELECT 1"
    assert len(updated["parameters"]) == 1
    assert updated["updated_at"] >= original_updated


def test_delete_workflow_cascades(client: TestClient, db: Any) -> None:
    workflow = _create_workflow(client)
    pid = workflow["id"]
    _add_source(client, pid, "file", "raw_data")

    resp = client.delete(f"/api/workflows/{pid}")
    assert resp.status_code == 204

    # Verify cascade
    assert client.get(f"/api/workflows/{pid}").status_code == 404


def test_get_workflow_not_found(client: TestClient) -> None:
    resp = client.get("/api/workflows/nonexistent")
    assert resp.status_code == 404


# ── Source CRUD ────────────────────────────────────────────────


def test_add_source(client: TestClient) -> None:
    workflow = _create_workflow(client)
    source = _add_source(client, workflow["id"], "file", "my_table")
    assert source["table_name"] == "my_table"
    assert source["type"] == "file"
    assert source["workflow_id"] == workflow["id"]


def test_add_source_duplicate_table_name(client: TestClient) -> None:
    workflow = _create_workflow(client)
    pid = workflow["id"]
    _add_source(client, pid, "file", "readings")
    resp = client.post(
        f"/api/workflows/{pid}/sources",
        json={"type": "file", "table_name": "readings"},
    )
    assert resp.status_code == 409
    assert "already exists" in resp.json()["detail"]


def test_add_source_invalid_table_name(client: TestClient) -> None:
    workflow = _create_workflow(client)
    pid = workflow["id"]
    for bad_name in ["123abc", "drop table", "has-dash", ""]:
        resp = client.post(
            f"/api/workflows/{pid}/sources",
            json={"type": "file", "table_name": bad_name},
        )
        assert resp.status_code == 400, f"Expected 400 for table name {bad_name!r}"


def test_update_source(client: TestClient) -> None:
    workflow = _create_workflow(client)
    source = _add_source(client, workflow["id"], "file", "old_table")
    resp = client.put(
        f"/api/workflows/{workflow['id']}/sources/{source['id']}",
        json={"table_name": "new_table", "config": {"filename": "data.csv"}},
    )
    assert resp.status_code == 200
    updated = resp.json()
    assert updated["table_name"] == "new_table"
    assert updated["config"]["filename"] == "data.csv"


def test_delete_source(client: TestClient) -> None:
    workflow = _create_workflow(client)
    pid = workflow["id"]
    source = _add_source(client, pid, "file", "to_delete")

    resp = client.delete(f"/api/workflows/{pid}/sources/{source['id']}")
    assert resp.status_code == 204

    detail = client.get(f"/api/workflows/{pid}").json()
    assert len(detail["sources"]) == 0


# ── File Upload ────────────────────────────────────────────────


def test_upload_csv(client: TestClient, tmp_path: Path) -> None:
    workflow = _create_workflow(client)
    pid = workflow["id"]

    csv_content = b"col1,col2\nval1,val2\n"
    resp = client.post(
        f"/api/workflows/{pid}/files",
        files={"file": ("data.csv", csv_content, "text/csv")},
    )
    assert resp.status_code == 201
    file_data = resp.json()
    assert file_data["filename"] == "data.csv"
    assert file_data["file_type"] == "csv"

    # Verify listed
    list_resp = client.get(f"/api/workflows/{pid}/files")
    assert len(list_resp.json()) == 1


def test_delete_file_removes_from_disk(client: TestClient) -> None:
    workflow = _create_workflow(client)
    pid = workflow["id"]

    csv_content = b"col1,col2\nval1,val2\n"
    resp = client.post(
        f"/api/workflows/{pid}/files",
        files={"file": ("data.csv", csv_content, "text/csv")},
    )
    file_data = resp.json()
    file_id = file_data["id"]

    resp = client.delete(f"/api/workflows/{pid}/files/{file_id}")
    assert resp.status_code == 204

    # Verify removed from listing
    list_resp = client.get(f"/api/workflows/{pid}/files")
    assert len(list_resp.json()) == 0


# ── Run History ────────────────────────────────────────────────


def test_run_history_returns_recent(client: TestClient, db: Any) -> None:
    workflow = _create_workflow(client)
    pid = workflow["id"]

    # Create a simple executable workflow
    csv_path = str(FIXTURES_DIR / "sample_meter_data.csv")
    src_cfg = {"file_path": csv_path, "file_type": "csv"}
    _add_source(client, pid, "file", "raw", src_cfg)

    # Set the query
    client.put(
        f"/api/workflows/{pid}",
        json={"query": "SELECT meter_id, COUNT(*) as cnt FROM raw GROUP BY meter_id"},
    )

    # Execute twice
    client.post(f"/api/workflows/{pid}/run", json={"parameters": {}})
    client.post(f"/api/workflows/{pid}/run", json={"parameters": {}})

    resp = client.get(f"/api/workflows/{pid}/runs")
    assert resp.status_code == 200
    runs = resp.json()
    assert len(runs) == 2
    # Newest first
    assert runs[0]["started_at"] >= runs[1]["started_at"]


def test_get_run_detail(client: TestClient) -> None:
    workflow = _create_workflow(client)
    pid = workflow["id"]

    csv_path = str(FIXTURES_DIR / "sample_meter_data.csv")
    src_cfg = {"file_path": csv_path, "file_type": "csv"}
    _add_source(client, pid, "file", "raw", src_cfg)

    client.put(
        f"/api/workflows/{pid}",
        json={"query": "SELECT * FROM raw"},
    )

    run_resp = client.post(f"/api/workflows/{pid}/run", json={"parameters": {}})
    run_id = run_resp.json()["run_id"]

    resp = client.get(f"/api/workflows/{pid}/runs/{run_id}")
    assert resp.status_code == 200
    detail = resp.json()
    assert detail["status"] == "success"


# ── Full Workflow Integration ──────────────────────────────────


def test_full_workflow(client: TestClient) -> None:
    """
    1. Create workflow with parameters
    2. Add file source
    3. Upload a CSV
    4. Set query with aggregation SQL
    5. Execute workflow
    6. Verify results
    7. Check run history
    8. Download results
    """
    # 1. Create workflow
    workflow = _create_workflow(
        client,
        name="Energy Analysis",
        parameters=[{"name": "target_meter", "type": "string", "default": "M-001"}],
    )
    pid = workflow["id"]

    # 2. Add file source (using fixture file path directly)
    csv_path = str(FIXTURES_DIR / "sample_meter_data.csv")
    _add_source(
        client,
        pid,
        "file",
        "raw_readings",
        {"file_path": csv_path, "file_type": "csv"},
    )

    # 3. Upload a CSV (for listing test, not used in execution)
    csv_content = b"meter_id,reading\nM-001,100\n"
    upload_resp = client.post(
        f"/api/workflows/{pid}/files",
        files={"file": ("extra.csv", csv_content, "text/csv")},
    )
    assert upload_resp.status_code == 201

    # 4. Set query with aggregation SQL
    client.put(
        f"/api/workflows/{pid}",
        json={
            "query": "SELECT meter_id, SUM(energy_kwh) AS total_kwh "
            "FROM raw_readings GROUP BY meter_id"
        },
    )

    # 5. Execute workflow
    run_resp = client.post(f"/api/workflows/{pid}/run", json={"parameters": {}})
    assert run_resp.status_code == 200
    result = run_resp.json()
    assert result["status"] == "success"
    assert result["row_count"] == 2

    # 6. Verify results
    data = result["data"]
    by_meter = {row["meter_id"]: row["total_kwh"] for row in data}
    assert abs(by_meter["M-001"] - 36.9) < 0.01
    assert abs(by_meter["M-002"] - 42.4) < 0.01

    # 7. Check run history
    history = client.get(f"/api/workflows/{pid}/runs").json()
    assert len(history) == 1
    assert history[0]["status"] == "success"

    # 8. Download results
    run_id = result["run_id"]
    csv_resp = client.get(f"/api/workflows/{pid}/runs/{run_id}/download?format=csv")
    assert csv_resp.status_code == 200
    assert "text/csv" in csv_resp.headers["content-type"]

    json_resp = client.get(f"/api/workflows/{pid}/runs/{run_id}/download?format=json")
    assert json_resp.status_code == 200
    assert "application/json" in json_resp.headers["content-type"]

    # Verify files listing
    files = client.get(f"/api/workflows/{pid}/files").json()
    assert len(files) == 1
    assert files[0]["filename"] == "extra.csv"


# ── Validate Query ──────────────────────────────────────────────


def test_validate_query_valid(client: TestClient) -> None:
    """A valid query against loaded sources should return valid=True."""
    workflow = _create_workflow(client)
    pid = workflow["id"]

    csv_path = str(FIXTURES_DIR / "sample_meter_data.csv")
    _add_source(client, pid, "file", "raw_data", {"file_path": csv_path, "file_type": "csv"})

    resp = client.post(
        f"/api/workflows/{pid}/validate-query",
        json={"query": "SELECT meter_id, energy_kwh FROM raw_data"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["valid"] is True
    assert data["error"] is None


def test_validate_query_invalid_column(client: TestClient) -> None:
    """Referencing a non-existent column should return valid=False with an error."""
    workflow = _create_workflow(client)
    pid = workflow["id"]

    csv_path = str(FIXTURES_DIR / "sample_meter_data.csv")
    _add_source(client, pid, "file", "raw_data", {"file_path": csv_path, "file_type": "csv"})

    resp = client.post(
        f"/api/workflows/{pid}/validate-query",
        json={"query": "SELECT nonexistent FROM raw_data"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["valid"] is False
    assert data["error"] is not None
    assert "nonexistent" in data["error"].lower()


def test_validate_query_no_sources(client: TestClient) -> None:
    """A workflow with no sources should still validate pure SQL."""
    workflow = _create_workflow(client)
    pid = workflow["id"]

    resp = client.post(
        f"/api/workflows/{pid}/validate-query",
        json={"query": "SELECT 1 AS result"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["valid"] is True


def test_validate_query_workflow_not_found(client: TestClient) -> None:
    resp = client.post(
        "/api/workflows/nonexistent/validate-query",
        json={"query": "SELECT 1"},
    )
    assert resp.status_code == 404
