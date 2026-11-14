"""System Health, Operational Metrics, and Reconciliation Endpoints."""
import os
import json
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import func

from database.db import BaseSession
from database.models import (
    Customer,
    Transaction,
    FeatureSnapshot,
    TrainingLabel,
    PipelineRun,
    RejectedRecord,
    utc_now,
)
from backend.schemas import (
    HealthResponse,
    SystemMetricsResponse,
    ReconciliationReportResponse,
)
from backend.config import settings
from backend.services.reconciliation import ReconciliationService

router = APIRouter()


def get_db():
    db = BaseSession()
    try:
        yield db
    finally:
        db.close()


@router.get("/health", response_model=HealthResponse)
def api_health(db: Session = Depends(get_db)):
    """Health check validating backend and database readiness."""
    try:
        # Simple connectivity probe
        db.execute(func.now() if not db.bind.url.drivername.startswith("sqlite") else func.datetime("now"))
        return {
            "status": "ok",
            "version": settings.VERSION,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "database": "connected",
        }
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Database connectivity failed: {str(e)}",
        )


@router.get("/metrics", response_model=SystemMetricsResponse)
def api_get_system_metrics(db: Session = Depends(get_db)):
    """Summary metrics across all operational stages."""
    total_cust = db.query(func.count(Customer.customer_id)).scalar() or 0
    total_tx = db.query(func.count(Transaction.transaction_id)).scalar() or 0
    total_feat = db.query(func.count(FeatureSnapshot.snapshot_id)).scalar() or 0
    total_lbl = db.query(func.count(TrainingLabel.label_id)).scalar() or 0
    total_rej = db.query(func.count(RejectedRecord.reject_id)).scalar() or 0

    total_runs = db.query(func.count(PipelineRun.run_id)).scalar() or 0
    success_runs = db.query(func.count(PipelineRun.run_id)).filter(PipelineRun.status == "success").scalar() or 0
    failed_runs = db.query(func.count(PipelineRun.run_id)).filter(PipelineRun.status == "failed").scalar() or 0

    avg_duration = (
        db.query(func.avg(PipelineRun.duration_seconds))
        .filter(PipelineRun.status == "success", PipelineRun.duration_seconds > 0)
        .scalar() or 0.0
    )

    last_run = db.query(PipelineRun).order_by(PipelineRun.start_time.desc()).first()
    last_run_time = last_run.start_time.isoformat() if last_run and last_run.start_time else None

    # Audit check
    recon = ReconciliationService(db)
    recon_report = recon.run_full_reconciliation(report_path=os.path.join(settings.REPORTS_DIR, "validation_report.json"))

    return {
        "total_customers": total_cust,
        "total_transactions": total_tx,
        "total_feature_snapshots": total_feat,
        "total_training_labels": total_lbl,
        "total_rejected_records": total_rej,
        "total_pipeline_runs": total_runs,
        "successful_runs": success_runs,
        "failed_runs": failed_runs,
        "avg_pipeline_duration_seconds": round(float(avg_duration), 3),
        "last_run_time": last_run_time,
        "reconciliation_status": recon_report["overall_status"],
    }


@router.get("/reports/reconciliation", response_model=ReconciliationReportResponse)
def api_get_reconciliation_report(db: Session = Depends(get_db)):
    """Retrieve the authoritative reconciliation report verifying balance equations."""
    report_file = os.path.join(settings.REPORTS_DIR, "validation_report.json")
    recon = ReconciliationService(db)
    report = recon.run_full_reconciliation(report_path=report_file)
    return report

