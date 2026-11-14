"""Tests for Generic Transactional Feature Engineering and Wizard Endpoints."""
import os
import tempfile
import pytest
from datetime import datetime, timedelta, timezone
from backend.services.feature_engineering import compute_features, compute_generic_dataset_features
from scripts.generate_data import generate_generic_sample_dataset
from fastapi.testclient import TestClient
from backend.main import app
from database.db import get_engine, init_db


@pytest.fixture(scope="module")
def client():
    init_db(get_engine())
    with TestClient(app) as c:
        yield c


def test_generate_generic_sample_dataset():
    with tempfile.TemporaryDirectory() as tmpdir:
        out_csv = os.path.join(tmpdir, "test_generic.csv")
        res = generate_generic_sample_dataset(out_csv, num_entities=10, num_events=50, seed=42)
        assert os.path.exists(out_csv)
        assert res["total_records"] == 50
        assert res["total_entities"] == 10


def test_compute_features_with_banking_column_mapping():
    """Verify generic column mapping (e.g. banking transactions) works accurately."""
    cutoff = datetime(2026, 5, 31, 0, 0, 0, tzinfo=timezone.utc)
    account_id = "ACC_98765"

    banking_records = [
        # Past eligible transfer
        {
            "account_number": account_id,
            "timestamp": cutoff - timedelta(days=5),
            "ledger_post_time": cutoff - timedelta(days=5, minutes=-10),
            "transfer_amount": "250.00",
            "operation": "transfer",
        },
        # Past eligible payment
        {
            "account_number": account_id,
            "timestamp": cutoff - timedelta(days=20),
            "ledger_post_time": cutoff - timedelta(days=20, minutes=-5),
            "transfer_amount": "100.00",
            "operation": "payment",
        },
        # Future event (must be excluded)
        {
            "account_number": account_id,
            "timestamp": cutoff + timedelta(hours=2),
            "ledger_post_time": cutoff + timedelta(hours=2),
            "transfer_amount": "5000.00",
            "operation": "transfer",
        },
    ]

    col_map = {
        "entity_id": "account_number",
        "event_time": "timestamp",
        "available_at": "ledger_post_time",
        "amount": "transfer_amount",
        "event_type": "operation",
    }

    features = compute_features(
        transactions=banking_records,
        customer_id=account_id,
        as_of_time=cutoff,
        column_mapping=col_map,
    )

    assert features["event_count_7d"] == 1
    assert features["event_count_30d"] == 2
    assert features["total_amount_30d"] == 350.0
    assert features["avg_amount_30d"] == 175.0
    assert features["days_since_last_event"] == 5.0


def test_api_upload_preview_sample(client):
    res = client.post("/api/upload-preview", data={"use_sample": "true"})
    assert res.status_code == 200
    data = res.json()
    assert data["total_rows"] > 0
    assert "entity_id" in data["columns"]
    assert "event_time" in data["columns"]
    assert data["suggested_mapping"]["entity_id"] == "entity_id"
    assert data["suggested_mapping"]["event_time"] == "event_time"


def test_api_generate_generic_features(client):
    req_payload = {
        "column_mapping": {
            "entity_id": "entity_id",
            "event_time": "event_time",
            "available_at": "available_at",
            "amount": "amount",
            "event_type": "event_type",
        },
        "cutoff_time": "2026-05-15T00:00:00Z",
        "feature_options": ["count_7d", "count_30d", "total_amount_30d", "days_since_last"],
        "assume_available_at_event_time": False,
    }
    res = client.post("/api/features/generate-generic", json=req_payload)
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "success"
    assert data["total_entities"] > 0
    assert len(data["all_features"]) > 0
    first_feat = data["all_features"][0]
    assert "event_count_7d" in first_feat
    assert "event_count_30d" in first_feat
