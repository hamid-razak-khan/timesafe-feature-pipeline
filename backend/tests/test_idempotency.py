"""Idempotency, Rerun Safety, and Constraint Integrity Tests."""
import os
import csv
import tempfile
import pytest
from datetime import datetime, timedelta, timezone
from backend.services.ingestion_service import IngestionService
from backend.services.feature_engineering import FeatureEngineeringService
from database.models import FeatureSnapshot, Transaction, RejectedRecord


def test_idempotent_feature_publishing(populated_test_db):
    """Running feature computation multiple times for same (customer, cutoff, version) never duplicates rows."""
    session, engine, _ = populated_test_db
    customer_id = "CUST_0001"
    cutoff = datetime(2026, 5, 31, 0, 0, 0, tzinfo=timezone.utc)

    # Insert a transaction
    tx = Transaction(
        transaction_id="TX_IDEMP_FEAT",
        customer_id=customer_id,
        event_time=cutoff - timedelta(days=2),
        available_at=cutoff - timedelta(days=2),
        amount=120.00,
        transaction_type="purchase",
        source_file="tx.csv",
    )
    session.add(tx)
    session.commit()

    service = FeatureEngineeringService(session)

    # First run
    res1 = service.generate_features_for_request(customer_id, cutoff, feature_version="v1", publish=True)
    session.commit()

    count_1 = session.query(FeatureSnapshot).filter(
        FeatureSnapshot.customer_id == customer_id,
        FeatureSnapshot.as_of_time == cutoff,
        FeatureSnapshot.feature_version == "v1",
    ).count()
    assert count_1 == 1

    # Second run (exact rerun)
    res2 = service.generate_features_for_request(customer_id, cutoff, feature_version="v1", publish=True)
    session.commit()

    count_2 = session.query(FeatureSnapshot).filter(
        FeatureSnapshot.customer_id == customer_id,
        FeatureSnapshot.as_of_time == cutoff,
        FeatureSnapshot.feature_version == "v1",
    ).count()
    # Still exactly 1 row! No duplicate created
    assert count_2 == 1
    assert res1["txn_count_7d"] == res2["txn_count_7d"] == 1
    assert res1["total_purchase_amount_30d"] == res2["total_purchase_amount_30d"] == 120.0


def test_repeated_csv_ingestion_safety(populated_test_db):
    """Repeated execution on identical files leaves the database unchanged with 0 duplicate rows."""
    session, engine, _ = populated_test_db
    ingestion = IngestionService(session)

    with tempfile.NamedTemporaryFile("w", suffix=".csv", delete=False, newline="") as f:
        writer = csv.DictWriter(
            f,
            fieldnames=["transaction_id", "customer_id", "event_time", "available_at", "amount", "transaction_type", "source_file"]
        )
        writer.writeheader()
        for i in range(1, 6):
            writer.writerow({
                "transaction_id": f"TX_REPEAT_{i}",
                "customer_id": "CUST_0001",
                "event_time": f"2026-03-0{i}T10:00:00Z",
                "available_at": f"2026-03-0{i}T10:05:00Z",
                "amount": f"{i * 10}.00",
                "transaction_type": "purchase",
                "source_file": "repeat_test.csv",
            })
        tmp_path = f.name

    try:
        # Run 1: initial ingestion
        r1 = ingestion.ingest_transactions(tmp_path)
        assert r1["inserted_rows"] == 5
        assert r1["noop_rows"] == 0

        # Run 2: exact re-ingest
        r2 = ingestion.ingest_transactions(tmp_path)
        assert r2["inserted_rows"] == 0
        assert r2["noop_rows"] == 5
        assert r2["rejected_rows"] == 0

        # Run 3: third re-ingest
        r3 = ingestion.ingest_transactions(tmp_path)
        assert r3["inserted_rows"] == 0
        assert r3["noop_rows"] == 5

        # Verify physical row count in transactions table
        total_in_db = session.query(Transaction).filter(Transaction.transaction_id.like("TX_REPEAT_%")).count()
        assert total_in_db == 5
    finally:
        if os.path.exists(tmp_path):
            os.remove(tmp_path)
