"""Tests for History, Observability, and Safe Reprocessing with Anti-Leakage."""
import json
import uuid
from datetime import datetime, timezone, timedelta
from decimal import Decimal
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from database.models import (
    Base,
    Customer,
    Transaction,
    FeatureSnapshot,
    PipelineRun,
    RejectedRecord,
    SourceRecordHistory,
    RecordCorrection,
    RecordProcessingEvent,
    utc_now,
)
from backend.main import app
from backend.services.history_service import HistoryService, map_error_to_metadata

client = TestClient(app)


def test_error_mapping_catalog():
    """Verify human-friendly error mapping returns intelligible titles and categories."""
    title, cat, desc, fix = map_error_to_metadata("NEGATIVE_AMOUNT: Amount -50.00 is invalid")
    assert title == "Negative Transaction Amount"
    assert cat == "Negative Values"
    assert "positive decimal" in desc

    title, cat, desc, fix = map_error_to_metadata("AVAILABLE_PREDATES_EVENT: 2026-01-01 < 2026-01-02")
    assert title == "Availability Precedes Event Date"
    assert cat == "Invalid Timestamps"

    title, cat, desc, fix = map_error_to_metadata("NULL_OR_EMPTY_ENTITY_ID")
    assert title == "Missing Entity ID"
    assert cat == "Missing Required Fields"


def test_validate_record_payload_rules():
    """Test dry-run validation with negative amounts, missing IDs, and causality issues."""
    # 1. Negative amount
    res = HistoryService.validate_record_payload({
        "customer_id": "CUST_999",
        "transaction_id": "TX_999",
        "amount": -25.50,
        "event_time": "2026-03-01T12:00:00Z",
        "available_at": "2026-03-01T12:05:00Z",
    })
    assert not res["is_valid"]
    assert "amount" in res["errors"]
    assert "negative" in res["errors"]["amount"].lower()

    # 2. Availability precedes event
    res2 = HistoryService.validate_record_payload({
        "customer_id": "CUST_999",
        "transaction_id": "TX_999",
        "amount": 50.00,
        "event_time": "2026-03-05T12:00:00Z",
        "available_at": "2026-03-01T12:00:00Z",
    })
    assert not res2["is_valid"]
    assert "available_at" in res2["errors"]

    # 3. Missing customer ID
    res3 = HistoryService.validate_record_payload({
        "customer_id": "",
        "transaction_id": "TX_999",
        "amount": 50.00,
        "event_time": "2026-03-01T12:00:00Z",
    })
    assert not res3["is_valid"]
    assert "entity_id" in res3["errors"]

    # 4. Valid payload
    res4 = HistoryService.validate_record_payload({
        "customer_id": "CUST_999",
        "transaction_id": "TX_999",
        "amount": "129.99",
        "event_time": "2026-03-01T12:00:00Z",
        "available_at": "2026-03-01T12:05:00Z",
        "transaction_type": "purchase",
    })
    assert res4["is_valid"]
    assert len(res4["errors"]) == 0
    assert res4["normalized_payload"]["amount"] == 129.99


def test_dashboard_summary_api():
    """Verify GET /api/dashboard/summary returns full executive cards and timeline."""
    response = client.get("/api/dashboard/summary")
    assert response.status_code == 200
    data = response.json()
    assert "total_records_processed" in data
    assert "accepted_records" in data
    assert "rejected_records" in data
    assert "rejection_rate_percent" in data
    assert "generated_ml_features" in data
    assert "needs_attention_count" in data
    assert "accepted_vs_rejected" in data
    assert "activity_timeline" in data
    assert "recent_activity" in data
    assert "datasets_processed" in data
    assert "valid_records" in data
    assert "feature_snapshots_generated" in data
    assert isinstance(data["rejection_reasons_summary"], list)


def test_dashboard_activity_api():
    """Verify GET /api/dashboard/activity returns daily timeline and recent runs."""
    response = client.get("/api/dashboard/activity")
    assert response.status_code == 200
    data = response.json()
    assert "daily_timeline" in data
    assert "recent_runs" in data
    assert isinstance(data["daily_timeline"], list)
    assert isinstance(data["recent_runs"], list)


def test_dashboard_data_quality_api():
    """Verify GET /api/dashboard/data-quality returns categorization and integrity status."""
    response = client.get("/api/dashboard/data-quality")
    assert response.status_code == 200
    data = response.json()
    assert "total_quarantined" in data
    assert "unresolved_count" in data
    assert "category_breakdown" in data
    assert "integrity_status" in data


def test_dashboard_recent_runs_api():
    """Verify GET /api/dashboard/recent-runs returns executions with row accounting."""
    response = client.get("/api/dashboard/recent-runs?limit=5")
    assert response.status_code == 200
    data = response.json()
    assert "total" in data
    assert "runs" in data
    assert isinstance(data["runs"], list)


def test_record_history_api():
    """Verify GET /api/history/records supports pagination and filtering."""
    response = client.get("/api/history/records?limit=10&page=1")
    assert response.status_code == 200
    data = response.json()
    assert "total" in data
    assert "records" in data
    assert "filter_options" in data
    assert len(data["records"]) <= 10


def test_processing_history_runs_api():
    """Verify GET /api/history/runs returns structured run items with friendly names."""
    response = client.get("/api/history/runs?limit=10")
    assert response.status_code == 200
    data = response.json()
    assert "total" in data
    assert "runs" in data
    if data["runs"]:
        first = data["runs"][0]
        assert "run_id" in first
        assert "friendly_type" in first
        assert "status_badge" in first


def test_dry_run_validation_api():
    """Test POST /api/rejects/{reject_id}/validate via API endpoint."""
    response = client.post(
        "/api/rejects/REJ_SAMPLE_TEST/validate",
        json={
            "customer_id": "CUST_VAL_TEST",
            "transaction_id": "TX_VAL_TEST",
            "amount": -99.00,
            "event_time": "2026-03-01T10:00:00Z",
        },
    )
    assert response.status_code == 200
    data = response.json()
    assert not data["is_valid"]
    assert "amount" in data["errors"]


def test_safe_reprocess_flow_and_anti_leakage():
    """
    Test end-to-end safe reprocessing:
    1. Seed a quarantined rejected record.
    2. Ensure original reject row is NOT deleted (audit immutability).
    3. Reprocess with corrected payload.
    4. Assert effective_available_at >= now (anti-leakage proof).
    5. Assert transaction is queryable in operational store.
    6. Verify reject resolution_status is 'reprocessed'.
    """
    from database.db import BaseSession

    db = BaseSession()
    unique_tx = f"TX_REPROC_{uuid.uuid4().hex[:8]}"
    unique_rej = f"REJ_TEST_{uuid.uuid4().hex[:8]}"
    cust_id = f"CUST_{uuid.uuid4().hex[:6]}"

    # 1. Create a dummy run and reject
    run = PipelineRun(
        run_id=f"RUN_{uuid.uuid4().hex[:8]}",
        run_type="ingest_transactions",
        source_file="test_raw.csv",
        status="success",
        start_time=utc_now(),
        end_time=utc_now(),
        input_rows=1,
        accepted_rows=0,
        rejected_rows=1,
        duration_seconds=0.01,
    )
    db.add(run)
    db.commit()

    raw_payload = json.dumps({
        "transaction_id": unique_tx,
        "customer_id": cust_id,
        "amount": -75.00,
        "event_time": "2026-02-01T10:00:00Z",
        "available_at": "2026-02-01T10:05:00Z",
        "transaction_type": "purchase",
    })

    reject = RejectedRecord(
        reject_id=unique_rej,
        run_id=run.run_id,
        source_file="test_raw.csv",
        source_row_number=1,
        raw_record=raw_payload,
        rejection_reason="NEGATIVE_AMOUNT: -75.00",
        resolution_status="unresolved",
        rejected_at=utc_now(),
    )
    db.add(reject)
    db.commit()

    # 2. Call reprocess API with corrected positive amount
    before_reprocess = utc_now()
    response = client.post(
        f"/api/rejects/{unique_rej}/reprocess",
        json={
            "corrected_payload": {
                "transaction_id": unique_tx,
                "customer_id": cust_id,
                "amount": 75.00,
                "event_time": "2026-02-01T10:00:00Z",
                "available_at": "2026-02-01T10:05:00Z",
                "transaction_type": "purchase",
            },
            "correction_reason": "Corrected sign error from input POS",
        },
    )
    assert response.status_code == 200, response.text
    result = response.json()
    assert result["status"] == "success"

    # 3. Verify Anti-Leakage: effective_available_at MUST be >= now
    eff_avail = datetime.fromisoformat(result["effective_available_at"].replace("Z", "+00:00"))
    assert eff_avail >= before_reprocess - timedelta(seconds=2)
    # The original event was in Feb 2026, but availability was updated to NOW
    orig_event = datetime.fromisoformat("2026-02-01T10:00:00+00:00")
    assert eff_avail > orig_event

    # 4. Verify operational database state
    db.expire_all()
    tx_in_db = db.query(Transaction).filter(Transaction.transaction_id == unique_tx).first()
    assert tx_in_db is not None
    assert tx_in_db.amount == Decimal("75.00")

    # 5. Verify Original Reject was NOT deleted (immutability preserved)
    reject_in_db = db.query(RejectedRecord).filter(RejectedRecord.reject_id == unique_rej).first()
    assert reject_in_db is not None
    assert reject_in_db.resolution_status == "reprocessed"
    assert reject_in_db.resolved_at is not None

    # 6. Verify idempotency: calling reprocess again returns already_processed
    response_repeat = client.post(
        f"/api/rejects/{unique_rej}/reprocess",
        json={
            "corrected_payload": {
                "transaction_id": unique_tx,
                "customer_id": cust_id,
                "amount": 75.00,
                "event_time": "2026-02-01T10:00:00Z",
                "available_at": "2026-02-01T10:05:00Z",
                "transaction_type": "purchase",
            },
            "correction_reason": "Repeat test",
        },
    )
    assert response_repeat.status_code == 200
    assert response_repeat.json()["status"] == "already_processed"

    db.close()

