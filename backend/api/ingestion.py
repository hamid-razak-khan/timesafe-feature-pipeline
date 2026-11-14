"""Data Ingestion and Synthetic Generation Endpoints."""
import os
import shutil
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Query, status
from sqlalchemy.orm import Session

from database.db import BaseSession
from database.models import RejectedRecord
from backend.schemas import (
    GenerateDataRequest,
    GenerateDataResponse,
    IngestResponse,
    RejectedRecordItem,
)
from backend.config import settings
from backend.services.ingestion_service import IngestionService
from scripts.generate_data import generate_datasets

router = APIRouter()


def get_db():
    db = BaseSession()
    try:
        yield db
    finally:
        db.close()


@router.post("/generate-data", response_model=GenerateDataResponse)
def api_generate_data(req: GenerateDataRequest):
    """Generate reproducible synthetic datasets with random seed."""
    try:
        summary = generate_datasets(
            num_customers=req.customers,
            num_transactions=req.transactions,
            num_predictions=req.predictions,
            output_dir=settings.RAW_DATA_DIR,
            include_invalid=req.include_invalid,
            seed=req.seed,
        )
        return {
            "status": "success",
            "customers_count": summary["customers_count"],
            "transactions_count": summary["transactions_count"],
            "prediction_requests_count": summary["prediction_requests_count"],
            "output_dir": summary["output_dir"],
            "hashes": summary["hashes"],
        }
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Synthetic data generation failed: {str(e)}",
        )


@router.post("/ingest", response_model=IngestResponse)
async def api_ingest_file(
    file_type: str = Query(..., description="customers, transactions, or predictions"),
    file: Optional[UploadFile] = File(None),
    db: Session = Depends(get_db),
):
    """Ingest CSV file directly or upload a custom CSV."""
    ingestion = IngestionService(db)
    target_path = None

    if file:
        # Validate filename and extension
        if not file.filename.endswith(".csv"):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Only CSV files are supported.",
            )
        # Safe storage path avoiding path traversal
        clean_filename = os.path.basename(file.filename)
        target_path = os.path.join(settings.RAW_DATA_DIR, f"upload_{clean_filename}")
        os.makedirs(settings.RAW_DATA_DIR, exist_ok=True)
        with open(target_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
    else:
        if file_type == "customers":
            target_path = os.path.join(settings.RAW_DATA_DIR, "customers.csv")
        elif file_type == "transactions":
            target_path = os.path.join(settings.RAW_DATA_DIR, "transactions.csv")
        elif file_type in ("predictions", "prediction_requests"):
            target_path = os.path.join(settings.RAW_DATA_DIR, "prediction_requests.csv")
        else:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid file_type '{file_type}'. Must be customers, transactions, or predictions.",
            )

    if not os.path.exists(target_path):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Source file not found at {target_path}. Generate data first.",
        )

    try:
        if file_type == "customers":
            res = ingestion.ingest_customers(target_path)
        elif file_type == "transactions":
            res = ingestion.ingest_transactions(target_path)
        else:
            res = ingestion.ingest_prediction_requests(target_path)

        if res.get("status") == "failed":
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=res.get("error", "Validation or schema failure"),
            )

        return res
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Ingestion processing error: {str(e)}",
        )


@router.get("/rejects", response_model=List[RejectedRecordItem])
def api_get_rejected_records(
    run_id: Optional[str] = None,
    reason: Optional[str] = None,
    limit: int = Query(100, ge=1, le=1000),
    db: Session = Depends(get_db),
):
    """Retrieve quarantined defective records with lineage and rejection reasons."""
    query = db.query(RejectedRecord)
    if run_id:
        query = query.filter(RejectedRecord.run_id == run_id)
    if reason:
        query = query.filter(RejectedRecord.rejection_reason.ilike(f"%{reason}%"))

    records = query.order_by(RejectedRecord.rejected_at.desc()).limit(limit).all()
    return [r.to_dict() for r in records]
