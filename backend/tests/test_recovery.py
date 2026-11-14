"""Recovery, Partial Failure, and Reconciliation Accounting Tests."""
import os
import csv
import tempfile
import pytest
from datetime import datetime, timezone
from backend.services.ingestion_service import IngestionService
from backend.services.reconciliation import ReconciliationService
from backend.services.pipeline_runner import PipelineRunner
from database.models import PipelineRun, Transaction, RejectedRecord
from scripts.generate_data import generate_datasets


def test_reconciliation_accounting_equation(populated_test_db):
    """Verify input_rows = inserted_rows + noop_rows + rejected_rows holds strictly."""
    session, engine, _ = populated_test_db
    ingestion = IngestionService(session)
    reconciliation = ReconciliationService(session)

    # First insert a baseline record
    tx1 = Transaction(
        transaction_id="TX_RECON_PREEXISTING",
        customer_id="CUST_0001",
        event_time=datetime(2026, 2, 1, 10, 0, 0, tzinfo=timezone.utc),
        available_at=datetime(2026, 2, 1, 10, 5, 0, tzinfo=timezone.utc),
        amount=100.00,
        transaction_type="purchase",
        source_file="seed.csv",
    )
    session.add(tx1)
    session.commit()

    with tempfile.NamedTemporaryFile("w", suffix=".csv", delete=False, newline="") as f:
        writer = csv.DictWriter(
            f,
            fieldnames=["transaction_id", "customer_id", "event_time", "available_at", "amount", "transaction_type", "source_file"]
        )
        writer.writeheader()
        # Row 1: Brand new valid row -> INSERT
        writer.writerow({
            "transaction_id": "TX_RECON_NEW",
            "customer_id": "CUST_0001",
            "event_time": "2026-02-02T10:00:00Z",
            "available_at": "2026-02-02T10:05:00Z",
            "amount": "50.00",
            "transaction_type": "purchase",
            "source_file": "recon_test.csv",
        })
        # Row 2: Identical preexisting row -> NOOP
        writer.writerow({
            "transaction_id": "TX_RECON_PREEXISTING",
            "customer_id": "CUST_0001",
            "event_time": "2026-02-01T10:00:00Z",
            "available_at": "2026-02-01T10:05:00Z",
            "amount": "100.00",
            "transaction_type": "purchase",
            "source_file": "seed.csv",
        })
        # Row 3: Negative amount -> REJECT
        writer.writerow({
            "transaction_id": "TX_RECON_BAD_AMT",
            "customer_id": "CUST_0001",
            "event_time": "2026-02-03T10:00:00Z",
            "available_at": "2026-02-03T10:05:00Z",
            "amount": "-30.00",
            "transaction_type": "purchase",
            "source_file": "recon_test.csv",
        })
        # Row 4: Non-existent customer -> REJECT
        writer.writerow({
            "transaction_id": "TX_RECON_BAD_FK",
            "customer_id": "CUST_UNKNOWN",
            "event_time": "2026-02-04T10:00:00Z",
            "available_at": "2026-02-04T10:05:00Z",
            "amount": "80.00",
            "transaction_type": "purchase",
            "source_file": "recon_test.csv",
        })
        tmp_path = f.name

    try:
        res = ingestion.ingest_transactions(tmp_path)
        assert res["input_rows"] == 4
        assert res["inserted_rows"] == 1
        assert res["noop_rows"] == 1
        assert res["rejected_rows"] == 2
        # Exact balance verification
        assert res["input_rows"] == res["inserted_rows"] + res["noop_rows"] + res["rejected_rows"]

        # Run audit check
        audit = reconciliation.audit_pipeline_run(res["run_id"])
        assert audit["is_reconciled"] is True
        assert audit["actual_quarantine_records"] == 2
    finally:
        if os.path.exists(tmp_path):
            os.remove(tmp_path)


def test_partial_failure_rollback_and_retry(populated_test_db):
    """Simulate a failure midway through processing, verify rollback, and confirm clean retry."""
    session, engine, _ = populated_test_db

    class MockFailingIngestion(IngestionService):
        """Simulate unexpected crash during batch execution."""
        def ingest_transactions(self, file_path: str, run_id=None):
            run = self._create_pipeline_run("ingest_transactions", "fail_test.csv")
            # Insert 1 row then explode
            t = Transaction(
                transaction_id="TX_PARTIAL_1",
                customer_id="CUST_0001",
                event_time=datetime(2026, 2, 1, 0, 0, 0, tzinfo=timezone.utc),
                available_at=datetime(2026, 2, 1, 0, 5, 0, tzinfo=timezone.utc),
                amount=25.00,
                transaction_type="purchase",
                source_file="fail_test.csv",
            )
            self.session.add(t)
            self.session.flush()

            # Simulate unhandled exception / crash
            self.session.rollback()
            run_in_db = self.session.query(PipelineRun).filter(PipelineRun.run_id == run.run_id).first()
            if run_in_db:
                run_in_db.status = "failed"
                run_in_db.error_message = "Simulated Hardware/Network Crash"
                self.session.commit()
            raise RuntimeError("Simulated crash mid-pipeline")

    failing_service = MockFailingIngestion(session)

    # 1. Attempt run that fails
    with pytest.raises(RuntimeError):
        failing_service.ingest_transactions("dummy.csv")

    # Verify no partial dirty rows committed to transactions table
    partial_tx = session.query(Transaction).filter(Transaction.transaction_id == "TX_PARTIAL_1").first()
    assert partial_tx is None

    # Verify failed run record exists and is observable
    failed_run = session.query(PipelineRun).filter(PipelineRun.status == "failed").first()
    assert failed_run is not None
    assert "Simulated Hardware/Network Crash" in failed_run.error_message

    # 2. Retry with standard healthy service -> succeeds cleanly
    healthy_service = IngestionService(session)
    with tempfile.NamedTemporaryFile("w", suffix=".csv", delete=False, newline="") as f:
        writer = csv.DictWriter(
            f,
            fieldnames=["transaction_id", "customer_id", "event_time", "available_at", "amount", "transaction_type", "source_file"]
        )
        writer.writeheader()
        writer.writerow({
            "transaction_id": "TX_PARTIAL_1",
            "customer_id": "CUST_0001",
            "event_time": "2026-02-01T00:00:00Z",
            "available_at": "2026-02-01T00:05:00Z",
            "amount": "25.00",
            "transaction_type": "purchase",
            "source_file": "retry_test.csv",
        })
        tmp_path = f.name

    try:
        retry_res = healthy_service.ingest_transactions(tmp_path)
        assert retry_res["status"] == "success"
        assert retry_res["inserted_rows"] == 1
        committed_tx = session.query(Transaction).filter(Transaction.transaction_id == "TX_PARTIAL_1").first()
        assert committed_tx is not None
    finally:
        if os.path.exists(tmp_path):
            os.remove(tmp_path)
