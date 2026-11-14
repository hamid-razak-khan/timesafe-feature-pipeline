"""FastAPI Integration and End-to-End Endpoint Test Suite."""
import pytest
from fastapi.testclient import TestClient
from backend.main import app
from database.models import Customer
from datetime import datetime, timezone
from database.db import get_engine, init_db, get_session


@pytest.fixture(scope="module")
def client():
    """Create a TestClient instance."""
    init_db(get_engine())
    with TestClient(app) as c:
        yield c


def test_api_health(client):
    res = client.get("/api/health")
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "ok"
    assert data["database"] == "connected"


def test_api_generate_data(client):
    res = client.post("/api/generate-data", json={"customers": 10, "transactions": 25, "predictions": 5})
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "success"
    assert data["customers_count"] == 10
    assert "hashes" in data


def test_api_pipeline_run_happy_path(client):
    res = client.post("/api/pipeline/run", json={"feature_version": "v1"})
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "success"
    assert "run_id" in data
    assert data["feature_snapshots_count"] >= 0


def test_api_list_pipeline_runs(client):
    res = client.get("/api/pipeline/runs")
    assert res.status_code == 200
    runs = res.json()
    assert isinstance(runs, list)
    assert len(runs) > 0


def test_api_get_pipeline_run_details(client):
    runs_res = client.get("/api/pipeline/runs")
    run_id = runs_res.json()[0]["run_id"]

    res = client.get(f"/api/pipeline/runs/{run_id}")
    assert res.status_code == 200
    run = res.json()
    assert run["run_id"] == run_id


def test_api_get_pipeline_run_not_found(client):
    res = client.get("/api/pipeline/runs/RUN_DOES_NOT_EXIST_999")
    assert res.status_code == 404


def test_api_get_features(client):
    res = client.get("/api/features")
    assert res.status_code == 200
    feats = res.json()
    assert isinstance(feats, list)


def test_api_preview_features_happy_path(client):
    # Preview features for CUST_0001
    res = client.post("/api/features/preview", json={
        "customer_id": "CUST_0001",
        "as_of_time": "2026-05-31T00:00:00Z",
        "feature_version": "v1",
    })
    assert res.status_code == 200
    data = res.json()
    assert data["customer_id"] == "CUST_0001"
    assert "txn_count_7d" in data
    assert "total_purchase_amount_30d" in data


def test_api_preview_features_customer_not_found(client):
    res = client.post("/api/features/preview", json={
        "customer_id": "CUST_NON_EXISTENT_9999",
        "as_of_time": "2026-05-31T00:00:00Z",
    })
    assert res.status_code == 404


def test_api_preview_features_invalid_timestamp(client):
    res = client.post("/api/features/preview", json={
        "customer_id": "CUST_0001",
        "as_of_time": "corrupted-date-format",
    })
    assert res.status_code == 400


def test_api_get_rejects(client):
    res = client.get("/api/rejects")
    assert res.status_code == 200
    rejects = res.json()
    assert isinstance(rejects, list)


def test_api_get_metrics(client):
    res = client.get("/api/metrics")
    assert res.status_code == 200
    metrics = res.json()
    assert "total_transactions" in metrics
    assert "reconciliation_status" in metrics


def test_api_get_reconciliation_report(client):
    res = client.get("/api/reports/reconciliation")
    assert res.status_code == 200
    rep = res.json()
    assert "overall_status" in rep
    assert "integrity_checks" in rep


def test_api_export_features(client):
    res = client.get("/api/export/features")
    assert res.status_code == 200
    assert "text/csv" in res.headers["content-type"]
    assert "attachment; filename=feature_snapshots.csv" in res.headers["content-disposition"]
