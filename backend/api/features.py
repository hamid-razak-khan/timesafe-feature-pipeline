"""Feature Snapshots, Real-Time Preview, and CSV Export Endpoints."""
import io
import os
import csv
import time
from typing import List, Optional, Dict, Any
from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File, Form, status
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from database.db import BaseSession
from database.models import FeatureSnapshot, Customer, utc_now
from backend.schemas import (
    FeatureSnapshotItem,
    FeaturePreviewRequest,
    FeaturePreviewResponse,
    UploadPreviewResponse,
    GenerateGenericFeaturesRequest,
    GenerateGenericFeaturesResponse,
)
from backend.services.feature_engineering import (
    FeatureEngineeringService,
    compute_features,
    compute_generic_dataset_features,
)
from backend.services.validation_service import ValidationService
from backend.config import settings
from scripts.generate_data import generate_generic_sample_dataset

router = APIRouter()


def get_db():
    db = BaseSession()
    try:
        yield db
    finally:
        db.close()


@router.get("/features", response_model=List[FeatureSnapshotItem])
def api_get_features(
    customer_id: Optional[str] = None,
    feature_version: Optional[str] = None,
    limit: int = Query(100, ge=1, le=1000),
    db: Session = Depends(get_db),
):
    """Retrieve engineered feature snapshots with customer and version filters."""
    query = db.query(FeatureSnapshot)
    if customer_id:
        query = query.filter(FeatureSnapshot.customer_id == customer_id)
    if feature_version:
        query = query.filter(FeatureSnapshot.feature_version == feature_version)

    snapshots = query.order_by(FeatureSnapshot.as_of_time.desc()).limit(limit).all()
    return [s.to_dict() for s in snapshots]


@router.post("/features/preview", response_model=FeaturePreviewResponse)
def api_preview_features(
    req: FeaturePreviewRequest,
    db: Session = Depends(get_db),
):
    """On-demand calculation of point-in-time features for arbitrary customer and cutoff."""
    as_of = ValidationService.parse_utc_timestamp(req.as_of_time)
    if not as_of:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid timestamp format for as_of_time. Expected ISO-8601 UTC string.",
        )

    customer = db.query(Customer).filter(Customer.customer_id == req.customer_id).first()
    if not customer:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Customer '{req.customer_id}' not found.",
        )

    service = FeatureEngineeringService(db)
    try:
        features = service.generate_features_for_request(
            customer_id=req.customer_id,
            as_of_time=as_of,
            feature_version=req.feature_version,
            publish=False,  # Preview only, do not persist
        )
        return features
    except ValueError as ve:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(ve),
        )


@router.get("/export/features")
def api_export_features(
    feature_version: Optional[str] = None,
    db: Session = Depends(get_db),
):
    """Stream generated feature snapshots as CSV download."""
    query = db.query(FeatureSnapshot)
    if feature_version:
        query = query.filter(FeatureSnapshot.feature_version == feature_version)
    snapshots = query.order_by(FeatureSnapshot.customer_id, FeatureSnapshot.as_of_time).all()

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "snapshot_id",
        "customer_id",
        "as_of_time",
        "feature_version",
        "txn_count_7d",
        "txn_count_30d",
        "total_purchase_amount_30d",
        "avg_purchase_amount_30d",
        "days_since_last_txn",
        "refund_count_30d",
        "refund_amount_30d",
        "generated_at",
    ])

    for s in snapshots:
        writer.writerow([
            s.snapshot_id,
            s.customer_id,
            s.as_of_time.isoformat() if s.as_of_time else "",
            s.feature_version,
            s.txn_count_7d,
            s.txn_count_30d,
            float(s.total_purchase_amount_30d),
            float(s.avg_purchase_amount_30d),
            s.days_since_last_txn if s.days_since_last_txn is not None else "",
            s.refund_count_30d,
            float(s.refund_amount_30d),
            s.generated_at.isoformat() if s.generated_at else "",
        ])

    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=feature_snapshots.csv"},
    )


# =====================================================================
# General-Purpose ML Feature Wizard Endpoints
# =====================================================================

@router.post("/upload-preview", response_model=UploadPreviewResponse)
async def api_upload_preview(
    file: Optional[UploadFile] = File(None),
    use_sample: bool = Form(False),
):
    """Parse CSV upload or load sample generic dataset, returning columns, preview, and auto-mappings."""
    sample_path = os.path.join(settings.RAW_DATA_DIR, "generic_sample_transactions.csv")

    if use_sample or not file:
        if not os.path.exists(sample_path):
            generate_generic_sample_dataset(output_path=sample_path, num_entities=30, num_events=180)
        target_path = sample_path
        filename = "generic_sample_transactions.csv"
    else:
        if not file.filename.endswith(".csv"):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Only CSV files are supported.",
            )
        clean_name = os.path.basename(file.filename)
        target_path = os.path.join(settings.RAW_DATA_DIR, f"wizard_{clean_name}")
        os.makedirs(settings.RAW_DATA_DIR, exist_ok=True)
        with open(target_path, "wb") as buf:
            buf.write(await file.read())
        filename = clean_name

    # Parse rows and columns
    rows = []
    columns = []
    try:
        with open(target_path, "r", encoding="utf-8-sig") as f:
            reader = csv.DictReader(f)
            columns = reader.fieldnames or []
            for idx, r in enumerate(reader):
                rows.append(r)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to read CSV structure: {str(e)}",
        )

    if not rows:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="The uploaded CSV contains no data rows.",
        )

    # Intelligent Auto-Mapping Heuristic with strict priority and distinction between event and entity keys
    def find_match(candidates: List[str], exclude_patterns: Optional[List[str]] = None) -> Optional[str]:
        exclude_patterns = exclude_patterns or []
        normalized_cols = {col: col.strip().lower().replace("-", "_").replace(" ", "_") for col in columns}

        # Priority 1: Exact matches in candidate order
        for cand in candidates:
            for col, norm in normalized_cols.items():
                if norm == cand:
                    return col

        # Priority 2: Substring matches (guarded by exclusions)
        for cand in candidates:
            for col, norm in normalized_cols.items():
                if any(ex in norm for ex in exclude_patterns):
                    continue
                if cand in norm:
                    return col

        return None

    mapping = {
        "event_id": find_match(
            candidates=["event_id", "transaction_id", "order_id", "shipment_id", "tx_id", "log_id", "id"],
        ),
        "entity_id": find_match(
            candidates=["entity_id", "customer_id", "user_id", "account_id", "client_id", "device_id", "vehicle_id", "subject_id"],
            exclude_patterns=["event", "transaction", "order", "shipment", "txn", "log", "record", "raw"],
        ),
        "event_time": find_match(
            candidates=["event_time", "event_timestamp", "timestamp", "created_at", "datetime", "posted_at", "date", "time"],
            exclude_patterns=["available", "arrival", "ingest", "process", "load", "sync", "received"],
        ),
        "available_at": find_match(
            candidates=["available_at", "received_at", "ingested_at", "processed_at", "arrival_time", "loaded_at", "sync_time"],
        ),
        "amount": find_match(
            candidates=["amount", "value", "total", "price", "cost", "balance", "distance_km", "distance", "metric"],
        ),
        "event_type": find_match(
            candidates=["event_type", "event_category", "transaction_type", "type", "action", "status", "category"],
        ),
    }

    # Infer suggested cutoff: Find maximum valid event timestamp and subtract 7 days
    suggested_cutoff = "2026-05-31T00:00:00Z"
    time_col = mapping["event_time"]
    if time_col:
        valid_times = []
        for r in rows[:200]:
            raw_t = r.get(time_col)
            parsed = ValidationService.parse_utc_timestamp(raw_t)
            if parsed:
                valid_times.append(parsed)
        if valid_times:
            max_t = max(valid_times)
            suggested_cutoff = (max_t - timedelta(days=7)).strftime("%Y-%m-%dT%H:%M:%SZ")

    return {
        "filename": filename,
        "total_rows": len(rows),
        "columns": columns,
        "preview": rows[:10],
        "suggested_mapping": mapping,
        "suggested_cutoff": suggested_cutoff,
    }


@router.post("/features/generate-generic", response_model=GenerateGenericFeaturesResponse)
def api_generate_generic_features(
    req: GenerateGenericFeaturesRequest,
    db: Session = Depends(get_db),
):
    """Compute point-in-time features on a generic dataset using configurable column mappings."""
    # Resolve source file
    if req.filename:
        safe_name = os.path.basename(req.filename)
        path = os.path.join(settings.RAW_DATA_DIR, safe_name)
        if not os.path.exists(path):
            path = os.path.join(settings.RAW_DATA_DIR, f"wizard_{safe_name}")
    else:
        path = os.path.join(settings.RAW_DATA_DIR, "generic_sample_transactions.csv")

    if not os.path.exists(path):
        # Fallback to generic sample
        generate_generic_sample_dataset(output_path=path, num_entities=30, num_events=180)

    # Load dataset
    records = []
    with open(path, "r", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        records = list(reader)

    # Parse Cutoff Time
    cutoff = ValidationService.parse_utc_timestamp(req.cutoff_time)
    if not cutoff:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid cutoff_time format: '{req.cutoff_time}'. Expected UTC ISO-8601 string.",
        )

    start_time = time.perf_counter()
    has_avail_warning = req.assume_available_at_event_time or not req.column_mapping.get("available_at")

    all_features = compute_generic_dataset_features(
        records=records,
        column_mapping=req.column_mapping,
        cutoff_time=cutoff,
        feature_options=req.feature_options,
        assume_available_at_event_time=req.assume_available_at_event_time,
        feature_version=req.feature_version,
    )
    duration = time.perf_counter() - start_time

    # Calculate eligible events
    event_time_col = req.column_mapping.get("event_time", "event_time")
    avail_col = req.column_mapping.get("available_at", "available_at")
    eligible_count = 0
    for r in records:
        ev = ValidationService.parse_utc_timestamp(r.get(event_time_col))
        av = ValidationService.parse_utc_timestamp(r.get(avail_col)) if not req.assume_available_at_event_time else ev
        if ev and av and (ev < cutoff) and (av <= cutoff):
            eligible_count += 1

    return {
        "status": "success",
        "total_entities": len(all_features),
        "total_events": len(records),
        "eligible_events": eligible_count,
        "duration_seconds": round(duration, 3),
        "preview": all_features[:10],
        "all_features": all_features,
        "leakage_prevention_guarantee": (
            "Dual-timestamp point-in-time check enforced: only events with event_time < cutoff AND available_at <= cutoff were admitted."
            if not has_avail_warning else
            "Warning: Data was assumed available at event time. True historical ingestion latency was not measured."
        ),
        "has_availability_warning": has_avail_warning,
    }


