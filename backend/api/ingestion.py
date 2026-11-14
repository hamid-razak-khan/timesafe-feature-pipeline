"""Data Ingestion and Synthetic Generation Endpoints."""
import csv
import io
import os
import shutil
from typing import Optional, List, Union, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Query, status
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from database.db import BaseSession
from database.models import RejectedRecord
from backend.schemas import (
    GenerateDataRequest,
    GenerateDataResponse,
    IngestResponse,
    RejectedRecordItem,
    PaginatedRejectsResponse,
    RejectsFilterOptionsResponse,
)
from backend.config import settings
from backend.services.ingestion_service import IngestionService
from backend.services.history_service import HistoryService
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


@router.get("/rejects/filter-options", response_model=RejectsFilterOptionsResponse)
def api_get_rejects_filter_options(db: Session = Depends(get_db)):
    """Retrieve dynamic filter choices based on existing quarantined records in the database."""
    service = HistoryService(db)
    return service.get_quarantine_filter_options()


@router.get("/rejects/export")
def api_export_quarantine_records(
    source_file: Optional[str] = Query(None, description="Filter by original source file"),
    rejection_reason: Optional[str] = Query(None, description="Filter by rejection reason/code"),
    reason: Optional[str] = Query(None, description="Alias for rejection_reason"),
    status: Optional[str] = Query(None, description="Filter by resolution status"),
    run_id: Optional[str] = Query(None, description="Filter by pipeline run ID"),
    dataset_id: Optional[str] = Query(None, description="Filter by dataset ID"),
    start_date: Optional[str] = Query(None, description="ISO or YYYY-MM-DD start date (UTC)"),
    end_date: Optional[str] = Query(None, description="ISO or YYYY-MM-DD end date (UTC)"),
    search: Optional[str] = Query(None, description="Search across ID, row, or message"),
    sort: Optional[str] = Query("newest", description="Sort order: newest or oldest"),
    db: Session = Depends(get_db),
):
    """Export all quarantined records matching active filters as a downloadable CSV."""
    service = HistoryService(db)
    res = service.get_quarantine_records(
        source_file=source_file,
        rejection_reason=rejection_reason or reason,
        status_filter=status,
        run_id=run_id,
        dataset_id=dataset_id,
        start_date=start_date,
        end_date=end_date,
        search=search,
        sort_order=sort or "newest",
        page=1,
        page_size=50000,
        limit=50000,
    )

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "reject_id",
        "source_file",
        "source_row_number",
        "record_id",
        "entity_id",
        "rejection_reason",
        "error_category",
        "error_title",
        "resolution_status",
        "run_id",
        "rejected_at",
        "resolved_at",
        "raw_record",
    ])

    for r in res["records"]:
        writer.writerow([
            r.get("reject_id"),
            r.get("source_file"),
            r.get("source_row_number"),
            r.get("record_id") or "",
            r.get("entity_id") or "",
            r.get("rejection_reason") or "",
            r.get("error_category") or "",
            r.get("error_title") or "",
            r.get("resolution_status") or "unresolved",
            r.get("run_id") or "",
            r.get("rejected_at") or "",
            r.get("resolved_at") or "",
            r.get("raw_record") or "",
        ])

    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=timesafe_quarantine_export.csv"},
    )


@router.get("/rejects", response_model=Union[PaginatedRejectsResponse, List[RejectedRecordItem]])
def api_get_rejected_records(
    source_file: Optional[str] = Query(None, description="Filter by original source file name"),
    rejection_reason: Optional[str] = Query(None, description="Filter by rejection reason/code"),
    reason: Optional[str] = Query(None, description="Alias for rejection_reason for backwards compatibility"),
    status: Optional[str] = Query(None, description="Filter by resolution status"),
    run_id: Optional[str] = Query(None, description="Filter by pipeline run ID"),
    dataset_id: Optional[str] = Query(None, description="Filter by dataset ID"),
    start_date: Optional[str] = Query(None, description="ISO or YYYY-MM-DD start date (UTC)"),
    end_date: Optional[str] = Query(None, description="ISO or YYYY-MM-DD end date (UTC)"),
    search: Optional[str] = Query(None, description="Search across reject ID, entity ID, record ID, row #, or error"),
    sort: Optional[str] = Query("newest", description="Sort order: newest or oldest"),
    page: Optional[int] = Query(None, ge=1, description="Page number (1-based) for server pagination"),
    page_size: Optional[int] = Query(None, ge=1, le=500, description="Items per page"),
    limit: Optional[int] = Query(100, ge=1, le=1000, description="Limit when not using page"),
    db: Session = Depends(get_db),
):
    """Retrieve quarantined defective records with multi-dimensional filtering, search, and pagination."""
    service = HistoryService(db)
    res = service.get_quarantine_records(
        source_file=source_file,
        rejection_reason=rejection_reason or reason,
        status_filter=status,
        run_id=run_id,
        dataset_id=dataset_id,
        start_date=start_date,
        end_date=end_date,
        search=search,
        sort_order=sort or "newest",
        page=page,
        page_size=page_size,
        limit=limit,
    )

    if page is not None:
        return res
    # Backwards-compatible raw list return when page parameter is omitted
    return res["records"]

