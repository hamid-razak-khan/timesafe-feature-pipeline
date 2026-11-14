"""Integration Tests for Ingestion Service and Pipeline Runs."""
import os
import csv
import tempfile
import pytest
from datetime import datetime, timezone
from backend.services.ingestion_service import IngestionService
from database.models import Customer, Transaction, PipelineRun, RejectedRecord
from scripts.generate_data import generate_datasets


def test_deterministic_data_generator():
    """Verify random seed 42 produces identical hashes and counts."""
    with tempfile.TemporaryDirectory() as tmpdir1, tempfile.TemporaryDirectory() as tmpdir2:
        res1 = generate_datasets(num_customers=10, num_transactions=20, output_dir=tmpdir1, seed=42)
        res2 = generate_datasets(num_customers=10, num_transactions=20, output_dir=tmpdir2, seed=42)

        assert res1["hashes"]["customers"] == res2["hashes"]["customers"]
        assert res1["hashes"]["transactions"] == res2["hashes"]["transactions"]
        assert res1["hashes"]["prediction_requests"] == res2["hashes"]["prediction_requests"]
        assert res1["transactions_count"] == res2["transactions_count"]


def test_ingest_customers_happy_path(test_db):
    session, engine, _ = test_db
    ingestion = IngestionService(session)

    with tempfile.NamedTemporaryFile("w", suffix=".csv", delete=False, newline="") as f:
        writer = csv.DictWriter(f, fieldnames=["customer_id", "created_at", "customer_segment"])
        writer.writeheader()
        writer.writerow({"customer_id": "C_1", "created_at": "2026-01-01T00:00:00Z", "customer_segment": "vip"})
        writer.writerow({"customer_id": "C_2", "created_at": "2026-01-05T00:00:00Z", "customer_segment": "regular"})
        tmp_path = f.name

    try:
        res = ingestion.ingest_customers(tmp_path)
        assert res["status"] == "success"
        assert res["inserted_rows"] == 2
        assert res["rejected_rows"] == 0

        customers = session.query(Customer).all()
        assert len(customers) == 2
    finally:
        if os.path.exists(tmp_path):
            os.remove(tmp_path)


def test_ingest_empty_csv(test_db):
    session, engine, _ = test_db
    ingestion = IngestionService(session)

    with tempfile.NamedTemporaryFile("w", suffix=".csv", delete=False, newline="") as f:
        # completely empty
        tmp_path = f.name

    try:
        res = ingestion.ingest_customers(tmp_path)
        assert res["status"] == "success"
        assert res["input_rows"] == 0
        assert res["inserted_rows"] == 0
    finally:
        if os.path.exists(tmp_path):
            os.remove(tmp_path)


def test_ingest_missing_columns_fails_gracefully(test_db):
    session, engine, _ = test_db
    ingestion = IngestionService(session)

    with tempfile.NamedTemporaryFile("w", suffix=".csv", delete=False, newline="") as f:
        writer = csv.DictWriter(f, fieldnames=["customer_id"])  # missing created_at
        writer.writeheader()
        writer.writerow({"customer_id": "C_1"})
        tmp_path = f.name

    try:
        res = ingestion.ingest_customers(tmp_path)
        assert res["status"] == "failed"
        assert "MISSING_REQUIRED_COLUMNS" in res["error"]
    finally:
        if os.path.exists(tmp_path):
            os.remove(tmp_path)


def test_ingest_transactions_with_rejections(populated_test_db):
    session, engine, _ = populated_test_db
    ingestion = IngestionService(session)

    with tempfile.NamedTemporaryFile("w", suffix=".csv", delete=False, newline="") as f:
        writer = csv.DictWriter(
            f,
            fieldnames=["transaction_id", "customer_id", "event_time", "available_at", "amount", "transaction_type", "source_file"]
        )
        writer.writeheader()
        # Valid row
        writer.writerow({
            "transaction_id": "TX_VALID_1",
            "customer_id": "CUST_0001",
            "event_time": "2026-02-10T12:00:00Z",
            "available_at": "2026-02-10T12:05:00Z",
            "amount": "80.00",
            "transaction_type": "purchase",
            "source_file": "tx_test.csv",
        })
        # Invalid row: negative amount
        writer.writerow({
            "transaction_id": "TX_INVALID_NEG",
            "customer_id": "CUST_0001",
            "event_time": "2026-02-10T12:00:00Z",
            "available_at": "2026-02-10T12:05:00Z",
            "amount": "-50.00",
            "transaction_type": "purchase",
            "source_file": "tx_test.csv",
        })
        # Invalid row: unknown customer
        writer.writerow({
            "transaction_id": "TX_INVALID_FK",
            "customer_id": "CUST_NON_EXISTENT",
            "event_time": "2026-02-10T12:00:00Z",
            "available_at": "2026-02-10T12:05:00Z",
            "amount": "100.00",
            "transaction_type": "purchase",
            "source_file": "tx_test.csv",
        })
        tmp_path = f.name

    try:
        res = ingestion.ingest_transactions(tmp_path)
        assert res["status"] == "success"
        assert res["input_rows"] == 3
        assert res["inserted_rows"] == 1
        assert res["rejected_rows"] == 2

        # Verify operational logs
        rejects = session.query(RejectedRecord).filter(RejectedRecord.run_id == res["run_id"]).all()
        assert len(rejects) == 2
        rejection_reasons = [r.rejection_reason for r in rejects]
        assert any("NEGATIVE_AMOUNT" in r for r in rejection_reasons)
        assert any("FOREIGN_KEY_VIOLATION" in r for r in rejection_reasons)
    finally:
        if os.path.exists(tmp_path):
            os.remove(tmp_path)


def test_ingest_transactions_idempotency_noop_and_conflicts(populated_test_db):
    session, engine, _ = populated_test_db
    ingestion = IngestionService(session)

    # 1. Ingest initial valid transaction
    with tempfile.NamedTemporaryFile("w", suffix=".csv", delete=False, newline="") as f:
        writer = csv.DictWriter(
            f,
            fieldnames=["transaction_id", "customer_id", "event_time", "available_at", "amount", "transaction_type", "source_file"]
        )
        writer.writeheader()
        writer.writerow({
            "transaction_id": "TX_IDEMP_1",
            "customer_id": "CUST_0001",
            "event_time": "2026-02-15T10:00:00Z",
            "available_at": "2026-02-15T10:05:00Z",
            "amount": "100.00",
            "transaction_type": "purchase",
            "source_file": "batch_1.csv",
        })
        batch1_path = f.name

    res1 = ingestion.ingest_transactions(batch1_path)
    assert res1["inserted_rows"] == 1

    # 2. Re-ingest the exact same file -> must be 100% NO-OP
    res2 = ingestion.ingest_transactions(batch1_path)
    assert res2["inserted_rows"] == 0
    assert res2["noop_rows"] == 1
    assert res2["rejected_rows"] == 0

    # 3. Ingest conflicting record with the SAME transaction_id but DIFFERENT amount -> Quarantined
    with tempfile.NamedTemporaryFile("w", suffix=".csv", delete=False, newline="") as f:
        writer = csv.DictWriter(
            f,
            fieldnames=["transaction_id", "customer_id", "event_time", "available_at", "amount", "transaction_type", "source_file"]
        )
        writer.writeheader()
        writer.writerow({
            "transaction_id": "TX_IDEMP_1",
            "customer_id": "CUST_0001",
            "event_time": "2026-02-15T10:00:00Z",
            "available_at": "2026-02-15T10:05:00Z",
            "amount": "999.00",  # Conflicting amount!
            "transaction_type": "purchase",
            "source_file": "batch_conflict.csv",
        })
        batch_conflict_path = f.name

    res3 = ingestion.ingest_transactions(batch_conflict_path)
    assert res3["inserted_rows"] == 0
    assert res3["rejected_rows"] == 1
    # Verify rejection reason
    rejects = session.query(RejectedRecord).filter(RejectedRecord.run_id == res3["run_id"]).all()
    assert "CONFLICTING_PRIMARY_KEY" in rejects[0].rejection_reason

    # Clean up
    for p in (batch1_path, batch_conflict_path):
        if os.path.exists(p):
            os.remove(p)

