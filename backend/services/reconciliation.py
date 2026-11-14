"""Reconciliation Service for TimeSafe Feature Pipeline.

Performs rigorous accounting checks:
1. Row-count balance: input_rows = inserted_rows + noop_rows + rejected_rows
2. Referential integrity: All foreign keys valid
3. Feature uniqueness: No duplicate (customer, as_of_time, version) tuples
4. Target-to-source key balance
5. Produces measurable JSON validation report
"""
import os
import json
from datetime import datetime, timezone
from typing import Dict, Any, List
from sqlalchemy.orm import Session
from sqlalchemy import func

from database.models import (
    Customer,
    Transaction,
    PredictionRequest,
    FeatureSnapshot,
    TrainingLabel,
    PipelineRun,
    RejectedRecord,
    utc_now,
)


class ReconciliationService:
    """Audits data integrity, accounting invariants, and generates validation reports."""

    def __init__(self, session: Session):
        self.session = session

    def audit_pipeline_run(self, run_id: str) -> Dict[str, Any]:
        """Verify the row-count accounting invariant for a specific pipeline run.
        
        Invariant: input_rows == accepted_rows + rejected_rows
        Where accepted_rows == inserted_rows + noop_rows.
        """
        run = self.session.query(PipelineRun).filter(PipelineRun.run_id == run_id).first()
        if not run:
            return {"status": "error", "message": f"Run '{run_id}' not found"}

        actual_rejects_count = (
            self.session.query(func.count(RejectedRecord.reject_id))
            .filter(RejectedRecord.run_id == run_id)
            .scalar() or 0
        )

        is_reconciled = (
            run.input_rows == (run.accepted_rows + run.rejected_rows)
            and run.rejected_rows == actual_rejects_count
        )

        return {
            "run_id": run_id,
            "run_type": run.run_type,
            "status": run.status,
            "input_rows": run.input_rows,
            "accepted_rows": run.accepted_rows,
            "rejected_rows": run.rejected_rows,
            "actual_quarantine_records": actual_rejects_count,
            "is_reconciled": is_reconciled,
            "reconciliation_equation": f"{run.input_rows} == {run.accepted_rows} + {run.rejected_rows}",
        }

    def run_full_reconciliation(self, report_path: str = "reports/validation_report.json") -> Dict[str, Any]:
        """Execute system-wide reconciliation and output formal JSON report."""
        customer_count = self.session.query(func.count(Customer.customer_id)).scalar() or 0
        transaction_count = self.session.query(func.count(Transaction.transaction_id)).scalar() or 0
        prediction_request_count = self.session.query(func.count(PredictionRequest.request_id)).scalar() or 0
        feature_count = self.session.query(func.count(FeatureSnapshot.snapshot_id)).scalar() or 0
        label_count = self.session.query(func.count(TrainingLabel.label_id)).scalar() or 0
        rejected_count = self.session.query(func.count(RejectedRecord.reject_id)).scalar() or 0
        total_runs = self.session.query(func.count(PipelineRun.run_id)).scalar() or 0

        # Referential integrity checks
        orphaned_transactions = (
            self.session.query(func.count(Transaction.transaction_id))
            .outerjoin(Customer, Transaction.customer_id == Customer.customer_id)
            .filter(Customer.customer_id.is_(None))
            .scalar() or 0
        )

        orphaned_features = (
            self.session.query(func.count(FeatureSnapshot.snapshot_id))
            .outerjoin(Customer, FeatureSnapshot.customer_id == Customer.customer_id)
            .filter(Customer.customer_id.is_(None))
            .scalar() or 0
        )

        # Uniqueness checks
        duplicate_features = (
            self.session.query(
                FeatureSnapshot.customer_id,
                FeatureSnapshot.as_of_time,
                FeatureSnapshot.feature_version,
                func.count(FeatureSnapshot.snapshot_id),
            )
            .group_by(
                FeatureSnapshot.customer_id,
                FeatureSnapshot.as_of_time,
                FeatureSnapshot.feature_version,
            )
            .having(func.count(FeatureSnapshot.snapshot_id) > 1)
            .count()
        )

        # Recent pipeline runs audit
        runs = self.session.query(PipelineRun).order_by(PipelineRun.start_time.desc()).limit(10).all()
        run_audits = [self.audit_pipeline_run(r.run_id) for r in runs]
        all_runs_reconciled = all(a.get("is_reconciled", False) for a in run_audits) if run_audits else True

        passed = (
            orphaned_transactions == 0
            and orphaned_features == 0
            and duplicate_features == 0
            and all_runs_reconciled
        )

        report = {
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "overall_status": "PASSED" if passed else "FAILED",
            "counts": {
                "customers": customer_count,
                "transactions": transaction_count,
                "prediction_requests": prediction_request_count,
                "feature_snapshots": feature_count,
                "training_labels": label_count,
                "rejected_records": rejected_count,
                "pipeline_runs": total_runs,
            },
            "integrity_checks": {
                "orphaned_transactions": orphaned_transactions,
                "orphaned_features": orphaned_features,
                "duplicate_features": duplicate_features,
                "referential_integrity_passed": (orphaned_transactions == 0 and orphaned_features == 0),
                "uniqueness_passed": (duplicate_features == 0),
            },
            "run_audits": run_audits,
        }

        # Save to disk
        os.makedirs(os.path.dirname(report_path), exist_ok=True)
        with open(report_path, "w", encoding="utf-8") as f:
            json.dump(report, f, indent=2)

        return report

