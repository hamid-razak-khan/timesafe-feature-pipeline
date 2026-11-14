"""Pipeline Run and Execution Telemetry Endpoints."""
import os
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from database.db import BaseSession
from database.models import PipelineRun
from backend.schemas import (
    TriggerPipelineRequest,
    TriggerPipelineResponse,
    PipelineRunItem,
)
from backend.config import settings
from backend.services.pipeline_runner import PipelineRunner

router = APIRouter()


def get_db():
    db = BaseSession()
    try:
        yield db
    finally:
        db.close()


@router.post("/pipeline/run", response_model=TriggerPipelineResponse)
def api_trigger_pipeline(
    req: Optional[TriggerPipelineRequest] = None,
    db: Session = Depends(get_db),
):
    """Trigger synchronous execution of the full TimeSafe feature pipeline."""
    req = req or TriggerPipelineRequest()

    cust_path = req.customers_path or os.path.join(settings.RAW_DATA_DIR, "customers.csv")
    tx_path = req.transactions_path or os.path.join(settings.RAW_DATA_DIR, "transactions.csv")
    pred_path = req.predictions_path or os.path.join(settings.RAW_DATA_DIR, "prediction_requests.csv")
    report_path = os.path.join(settings.REPORTS_DIR, "validation_report.json")

    # Verify input availability
    for p in (cust_path, tx_path, pred_path):
        if not os.path.exists(p):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Required input CSV not found at '{p}'. Generate data first.",
            )

    runner = PipelineRunner(db)
    try:
        summary = runner.run_full_pipeline(
            customers_path=cust_path,
            transactions_path=tx_path,
            predictions_path=pred_path,
            feature_version=req.feature_version,
            label_version=req.label_version,
            report_path=report_path,
        )
        return {
            "status": summary["status"],
            "run_id": summary["run_id"],
            "duration_seconds": summary["duration_seconds"],
            "feature_snapshots_count": summary["feature_snapshots_count"],
            "training_labels_count": summary["training_labels_count"],
            "overall_status": summary["reconciliation_report"]["overall_status"],
        }
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Pipeline execution encountered an error: {str(e)}",
        )


@router.get("/pipeline/runs", response_model=List[PipelineRunItem])
def api_list_pipeline_runs(
    limit: int = 50,
    db: Session = Depends(get_db),
):
    """Retrieve history of all pipeline runs with operational counts."""
    runs = db.query(PipelineRun).order_by(PipelineRun.start_time.desc()).limit(limit).all()
    return [r.to_dict() for r in runs]


@router.get("/pipeline/runs/{run_id}", response_model=PipelineRunItem)
def api_get_pipeline_run(
    run_id: str,
    db: Session = Depends(get_db),
):
    """Retrieve operational telemetry and status for a specific pipeline run."""
    run = db.query(PipelineRun).filter(PipelineRun.run_id == run_id).first()
    if not run:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Pipeline run '{run_id}' not found.",
        )
    return run.to_dict()

