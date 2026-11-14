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


def test_multi_event_aggregation_per_entity_generic_dataset():
    """Verify that 18 events across 3 unique entities aggregate into exactly 3 feature snapshots."""
    cutoff = datetime(2026, 5, 20, 0, 0, 0, tzinfo=timezone.utc)
    records = []
    # Create 6 events per entity (3 entities = 18 events)
    entities = ["ENT_ALPHA", "ENT_BETA", "ENT_GAMMA"]
    evt_num = 1
    for ent in entities:
        for day in range(1, 7):
            records.append({
                "event_id": f"EVT_{evt_num:03d}",
                "entity_id": ent,
                "event_time": (cutoff - timedelta(days=day)).isoformat(),
                "available_at": (cutoff - timedelta(days=day, minutes=-15)).isoformat(),
                "amount": "50.00",
                "event_type": "status_check",
            })
            evt_num += 1

    assert len(records) == 18

    col_map = {
        "event_id": "event_id",
        "entity_id": "entity_id",
        "event_time": "event_time",
        "available_at": "available_at",
        "amount": "amount",
        "event_type": "event_type",
    }

    results = compute_generic_dataset_features(
        records=records,
        column_mapping=col_map,
        cutoff_time=cutoff,
    )

    # Must aggregate strictly to 3 entity snapshots, NOT 18 event snapshots
    assert len(results) == 3
    result_entities = [r["entity_id"] for r in results]
    assert sorted(result_entities) == sorted(entities)

    for r in results:
        # All 6 events are within 7d
        assert r["event_count_7d"] == 6
        assert r["event_count_30d"] == 6
        assert r["total_amount_30d"] == 300.0
        assert r["avg_amount_30d"] == 50.0


def test_auto_mapping_distinguishes_event_id_and_entity_id(client):
    """Ensure auto-mapping heuristic never misassigns event_id as entity_id."""
    csv_content = (
        "event_id,entity_id,event_time,available_at,amount,event_type\n"
        "EVT_001,ENT_100,2026-05-10T12:00:00Z,2026-05-10T12:05:00Z,99.99,checkout\n"
        "EVT_002,ENT_100,2026-05-11T14:00:00Z,2026-05-11T14:10:00Z,45.00,checkout\n"
    )
    with tempfile.NamedTemporaryFile("w", suffix=".csv", delete=False) as f:
        f.write(csv_content)
        tmp_name = f.name

    try:
        with open(tmp_name, "rb") as f:
            res = client.post("/api/upload-preview", files={"file": ("events.csv", f, "text/csv")})
        assert res.status_code == 200
        mapping = res.json()["suggested_mapping"]
        # Crucial check: entity_id must map to entity_id, NOT event_id
        assert mapping["entity_id"] == "entity_id"
        assert mapping["event_id"] == "event_id"
        assert mapping["event_time"] == "event_time"
        assert mapping["available_at"] == "available_at"
        assert mapping["amount"] == "amount"
        assert mapping["event_type"] == "event_type"
    finally:
        if os.path.exists(tmp_name):
            os.remove(tmp_name)


def test_dataset_b_logistics_domain():
    """Verify point-in-time feature extraction on Dataset B: Logistics schema."""
    cutoff = datetime(2026, 6, 1, 0, 0, 0, tzinfo=timezone.utc)
    vehicle_id = "VEHICLE_TRUCK_42"

    logistics_records = [
        # Past eligible delivery event (within 7d)
        {
            "shipment_id": "SHIP_9001",
            "vehicle_id": vehicle_id,
            "event_timestamp": (cutoff - timedelta(days=3)).isoformat(),
            "received_at": (cutoff - timedelta(days=3, minutes=-30)).isoformat(),
            "distance_km": "120.5",
            "event_category": "delivery",
        },
        # Past eligible route event (within 30d, beyond 7d)
        {
            "shipment_id": "SHIP_9002",
            "vehicle_id": vehicle_id,
            "event_timestamp": (cutoff - timedelta(days=15)).isoformat(),
            "received_at": (cutoff - timedelta(days=15, minutes=-20)).isoformat(),
            "distance_km": "350.0",
            "event_category": "long_haul",
        },
        # Late-arriving event: occurred before cutoff but warehouse received after cutoff (leakage gate must exclude)
        {
            "shipment_id": "SHIP_9003",
            "vehicle_id": vehicle_id,
            "event_timestamp": (cutoff - timedelta(days=1)).isoformat(),
            "received_at": (cutoff + timedelta(hours=4)).isoformat(),
            "distance_km": "500.0",
            "event_category": "interstate",
        },
        # Future event: occurred after cutoff (must exclude)
        {
            "shipment_id": "SHIP_9004",
            "vehicle_id": vehicle_id,
            "event_timestamp": (cutoff + timedelta(days=2)).isoformat(),
            "received_at": (cutoff + timedelta(days=2)).isoformat(),
            "distance_km": "80.0",
            "event_category": "dispatch",
        },
    ]

    col_map = {
        "event_id": "shipment_id",
        "entity_id": "vehicle_id",
        "event_time": "event_timestamp",
        "available_at": "received_at",
        "amount": "distance_km",
        "event_type": "event_category",
    }

    features = compute_features(
        transactions=logistics_records,
        customer_id=vehicle_id,
        as_of_time=cutoff,
        column_mapping=col_map,
    )

    # SHIP_9001 included in 7d and 30d
    # SHIP_9002 included only in 30d
    # SHIP_9003 excluded by availability gate
    # SHIP_9004 excluded by event_time cutoff
    assert features["event_count_7d"] == 1
    assert features["event_count_30d"] == 2
    assert features["total_amount_30d"] == 470.5
    assert features["avg_amount_30d"] == 235.25
    assert features["days_since_last_event"] == 3.0


