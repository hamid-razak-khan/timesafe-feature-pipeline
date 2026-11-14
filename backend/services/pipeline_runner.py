"""Pipeline Runner and Orchestrator for TimeSafe Feature Pipeline.

Orchestrates sequential execution of:
1. Customer Ingestion
2. Transaction Ingestion & Quarantine
3. Prediction Request Ingestion
4. Point-in-Time Feature Calculation
5. Watermark-Gated Label Generation
6. Full Reconciliation Audit & Report Generation
"""
import os
import uuid
import logging
from datetime import datetime, timezone
from typing import Dict, Any, Optional
from sqlalchemy.orm import Session

from database.models import PipelineRun, utc_now, ensure_utc
from backend.services.ingestion_service import IngestionService
from backend.services.feature_engineering import FeatureEngineeringService
from backend.services.label_generation import LabelGenerationService
from backend.services.reconciliation import ReconciliationService

logger = logging.getLogger("timesafe.runner")


class PipelineRunner:
    """End-to-end orchestrator for TimeSafe batch processing."""

    def __init__(self, session: Session):
        self.session = session

    def run_full_pipeline(
        self,
        customers_path: str = "data/raw/customers.csv",
        transactions_path: str = "data/raw/transactions.csv",
        predictions_path: str = "data/raw/prediction_requests.csv",
        feature_version: str = "v1",
        label_version: str = "v1",
        report_path: str = "reports/validation_report.json",
    ) -> Dict[str, Any]:
        """Execute end-to-end batch pipeline with operational logging."""
        run_id = f"RUN_FULL_{datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')}_{uuid.uuid4().hex[:6]}"
        start_time = utc_now()

        master_run = PipelineRun(
            run_id=run_id,
            run_type="full_pipeline",
            source_file="batch_manifest",
            status="running",
            start_time=start_time,
            input_rows=0,
            accepted_rows=0,
            rejected_rows=0,
            feature_rows=0,
            duration_seconds=0.0,
        )
        self.session.add(master_run)
        self.session.commit()

        try:
            ingestion = IngestionService(self.session)
            feature_service = FeatureEngineeringService(self.session)
            label_service = LabelGenerationService(self.session)
            reconcile_service = ReconciliationService(self.session)

            # 1. Ingest Customers
            cust_res = ingestion.ingest_customers(customers_path)

            # 2. Ingest Transactions
            tx_res = ingestion.ingest_transactions(transactions_path)

            # 3. Ingest Prediction Requests
            pred_res = ingestion.ingest_prediction_requests(predictions_path)

            # 4. Compute and Publish Feature Snapshots
            features = feature_service.compute_all_prediction_features(feature_version=feature_version)

            # 5. Compute Training Labels
            labels = label_service.generate_all_labels(label_version=label_version)

            # 6. Audit & Reconciliation
            recon_report = reconcile_service.run_full_reconciliation(report_path=report_path)

            end_time = utc_now()
            start = ensure_utc(start_time) or start_time
            end = ensure_utc(end_time) or end_time
            duration = max(0.0, (end - start).total_seconds())

            total_input = cust_res.get("input_rows", 0) + tx_res.get("input_rows", 0) + pred_res.get("input_rows", 0)
            total_accepted = (
                cust_res.get("inserted_rows", 0) + cust_res.get("noop_rows", 0) +
                tx_res.get("inserted_rows", 0) + tx_res.get("noop_rows", 0) +
                pred_res.get("inserted_rows", 0) + pred_res.get("noop_rows", 0)
            )
            total_rejected = (
                cust_res.get("rejected_rows", 0) +
                tx_res.get("rejected_rows", 0) +
                pred_res.get("rejected_rows", 0)
            )

            master_run.status = "success"
            master_run.end_time = end_time
            master_run.duration_seconds = duration
            master_run.input_rows = total_input
            master_run.accepted_rows = total_accepted
            master_run.rejected_rows = total_rejected
            master_run.feature_rows = len(features)
            self.session.commit()

            return {
                "status": "success",
                "run_id": run_id,
                "duration_seconds": duration,
                "customers_summary": cust_res,
                "transactions_summary": tx_res,
                "predictions_summary": pred_res,
                "feature_snapshots_count": len(features),
                "training_labels_count": len(labels),
                "reconciliation_report": recon_report,
            }
        except Exception as e:
            self.session.rollback()
            master_run.status = "failed"
            master_run.end_time = utc_now()
            master_run.error_message = str(e)
            self.session.commit()
            raise
