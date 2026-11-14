"""Feature Snapshots, Real-Time Preview, and CSV Export Endpoints."""
import io
import csv
from typing import List, Optional
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from database.db import BaseSession
from database.models import FeatureSnapshot, Customer
from backend.schemas import (
    FeatureSnapshotItem,
    FeaturePreviewRequest,
    FeaturePreviewResponse,
)
from backend.services.feature_engineering import FeatureEngineeringService, compute_features
from backend.services.validation_service import ValidationService

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
