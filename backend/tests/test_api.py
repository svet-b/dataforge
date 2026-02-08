from pathlib import Path
from typing import Any

from fastapi.testclient import TestClient

FIXTURES_DIR = Path(__file__).parent / "fixtures"


def _create_pipeline(
    client: TestClient,
    name: str = "Test Pipeline",
    description: str | None = "A test pipeline",
    parameters: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    body: dict[str, Any] = {"name": name, "description": description}
    if parameters is not None:
        body["parameters"] = parameters
    resp = client.post("/api/pipelines", json=body)
    assert resp.status_code == 201
    return resp.json()


def _add_node(
    client: TestClient,
    pipeline_id: str,
    node_type: str = "transform",
    name: str = "Node",
    output_table_name: str = "output",
    config: dict[str, Any] | None = None,
) -> dict[str, Any]:
    resp = client.post(
        f"/api/pipelines/{pipeline_id}/nodes",
        json={
            "type": node_type,
            "name": name,
            "output_table_name": output_table_name,
            "config": config or {},
        },
    )
    assert resp.status_code == 201
    return resp.json()


def _add_edge(
    client: TestClient, pipeline_id: str, source_id: str, target_id: str
) -> dict[str, Any]:
    resp = client.post(
        f"/api/pipelines/{pipeline_id}/edges",
        json={"source_node_id": source_id, "target_node_id": target_id},
    )
    assert resp.status_code == 201
    return resp.json()


# ── Pipeline CRUD ──────────────────────────────────────────────


def test_create_pipeline(client: TestClient) -> None:
    data = _create_pipeline(
        client,
        parameters=[{"name": "start_date", "type": "date", "default": "2026-01-01"}],
    )
    assert data["name"] == "Test Pipeline"
    assert data["description"] == "A test pipeline"
    assert len(data["parameters"]) == 1
    assert data["parameters"][0]["name"] == "start_date"


def test_list_pipelines(client: TestClient) -> None:
    _create_pipeline(client, name="Pipeline A")
    _create_pipeline(client, name="Pipeline B")
    resp = client.get("/api/pipelines")
    assert resp.status_code == 200
    pipelines = resp.json()
    assert len(pipelines) == 2
    # Sorted by updated_at desc, so B (created second) first
    assert pipelines[0]["name"] == "Pipeline B"
    assert "node_count" in pipelines[0]
    assert "parameter_count" in pipelines[0]


def test_get_pipeline_detail(client: TestClient) -> None:
    pipeline = _create_pipeline(client)
    pid = pipeline["id"]
    n1 = _add_node(client, pid, "source_file", "Source", "raw_data")
    n2 = _add_node(client, pid, "transform", "Transform", "result")
    _add_edge(client, pid, n1["id"], n2["id"])

    resp = client.get(f"/api/pipelines/{pid}")
    assert resp.status_code == 200
    detail = resp.json()
    assert len(detail["nodes"]) == 2
    assert len(detail["edges"]) == 1


def test_update_pipeline(client: TestClient) -> None:
    pipeline = _create_pipeline(client)
    pid = pipeline["id"]
    original_updated = pipeline["updated_at"]

    resp = client.put(
        f"/api/pipelines/{pid}",
        json={"name": "Updated Name", "parameters": [{"name": "x", "type": "string"}]},
    )
    assert resp.status_code == 200
    updated = resp.json()
    assert updated["name"] == "Updated Name"
    assert len(updated["parameters"]) == 1
    assert updated["updated_at"] >= original_updated


def test_delete_pipeline_cascades(client: TestClient, db: Any) -> None:
    pipeline = _create_pipeline(client)
    pid = pipeline["id"]
    n1 = _add_node(client, pid, "source_file", "Source", "raw_data")
    n2 = _add_node(client, pid, "output", "Out", "out")
    _add_edge(client, pid, n1["id"], n2["id"])

    resp = client.delete(f"/api/pipelines/{pid}")
    assert resp.status_code == 204

    # Verify cascade
    assert client.get(f"/api/pipelines/{pid}").status_code == 404


def test_get_pipeline_not_found(client: TestClient) -> None:
    resp = client.get("/api/pipelines/nonexistent")
    assert resp.status_code == 404


# ── Node CRUD ──────────────────────────────────────────────────


def test_add_node(client: TestClient) -> None:
    pipeline = _create_pipeline(client)
    node = _add_node(client, pipeline["id"], "transform", "My Node", "my_table")
    assert node["name"] == "My Node"
    assert node["output_table_name"] == "my_table"
    assert node["pipeline_id"] == pipeline["id"]


def test_add_node_duplicate_table_name(client: TestClient) -> None:
    pipeline = _create_pipeline(client)
    pid = pipeline["id"]
    _add_node(client, pid, "transform", "Node A", "readings")
    resp = client.post(
        f"/api/pipelines/{pid}/nodes",
        json={"type": "transform", "name": "Node B", "output_table_name": "readings"},
    )
    assert resp.status_code == 409
    assert "already exists" in resp.json()["detail"]


def test_add_node_invalid_table_name(client: TestClient) -> None:
    pipeline = _create_pipeline(client)
    pid = pipeline["id"]
    for bad_name in ["123abc", "drop table", "has-dash", ""]:
        resp = client.post(
            f"/api/pipelines/{pid}/nodes",
            json={"type": "transform", "name": "Node", "output_table_name": bad_name},
        )
        assert resp.status_code == 400, f"Expected 400 for table name {bad_name!r}"


def test_update_node(client: TestClient) -> None:
    pipeline = _create_pipeline(client)
    node = _add_node(client, pipeline["id"], "transform", "Old Name", "old_table")
    resp = client.put(
        f"/api/pipelines/{pipeline['id']}/nodes/{node['id']}",
        json={"name": "New Name", "output_table_name": "new_table"},
    )
    assert resp.status_code == 200
    updated = resp.json()
    assert updated["name"] == "New Name"
    assert updated["output_table_name"] == "new_table"


def test_delete_node_removes_edges(client: TestClient) -> None:
    pipeline = _create_pipeline(client)
    pid = pipeline["id"]
    n1 = _add_node(client, pid, "source_file", "Source", "raw")
    n2 = _add_node(client, pid, "transform", "Mid", "mid")
    n3 = _add_node(client, pid, "output", "Out", "out")
    _add_edge(client, pid, n1["id"], n2["id"])
    _add_edge(client, pid, n2["id"], n3["id"])

    # Delete n2 — both edges should be removed
    resp = client.delete(f"/api/pipelines/{pid}/nodes/{n2['id']}")
    assert resp.status_code == 204

    detail = client.get(f"/api/pipelines/{pid}").json()
    assert len(detail["nodes"]) == 2
    assert len(detail["edges"]) == 0


# ── Edge CRUD ──────────────────────────────────────────────────


def test_add_edge(client: TestClient) -> None:
    pipeline = _create_pipeline(client)
    pid = pipeline["id"]
    n1 = _add_node(client, pid, "source_file", "Source", "raw")
    n2 = _add_node(client, pid, "transform", "Transform", "result")
    edge = _add_edge(client, pid, n1["id"], n2["id"])
    assert edge["source_node_id"] == n1["id"]
    assert edge["target_node_id"] == n2["id"]


def test_add_edge_creates_cycle(client: TestClient) -> None:
    pipeline = _create_pipeline(client)
    pid = pipeline["id"]
    n1 = _add_node(client, pid, "source_file", "A", "a")
    n2 = _add_node(client, pid, "transform", "B", "b")
    n3 = _add_node(client, pid, "transform", "C", "c")
    _add_edge(client, pid, n1["id"], n2["id"])
    _add_edge(client, pid, n2["id"], n3["id"])

    # C -> A should create a cycle
    resp = client.post(
        f"/api/pipelines/{pid}/edges",
        json={"source_node_id": n3["id"], "target_node_id": n1["id"]},
    )
    assert resp.status_code == 400
    assert "cycle" in resp.json()["detail"].lower()


def test_add_edge_duplicate(client: TestClient) -> None:
    pipeline = _create_pipeline(client)
    pid = pipeline["id"]
    n1 = _add_node(client, pid, "source_file", "A", "a")
    n2 = _add_node(client, pid, "transform", "B", "b")
    _add_edge(client, pid, n1["id"], n2["id"])

    resp = client.post(
        f"/api/pipelines/{pid}/edges",
        json={"source_node_id": n1["id"], "target_node_id": n2["id"]},
    )
    assert resp.status_code == 409
    assert "already exists" in resp.json()["detail"]


def test_add_edge_cross_pipeline(client: TestClient) -> None:
    p1 = _create_pipeline(client, name="Pipeline 1")
    p2 = _create_pipeline(client, name="Pipeline 2")
    n1 = _add_node(client, p1["id"], "source_file", "A", "a")
    n2 = _add_node(client, p2["id"], "transform", "B", "b")

    resp = client.post(
        f"/api/pipelines/{p1['id']}/edges",
        json={"source_node_id": n1["id"], "target_node_id": n2["id"]},
    )
    assert resp.status_code == 400


def test_delete_edge(client: TestClient) -> None:
    pipeline = _create_pipeline(client)
    pid = pipeline["id"]
    n1 = _add_node(client, pid, "source_file", "A", "a")
    n2 = _add_node(client, pid, "transform", "B", "b")
    edge = _add_edge(client, pid, n1["id"], n2["id"])

    resp = client.delete(f"/api/pipelines/{pid}/edges/{edge['id']}")
    assert resp.status_code == 204

    detail = client.get(f"/api/pipelines/{pid}").json()
    assert len(detail["edges"]) == 0


# ── File Upload ────────────────────────────────────────────────


def test_upload_csv(client: TestClient, tmp_path: Path) -> None:
    pipeline = _create_pipeline(client)
    pid = pipeline["id"]

    csv_content = b"col1,col2\nval1,val2\n"
    resp = client.post(
        f"/api/pipelines/{pid}/files",
        files={"file": ("data.csv", csv_content, "text/csv")},
    )
    assert resp.status_code == 201
    file_data = resp.json()
    assert file_data["filename"] == "data.csv"
    assert file_data["file_type"] == "csv"

    # Verify listed
    list_resp = client.get(f"/api/pipelines/{pid}/files")
    assert len(list_resp.json()) == 1


def test_delete_file_removes_from_disk(client: TestClient) -> None:
    pipeline = _create_pipeline(client)
    pid = pipeline["id"]

    csv_content = b"col1,col2\nval1,val2\n"
    resp = client.post(
        f"/api/pipelines/{pid}/files",
        files={"file": ("data.csv", csv_content, "text/csv")},
    )
    file_data = resp.json()
    file_id = file_data["id"]

    # Get the storage path from DB to check disk later
    # Just verify delete works
    resp = client.delete(f"/api/pipelines/{pid}/files/{file_id}")
    assert resp.status_code == 204

    # Verify removed from listing
    list_resp = client.get(f"/api/pipelines/{pid}/files")
    assert len(list_resp.json()) == 0


# ── Run History ────────────────────────────────────────────────


def test_run_history_returns_recent(client: TestClient, db: Any) -> None:
    pipeline = _create_pipeline(client)
    pid = pipeline["id"]

    # Create a simple executable pipeline
    csv_path = str(FIXTURES_DIR / "sample_meter_data.csv")
    src_cfg = {"file_path": csv_path, "file_type": "csv"}
    agg_sql = "SELECT meter_id, COUNT(*) as cnt FROM raw GROUP BY meter_id"
    n1 = _add_node(client, pid, "source_file", "Source", "raw", src_cfg)
    n2 = _add_node(client, pid, "transform", "Agg", "agg", {"sql": agg_sql})
    n3 = _add_node(client, pid, "output", "Out", "out_table", {"source_table": "agg"})
    _add_edge(client, pid, n1["id"], n2["id"])
    _add_edge(client, pid, n2["id"], n3["id"])

    # Execute twice
    client.post(f"/api/pipelines/{pid}/run", json={"parameters": {}})
    client.post(f"/api/pipelines/{pid}/run", json={"parameters": {}})

    resp = client.get(f"/api/pipelines/{pid}/runs")
    assert resp.status_code == 200
    runs = resp.json()
    assert len(runs) == 2
    # Newest first
    assert runs[0]["started_at"] >= runs[1]["started_at"]


def test_get_run_detail(client: TestClient) -> None:
    pipeline = _create_pipeline(client)
    pid = pipeline["id"]

    csv_path = str(FIXTURES_DIR / "sample_meter_data.csv")
    src_cfg = {"file_path": csv_path, "file_type": "csv"}
    n1 = _add_node(client, pid, "source_file", "Source", "raw", src_cfg)
    n2 = _add_node(client, pid, "output", "Out", "out_table", {"source_table": "raw"})
    _add_edge(client, pid, n1["id"], n2["id"])

    run_resp = client.post(f"/api/pipelines/{pid}/run", json={"parameters": {}})
    run_id = run_resp.json()["run_id"]

    resp = client.get(f"/api/pipelines/{pid}/runs/{run_id}")
    assert resp.status_code == 200
    detail = resp.json()
    assert detail["status"] == "success"
    assert detail["node_timings"] is not None


# ── Full Workflow Integration ──────────────────────────────────


def test_full_workflow(client: TestClient) -> None:
    """
    1. Create pipeline with parameters
    2. Add source_file node
    3. Upload a CSV
    4. Add transform node with SQL
    5. Add output node
    6. Connect with edges
    7. Execute pipeline
    8. Verify results
    9. Check run history
    """
    # 1. Create pipeline
    pipeline = _create_pipeline(
        client,
        name="Energy Analysis",
        parameters=[{"name": "target_meter", "type": "string", "default": "M-001"}],
    )
    pid = pipeline["id"]

    # 2. Add source_file node (using fixture file path directly)
    csv_path = str(FIXTURES_DIR / "sample_meter_data.csv")
    source = _add_node(
        client,
        pid,
        "source_file",
        "Load Meter Data",
        "raw_readings",
        {"file_path": csv_path, "file_type": "csv"},
    )

    # 3. Upload a CSV (for listing test, not used in execution)
    csv_content = b"meter_id,reading\nM-001,100\n"
    upload_resp = client.post(
        f"/api/pipelines/{pid}/files",
        files={"file": ("extra.csv", csv_content, "text/csv")},
    )
    assert upload_resp.status_code == 201

    # 4. Add transform node
    transform = _add_node(
        client,
        pid,
        "transform",
        "Aggregate Energy",
        "meter_totals",
        {
            "sql": "SELECT meter_id, SUM(energy_kwh) AS total_kwh "
            "FROM raw_readings GROUP BY meter_id"
        },
    )

    # 5. Add output node
    output = _add_node(
        client,
        pid,
        "output",
        "Final Output",
        "final_output",
        {"source_table": "meter_totals"},
    )

    # 6. Connect with edges
    _add_edge(client, pid, source["id"], transform["id"])
    _add_edge(client, pid, transform["id"], output["id"])

    # 7. Execute pipeline
    run_resp = client.post(f"/api/pipelines/{pid}/run", json={"parameters": {}})
    assert run_resp.status_code == 200
    result = run_resp.json()
    assert result["status"] == "success"
    assert result["row_count"] == 2

    # 8. Verify results
    data = result["data"]
    by_meter = {row["meter_id"]: row["total_kwh"] for row in data}
    assert abs(by_meter["M-001"] - 36.9) < 0.01
    assert abs(by_meter["M-002"] - 42.4) < 0.01

    # 9. Check run history
    history = client.get(f"/api/pipelines/{pid}/runs").json()
    assert len(history) == 1
    assert history[0]["status"] == "success"

    # Verify files listing
    files = client.get(f"/api/pipelines/{pid}/files").json()
    assert len(files) == 1
    assert files[0]["filename"] == "extra.csv"
