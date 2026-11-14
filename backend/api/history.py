"""API Endpoints for Dashboard Metrics, Record History, and Safe Reprocessing."""
import csv
import io
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from database.db import BaseSession
from database.models import RejectedRecord
from backend.schemas import (
    DashboardSummaryResponse,
    DashboardActivityResponse,
    DashboardDataQualityResponse,
    DashboardRecentRunsResponse,
    RecordHistoryListResponse,
    RecordDetailResponse,
    ProcessingHistoryListResponse,
    ValidateCorrectionRequest,
    ValidateCorrectionResponse,
    SaveCorrectionRequest,
    RecordCorrectionItem,
    ReprocessRecordRequest,
    ReprocessRecordResponse,
)
from backend.services.history_service import HistoryService, map_error_to_metadata

router = APIRouter()


def get_db():
    db = BaseSession()
    try:
        yield db
    finally:
        db.close()


# 1. Dashboard Executive Summary & Sub-APIs
@router.get("/dashboard/filter-options")
def api_get_dashboard_filter_options(db: Session = Depends(get_db)):
    """Retrieve available dataset options, counts, and filter presets."""
    service = HistoryService(db)
    return service.get_dashboard_filter_options()


@router.get("/dashboard/summary", response_model=DashboardSummaryResponse)
def api_get_dashboard_summary(
    source_file: Optional[str] = Query(None, description="Filter by source file / dataset"),
    date_preset: Optional[str] = Query(None, description="Preset date range: all, today, 7d, 30d, custom"),
    start_date: Optional[str] = Query(None, description="Start date (ISO or YYYY-MM-DD)"),
    end_date: Optional[str] = Query(None, description="End date (ISO or YYYY-MM-DD)"),
    status: Optional[str] = Query("all", description="Run status filter: all, completed, warning, failed"),
    db: Session = Depends(get_db),
):
    """Retrieve top-level operational metrics, distributions, and recent activity with filter support."""
    service = HistoryService(db)
    return service.get_dashboard_summary(
        source_file=source_file,
        date_preset=date_preset,
        start_date=start_date,
        end_date=end_date,
        status_filter=status,
    )


@router.get("/dashboard/activity", response_model=DashboardActivityResponse)
def api_get_dashboard_activity(
    source_file: Optional[str] = Query(None, description="Filter by source file / dataset"),
    date_preset: Optional[str] = Query(None, description="Preset date range: all, today, 7d, 30d, custom"),
    start_date: Optional[str] = Query(None, description="Start date (ISO or YYYY-MM-DD)"),
    end_date: Optional[str] = Query(None, description="End date (ISO or YYYY-MM-DD)"),
    status: Optional[str] = Query("all", description="Run status filter: all, completed, warning, failed"),
    granularity: Optional[str] = Query("auto", description="Time aggregation granularity: auto, daily, hourly"),
    db: Session = Depends(get_db),
):
    """Retrieve detailed activity timelines and per-run breakdown without double counting."""
    service = HistoryService(db)
    return service.get_dashboard_activity(
        source_file=source_file,
        date_preset=date_preset,
        start_date=start_date,
        end_date=end_date,
        status_filter=status,
        granularity=granularity or "auto",
    )


@router.get("/dashboard/data-quality", response_model=DashboardDataQualityResponse)
def api_get_dashboard_data_quality(
    source_file: Optional[str] = Query(None, description="Filter by source file / dataset"),
    date_preset: Optional[str] = Query(None, description="Preset date range: all, today, 7d, 30d, custom"),
    start_date: Optional[str] = Query(None, description="Start date (ISO or YYYY-MM-DD)"),
    end_date: Optional[str] = Query(None, description="End date (ISO or YYYY-MM-DD)"),
    db: Session = Depends(get_db),
):
    """Retrieve detailed data quality distributions and category breakdowns with filter support."""
    service = HistoryService(db)
    return service.get_dashboard_data_quality(
        source_file=source_file,
        date_preset=date_preset,
        start_date=start_date,
        end_date=end_date,
    )


@router.get("/dashboard/recent-runs", response_model=DashboardRecentRunsResponse)
def api_get_dashboard_recent_runs(
    limit: int = Query(10, ge=1, le=50),
    source_file: Optional[str] = Query(None, description="Filter by source file / dataset"),
    date_preset: Optional[str] = Query(None, description="Preset date range: all, today, 7d, 30d, custom"),
    start_date: Optional[str] = Query(None, description="Start date (ISO or YYYY-MM-DD)"),
    end_date: Optional[str] = Query(None, description="End date (ISO or YYYY-MM-DD)"),
    status: Optional[str] = Query("all", description="Run status filter: all, completed, warning, failed"),
    db: Session = Depends(get_db),
):
    """Fetch latest pipeline execution runs with full row accounting and filter support."""
    service = HistoryService(db)
    return service.get_dashboard_recent_runs(
        limit=limit,
        source_file=source_file,
        date_preset=date_preset,
        start_date=start_date,
        end_date=end_date,
        status_filter=status,
    )


# 2. Record History
@router.get("/history/records", response_model=RecordHistoryListResponse)
def api_get_record_history(
    search: Optional[str] = Query(None, description="Search across record ID, entity ID, or reason"),
    source_file: Optional[str] = Query(None, description="Filter by source CSV file"),
    status: Optional[str] = Query("all", description="Filter by status: all, accepted, rejected, corrected, reprocessed"),
    error_category: Optional[str] = Query("all", description="Filter by error category"),
    start_date: Optional[str] = Query(None, description="ISO start date filter"),
    end_date: Optional[str] = Query(None, description="ISO end date filter"),
    page: int = Query(1, ge=1),
    limit: int = Query(25, ge=1, le=500),
    db: Session = Depends(get_db),
):
    """Retrieve paginated and filtered historical records audit log."""
    service = HistoryService(db)
    return service.get_record_history(
        search=search,
        source_file=source_file,
        status_filter=status,
        error_category=error_category,
        start_date=start_date,
        end_date=end_date,
        page=page,
        limit=limit,
    )


@router.get("/history/records/{history_id}", response_model=RecordDetailResponse)
def api_get_record_detail(
    history_id: str,
    db: Session = Depends(get_db),
):
    """Retrieve full audit detail, original payload, correction history, and lifecycle events."""
    service = HistoryService(db)
    detail = service.get_record_detail(history_id)
    if not detail:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Record history for '{history_id}' not found.",
        )
    return detail


# 3. Processing History (Runs)
@router.get("/history/runs", response_model=ProcessingHistoryListResponse)
def api_get_processing_history_runs(
    limit: int = Query(50, ge=1, le=200),
    status: Optional[str] = Query("all", description="Filter by status: all, success, warnings, failed"),
    search: Optional[str] = Query(None, description="Search by run ID or run type"),
    db: Session = Depends(get_db),
):
    """Retrieve execution runs with user-friendly descriptions and audit status."""
    service = HistoryService(db)
    runs = service.get_processing_history_runs(
        limit=limit,
        status_filter=status,
        search=search,
    )
    return {
        "total": len(runs),
        "runs": runs,
    }


# 4. CSV Export
@router.get("/history/export")
def api_export_record_history(
    search: Optional[str] = None,
    source_file: Optional[str] = None,
    status: Optional[str] = "all",
    error_category: Optional[str] = "all",
    db: Session = Depends(get_db),
):
    """Export filtered record history as a downloadable CSV."""
    service = HistoryService(db)
    res = service.get_record_history(
        search=search,
        source_file=source_file,
        status_filter=status,
        error_category=error_category,
        page=1,
        limit=10000,
    )

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "history_id",
        "record_id",
        "entity_id",
        "source_file",
        "source_row",
        "event_time",
        "available_at",
        "amount",
        "event_type",
        "status",
        "rejection_reason",
        "rejection_title",
        "rejection_category",
        "first_seen_at",
        "last_processed_at",
    ])

    for r in res["records"]:
        writer.writerow([
            r.get("history_id"),
            r.get("record_id"),
            r.get("entity_id") or "",
            r.get("source_file"),
            r.get("source_row_number"),
            r.get("event_time") or "",
            r.get("available_at") or "",
            r.get("amount") or "",
            r.get("event_type") or "",
            r.get("processing_status"),
            r.get("rejection_reason") or "",
            r.get("rejection_title") or "",
            r.get("rejection_category") or "",
            r.get("first_seen_at") or "",
            r.get("last_processed_at") or "",
        ])

    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=timesafe_record_history.csv"},
    )


# 5. Quarantine & Safe Reprocessing
@router.post("/rejects/{reject_id}/validate", response_model=ValidateCorrectionResponse)
def api_validate_reject_correction(
    reject_id: str,
    payload: ValidateCorrectionRequest,
):
    """Dry-run validation of a candidate corrected payload."""
    data = payload.model_dump(exclude_unset=True) if hasattr(payload, "model_dump") else payload.dict(exclude_unset=True)
    if payload.additional_fields:
        data.update(payload.additional_fields)
    
    validation = HistoryService.validate_record_payload(data)
    return validation


@router.post("/rejects/{reject_id}/corrections", response_model=RecordCorrectionItem)
def api_save_correction_draft(
    reject_id: str,
    payload: SaveCorrectionRequest,
    db: Session = Depends(get_db),
):
    """Save an editable correction draft version."""
    service = HistoryService(db)
    corr = service.save_correction_draft(
        reject_id=reject_id,
        corrected_payload=payload.corrected_payload,
        correction_reason=payload.correction_reason,
        resolved_by=payload.resolved_by,
    )
    return corr


@router.post("/rejects/{reject_id}/reprocess", response_model=ReprocessRecordResponse)
def api_reprocess_reject(
    reject_id: str,
    payload: ReprocessRecordRequest,
    db: Session = Depends(get_db),
):
    """
    Safely reprocess a rejected record into operational storage.
    Strictly enforces effective_available_at = max(available_at, current_utc_time).
    """
    service = HistoryService(db)
    res = service.reprocess_rejected_record(
        reject_id=reject_id,
        corrected_payload=payload.corrected_payload,
        correction_reason=payload.correction_reason,
        force_override=payload.force_override,
    )
    if res.get("status") == "validation_failed":
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=res.get("message", "Validation failed for corrected record."),
        )
    return res
