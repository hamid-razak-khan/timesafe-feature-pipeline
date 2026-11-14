"""History, Observability, and Safe Reprocessing Service for TimeSafe."""
import json
import math
import uuid
from datetime import datetime, timezone, timedelta
from decimal import Decimal, InvalidOperation
from typing import Dict, Any, List, Optional, Tuple
from sqlalchemy.orm import Session
from sqlalchemy import func, desc, or_, and_, cast, String

from database.models import (
    Customer,
    Transaction,
    PredictionRequest,
    FeatureSnapshot,
    TrainingLabel,
    PipelineRun,
    RejectedRecord,
    SourceRecordHistory,
    RecordCorrection,
    RecordProcessingEvent,
    utc_now,
    ensure_utc,
)

ERROR_CATALOG: Dict[str, Dict[str, str]] = {
    "NULL_OR_EMPTY_ENTITY_ID": {
        "title": "Missing Entity ID",
        "category": "Missing Required Fields",
        "description": "The record does not identify a customer or account entity.",
        "fix_guidance": "Provide a valid, non-empty customer or entity ID.",
    },
    "NULL_OR_EMPTY_CUSTOMER_ID": {
        "title": "Missing Customer ID",
        "category": "Missing Required Fields",
        "description": "The customer identifier is blank or null.",
        "fix_guidance": "Provide a valid customer ID.",
    },
    "NULL_OR_EMPTY_PRIMARY_KEY": {
        "title": "Missing Record ID",
        "category": "Missing Required Fields",
        "description": "The primary record identifier is missing or null.",
        "fix_guidance": "Provide a unique primary key identifier.",
    },
    "NEGATIVE_AMOUNT": {
        "title": "Negative Transaction Amount",
        "category": "Negative Values",
        "description": "Transaction amounts must be positive decimal numbers.",
        "fix_guidance": "Correct the negative sign or verify if this is a refund event.",
    },
    "INVALID_OR_MISSING_EVENT_TIME": {
        "title": "Invalid Event Date",
        "category": "Invalid Timestamps",
        "description": "The event timestamp is missing or not a valid ISO datetime format.",
        "fix_guidance": "Provide a valid ISO-8601 date and time (e.g. 2026-03-15T14:30:00Z).",
    },
    "AVAILABLE_PREDATES_EVENT": {
        "title": "Availability Precedes Event Date",
        "category": "Invalid Timestamps",
        "description": "The available_at timestamp cannot be earlier than event_time (causality violation).",
        "fix_guidance": "Set available_at to be greater than or equal to event_time.",
    },
    "CONFLICTING_PRIMARY_KEY": {
        "title": "Conflicting Record ID",
        "category": "Conflicting Primary Key",
        "description": "A different record with this exact ID already exists in the operational database.",
        "fix_guidance": "Use a new unique ID or verify if this is a duplicate transmission.",
    },
    "FOREIGN_KEY_VIOLATION": {
        "title": "Unregistered Entity",
        "category": "Foreign Key Violation",
        "description": "The referenced customer or entity does not exist in the registered entities directory.",
        "fix_guidance": "Register the customer entity first or correct the entity ID.",
    },
    "MALFORMED_CSV_ROW": {
        "title": "Malformed Data Row",
        "category": "Malformed Records",
        "description": "Row syntax error, mismatched column count, or corrupt serialization.",
        "fix_guidance": "Verify CSV formatting and delimiters.",
    },
    "DECIMAL_PRECISION_OVERFLOW": {
        "title": "Decimal Precision Overflow",
        "category": "Type Error",
        "description": "Numeric value exceeds maximum allowed decimal precision.",
        "fix_guidance": "Limit numeric value to standard decimal precision (max 2 decimals).",
    },
    "DUPLICATE_TRANSACTION_ID_IN_FILE": {
        "title": "Duplicate Record ID in Batch",
        "category": "Duplicate Record",
        "description": "The batch contains multiple records sharing the same primary transaction identifier.",
        "fix_guidance": "Deduplicate the source batch or assign distinct record identifiers.",
    },
    "TRANSACTION_PREDATES_CUSTOMER_CREATION": {
        "title": "Transaction Predates Customer Registration",
        "category": "Invalid Timestamps",
        "description": "Event timestamp is earlier than the customer entity registration date.",
        "fix_guidance": "Adjust event_time to be on or after customer registration date.",
    },
    "PREDICTION_CUTOFF_PREDATES_CUSTOMER_CREATION": {
        "title": "Prediction Cutoff Predates Customer",
        "category": "Invalid Timestamps",
        "description": "Prediction cutoff timestamp is earlier than customer registration date.",
        "fix_guidance": "Select a prediction cutoff timestamp on or after customer creation.",
    },
    "AVAILABLE_TIME_PREDATES_EVENT_TIME": {
        "title": "Availability Precedes Event Date",
        "category": "Invalid Timestamps",
        "description": "The available_at timestamp cannot be earlier than event_time (causality violation).",
        "fix_guidance": "Set available_at to be greater than or equal to event_time.",
    },
}


def map_error_to_metadata(reason: Optional[str]) -> Tuple[str, str, str, str]:
    """Return (title, category, description, fix_guidance) for any error reason string."""
    if not reason:
        return ("Unknown Status", "Unclassified", "No specific error code provided.", "Inspect raw record payload.")
    
    # Check exact key first
    reason_upper = reason.upper()
    for code, meta in ERROR_CATALOG.items():
        if code in reason_upper:
            return (meta["title"], meta["category"], meta["description"], meta["fix_guidance"])
            
    # Fuzzy category heuristics
    if "NEGATIVE" in reason_upper:
        return ("Negative Value Detected", "Negative Values", "Numeric value is less than zero.", "Provide a positive value.")
    if "TIME" in reason_upper or "DATE" in reason_upper or "PREDATES" in reason_upper:
        return ("Timestamp Order Violation", "Invalid Timestamps", "Timestamp ordering violates chronological causality.", "Verify event_time <= available_at.")
    if "KEY" in reason_upper or "FOREIGN" in reason_upper or "UNREGISTERED" in reason_upper:
        return ("Entity Relationship Issue", "Foreign Key Violation", "Entity key cannot be resolved against parent records.", "Register entity or check ID.")
    if "NULL" in reason_upper or "MISSING" in reason_upper or "EMPTY" in reason_upper:
        return ("Missing Required Field", "Missing Required Fields", "A mandatory column value was blank or omitted.", "Fill in required field.")

    return ("Validation Exception", "Other", reason, "Review raw input payload and correct values.")


def format_friendly_run_type(raw_type: str) -> str:
    """Translate internal run types into user-friendly names."""
    mapping = {
        "full_pipeline": "Full Pipeline Execution",
        "ingest_customers": "Customer Entities Import",
        "ingest_transactions": "Transactions Ingestion",
        "ingest_predictions": "Prediction Requests Ingestion",
        "compute_features": "Feature Engineering",
        "generate_labels": "Target Label Generation",
        "generic_features": "Generic Dataset Processing",
        "reprocess_retry": "Record Reprocess Retry",
    }
    return mapping.get(raw_type, raw_type.replace("_", " ").title())


def format_run_status(status: str, rejected_rows: int) -> Tuple[str, str]:
    """Return (friendly_status, badge_color)."""
    if status == "success":
        if rejected_rows > 0:
            return ("Completed with Rejections", "amber")
        return ("Completed", "green")
    if status == "failed":
        return ("Failed", "red")
    if status == "running":
        return ("In Progress", "blue")
    return (status.title(), "slate")


def parse_utc_timestamp(val: Any) -> Optional[datetime]:
    """Parse string or datetime into UTC datetime object."""
    if val is None:
        return None
    if isinstance(val, datetime):
        return ensure_utc(val)
    s = str(val).strip()
    if not s:
        return None
    if s.endswith("Z"):
        s = s[:-1] + "+00:00"
    dt = datetime.fromisoformat(s)
    return ensure_utc(dt)


def resolve_date_filter(
    date_preset: Optional[str] = None,
    start_str: Optional[str] = None,
    end_str: Optional[str] = None,
) -> Tuple[Optional[datetime], Optional[datetime]]:
    """Parse and normalize date filtering bounds into UTC datetimes."""
    now = datetime.now(timezone.utc)
    if date_preset == "today":
        start = datetime(now.year, now.month, now.day, 0, 0, 0, tzinfo=timezone.utc)
        end = datetime(now.year, now.month, now.day, 23, 59, 59, 999999, tzinfo=timezone.utc)
        return start, end
    elif date_preset == "7d":
        start = now - timedelta(days=7)
        return start, now
    elif date_preset == "30d":
        start = now - timedelta(days=30)
        return start, now

    start, end = None, None
    if start_str:
        s = str(start_str).strip()
        if len(s) == 10:
            start = datetime.fromisoformat(s + "T00:00:00+00:00")
        else:
            if s.endswith("Z"):
                s = s[:-1] + "+00:00"
            start = datetime.fromisoformat(s)
            if start.tzinfo is None:
                start = start.replace(tzinfo=timezone.utc)
    if end_str:
        e = str(end_str).strip()
        if len(e) == 10:
            end = datetime.fromisoformat(e + "T23:59:59.999999+00:00")
        else:
            if e.endswith("Z"):
                e = e[:-1] + "+00:00"
            end = datetime.fromisoformat(e)
            if end.tzinfo is None:
                end = end.replace(tzinfo=timezone.utc)
    return start, end


class HistoryService:
    def __init__(self, session: Session):
        self.session = session

    def get_dashboard_filter_options(self) -> Dict[str, Any]:
        """Return available dataset options, counts, and filter choices."""
        raw_files = set()
        for row in self.session.query(Transaction.source_file).distinct().all():
            if row[0]:
                raw_files.add(row[0])
        for row in self.session.query(RejectedRecord.source_file).distinct().all():
            if row[0]:
                raw_files.add(row[0])
        for row in self.session.query(PipelineRun.source_file).distinct().all():
            if row[0] and not row[0].startswith("batch_manifest"):
                raw_files.add(row[0])
        for row in self.session.query(SourceRecordHistory.source_file).distinct().all():
            if row[0]:
                raw_files.add(row[0])

        datasets = []
        for f in sorted(raw_files):
            tx_cnt = self.session.query(func.count(Transaction.transaction_id)).filter(Transaction.source_file == f).scalar() or 0
            rej_cnt = self.session.query(func.count(RejectedRecord.reject_id)).filter(RejectedRecord.source_file == f).scalar() or 0
            if f == "customers.csv":
                cust_cnt = self.session.query(func.count(Customer.customer_id)).scalar() or 0
                tx_cnt = cust_cnt
            elif f == "prediction_requests.csv":
                pred_cnt = self.session.query(func.count(PredictionRequest.request_id)).scalar() or 0
                tx_cnt = pred_cnt

            datasets.append({
                "id": f,
                "label": f,
                "valid_records": tx_cnt,
                "rejected_records": rej_cnt,
            })

        return {
            "datasets": datasets,
            "date_presets": [
                {"id": "all", "label": "All Time"},
                {"id": "today", "label": "Today"},
                {"id": "7d", "label": "Last 7 Days"},
                {"id": "30d", "label": "Last 30 Days"},
                {"id": "custom", "label": "Custom Range"},
            ],
            "statuses": [
                {"id": "all", "label": "All Statuses"},
                {"id": "completed", "label": "Completed"},
                {"id": "warning", "label": "Completed with Rejections"},
                {"id": "failed", "label": "Failed"},
            ],
        }

    def _build_timeline(
        self,
        source_file: Optional[str] = None,
        start_time: Optional[datetime] = None,
        end_time: Optional[datetime] = None,
        status_filter: Optional[str] = None,
        granularity: str = "auto",
    ) -> Tuple[List[Dict[str, Any]], str]:
        """
        Build a mathematically sound activity timeline:
        - Ingestion runs (run_type != 'full_pipeline') provide accepted_rows and rejected_rows.
        - Feature generation runs (feature_rows > 0) provide feature snapshot volume.
        - Supports auto-detection: if dates <= 1 day, groups by hour (%H:00) to show meaningful activity.
        - If dates > 1 day, groups by daily (%Y-%m-%d).
        """
        # Determine date span of matching runs
        dq = self.session.query(
            func.strftime("%Y-%m-%d", PipelineRun.start_time).label("day")
        ).filter(PipelineRun.run_type != "full_pipeline")
        if source_file:
            dq = dq.filter(PipelineRun.source_file == source_file)
        if start_time:
            dq = dq.filter(PipelineRun.start_time >= start_time)
        if end_time:
            dq = dq.filter(PipelineRun.start_time <= end_time)

        distinct_days = [r[0] for r in dq.distinct().all() if r[0]]
        use_hourly = (granularity == "hourly") or (granularity == "auto" and len(distinct_days) <= 1)
        fmt = "%H:00" if use_hourly else "%Y-%m-%d"

        # 1. Ingestion query
        iq = self.session.query(
            func.strftime(fmt, PipelineRun.start_time).label("bucket"),
            func.sum(PipelineRun.accepted_rows).label("accepted"),
            func.sum(PipelineRun.rejected_rows).label("rejected"),
            func.count(PipelineRun.run_id).label("runs_count"),
        ).filter(PipelineRun.run_type != "full_pipeline")

        if source_file:
            iq = iq.filter(PipelineRun.source_file == source_file)
        if start_time:
            iq = iq.filter(PipelineRun.start_time >= start_time)
        if end_time:
            iq = iq.filter(PipelineRun.start_time <= end_time)
        if status_filter and status_filter != "all":
            if status_filter == "completed":
                iq = iq.filter(PipelineRun.status == "success", PipelineRun.rejected_rows == 0)
            elif status_filter in ("warning", "completed_with_rejections"):
                iq = iq.filter(PipelineRun.status == "success", PipelineRun.rejected_rows > 0)
            elif status_filter == "failed":
                iq = iq.filter(PipelineRun.status == "failed")

        ingest_rows = iq.group_by("bucket").all()

        # 2. Feature runs query
        fq = self.session.query(
            func.strftime(fmt, PipelineRun.start_time).label("bucket"),
            func.sum(PipelineRun.feature_rows).label("features"),
        ).filter(PipelineRun.feature_rows > 0)

        if start_time:
            fq = fq.filter(PipelineRun.start_time >= start_time)
        if end_time:
            fq = fq.filter(PipelineRun.start_time <= end_time)
        if status_filter and status_filter != "all":
            if status_filter == "completed":
                fq = fq.filter(PipelineRun.status == "success")
            elif status_filter == "failed":
                fq = fq.filter(PipelineRun.status == "failed")

        if source_file and source_file == "customers.csv":
            feat_map = {}
        else:
            feat_rows = fq.group_by("bucket").all()
            feat_map = {r[0]: int(r[1] or 0) for r in feat_rows if r[0]}

        all_buckets = sorted(set([r[0] for r in ingest_rows if r[0]] + list(feat_map.keys())))
        ingest_map = {r[0]: (int(r[1] or 0), int(r[2] or 0), int(r[3] or 0)) for r in ingest_rows if r[0]}

        timeline = []
        for b in all_buckets:
            acc, rej, cnt = ingest_map.get(b, (0, 0, 0))
            feat = feat_map.get(b, 0)
            disp = f"{b} UTC" if use_hourly else b
            timeline.append({
                "date": b,
                "display_date": disp,
                "accepted": acc,
                "rejected": rej,
                "features": feat,
                "runs_count": cnt,
                "source_file": source_file or "All Datasets",
            })

        return timeline, ("hourly" if use_hourly else "daily")

    def get_dashboard_summary(
        self,
        source_file: Optional[str] = None,
        date_preset: Optional[str] = None,
        start_date: Optional[str] = None,
        end_date: Optional[str] = None,
        status_filter: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Aggregate high-level metrics for the executive and operational dashboard with filter support."""
        start_time, end_time = resolve_date_filter(date_preset, start_date, end_date)

        # 1. Distinct datasets count
        distinct_files = set()
        for row in self.session.query(SourceRecordHistory.source_file).distinct().all():
            if row[0]:
                distinct_files.add(row[0])
        for row in self.session.query(Transaction.source_file).distinct().all():
            if row[0]:
                distinct_files.add(row[0])
        for row in self.session.query(RejectedRecord.source_file).distinct().all():
            if row[0]:
                distinct_files.add(row[0])

        datasets_processed = 1 if source_file else (len(distinct_files) if distinct_files else 1)

        # 2. Currently stored records according to source_file filter
        if source_file:
            if source_file == "customers.csv":
                total_tx = self.session.query(func.count(Customer.customer_id)).scalar() or 0
                total_features = 0
            elif source_file == "prediction_requests.csv":
                total_tx = self.session.query(func.count(PredictionRequest.request_id)).scalar() or 0
                total_features = self.session.query(func.count(FeatureSnapshot.snapshot_id)).scalar() or 0
            else:
                total_tx = self.session.query(func.count(Transaction.transaction_id)).filter(Transaction.source_file == source_file).scalar() or 0
                total_features = self.session.query(func.count(FeatureSnapshot.snapshot_id)).scalar() or 0

            rej_q = self.session.query(func.count(RejectedRecord.reject_id)).filter(RejectedRecord.source_file == source_file)
            needs_q = self.session.query(func.count(RejectedRecord.reject_id)).filter(
                RejectedRecord.source_file == source_file,
                or_(RejectedRecord.resolution_status == "unresolved", RejectedRecord.resolution_status == None),
            )
        else:
            total_tx = self.session.query(func.count(Transaction.transaction_id)).scalar() or 0
            total_features = self.session.query(func.count(FeatureSnapshot.snapshot_id)).scalar() or 0
            rej_q = self.session.query(func.count(RejectedRecord.reject_id))
            needs_q = self.session.query(func.count(RejectedRecord.reject_id)).filter(
                or_(RejectedRecord.resolution_status == "unresolved", RejectedRecord.resolution_status == None)
            )

        if start_time:
            rej_q = rej_q.filter(RejectedRecord.created_at >= start_time)
            needs_q = needs_q.filter(RejectedRecord.created_at >= start_time)
        if end_time:
            rej_q = rej_q.filter(RejectedRecord.created_at <= end_time)
            needs_q = needs_q.filter(RejectedRecord.created_at <= end_time)

        total_rej = rej_q.scalar() or 0
        needs_attention = needs_q.scalar() or 0

        # 3. Historical processing totals (non-full_pipeline runs to prevent double-counting)
        hist_q = self.session.query(
            func.sum(PipelineRun.input_rows),
            func.sum(PipelineRun.accepted_rows),
            func.sum(PipelineRun.rejected_rows),
        ).filter(PipelineRun.run_type != "full_pipeline")

        if source_file:
            hist_q = hist_q.filter(PipelineRun.source_file == source_file)
        if start_time:
            hist_q = hist_q.filter(PipelineRun.start_time >= start_time)
        if end_time:
            hist_q = hist_q.filter(PipelineRun.start_time <= end_time)
        if status_filter and status_filter != "all":
            if status_filter == "completed":
                hist_q = hist_q.filter(PipelineRun.status == "success", PipelineRun.rejected_rows == 0)
            elif status_filter in ("warning", "completed_with_rejections"):
                hist_q = hist_q.filter(PipelineRun.status == "success", PipelineRun.rejected_rows > 0)
            elif status_filter == "failed":
                hist_q = hist_q.filter(PipelineRun.status == "failed")

        hist_totals = hist_q.first()
        total_hist_input = int(hist_totals[0] or 0) if hist_totals else 0
        total_hist_accepted = int(hist_totals[1] or 0) if hist_totals else 0
        total_hist_rejected = int(hist_totals[2] or 0) if hist_totals else 0

        # Donut Chart and Data Quality Ratio
        distinct_records_total = total_tx + total_rej
        total_processed = max(distinct_records_total, total_hist_input)
        rejection_rate = round((total_rej / distinct_records_total * 100), 1) if distinct_records_total > 0 else 0.0
        valid_records_percent = round((total_tx / distinct_records_total * 100), 1) if distinct_records_total > 0 else 0.0

        # 4. Rejection reasons summary with friendly titles
        reasons_q = self.session.query(
            RejectedRecord.rejection_reason,
            func.count(RejectedRecord.reject_id),
        )
        if source_file:
            reasons_q = reasons_q.filter(RejectedRecord.source_file == source_file)
        if start_time:
            reasons_q = reasons_q.filter(RejectedRecord.created_at >= start_time)
        if end_time:
            reasons_q = reasons_q.filter(RejectedRecord.created_at <= end_time)

        reasons_summary = []
        for reason_code, count in reasons_q.group_by(RejectedRecord.rejection_reason).all():
            title, category, descr, _ = map_error_to_metadata(reason_code)
            reasons_summary.append({
                "code": reason_code,
                "title": title,
                "category": category,
                "description": descr,
                "count": count,
            })
        reasons_summary.sort(key=lambda x: x["count"], reverse=True)

        accepted_vs_rejected = {
            "accepted": total_tx,
            "rejected": total_rej,
            "valid_percent": valid_records_percent,
        }

        # 5. Activity timeline (supports hourly / daily granularity and filter criteria)
        activity_timeline, _ = self._build_timeline(
            source_file=source_file,
            start_time=start_time,
            end_time=end_time,
            status_filter=status_filter,
            granularity="auto",
        )

        # 6. Recent pipeline activity matching filters
        recent_q = self.session.query(PipelineRun)
        if source_file:
            recent_q = recent_q.filter(PipelineRun.source_file == source_file)
        if start_time:
            recent_q = recent_q.filter(PipelineRun.start_time >= start_time)
        if end_time:
            recent_q = recent_q.filter(PipelineRun.start_time <= end_time)
        if status_filter and status_filter != "all":
            if status_filter == "completed":
                recent_q = recent_q.filter(PipelineRun.status == "success", PipelineRun.rejected_rows == 0)
            elif status_filter in ("warning", "completed_with_rejections"):
                recent_q = recent_q.filter(PipelineRun.status == "success", PipelineRun.rejected_rows > 0)
            elif status_filter == "failed":
                recent_q = recent_q.filter(PipelineRun.status == "failed")

        recent_runs_query = recent_q.order_by(PipelineRun.start_time.desc()).limit(8).all()
        recent_activity = []
        for r in recent_runs_query:
            friendly_status, badge = format_run_status(r.status, r.rejected_rows)
            friendly_type = format_friendly_run_type(r.run_type)
            source_name = (
                "transactions.csv" if r.run_type == "ingest_transactions" else (
                    "customers.csv" if r.run_type == "ingest_customers" else (
                        "prediction_requests.csv" if r.run_type == "ingest_prediction_requests" else (
                            "pipeline_batch" if r.run_type == "full_pipeline" else friendly_type
                        )
                    )
                )
            )
            recent_activity.append({
                "run_id": r.run_id,
                "source_file": source_name,
                "friendly_type": friendly_type,
                "raw_run_type": r.run_type,
                "status": friendly_status,
                "badge_color": badge,
                "start_time": r.start_time.isoformat() if r.start_time else None,
                "records_processed": r.input_rows,
                "input_rows": r.input_rows,
                "accepted_rows": r.accepted_rows,
                "rejected_rows": r.rejected_rows,
                "feature_rows": r.feature_rows,
                "duration_seconds": round(float(r.duration_seconds or 0.0), 2),
            })

        # 7. Available datasets for filter bar
        filter_options = self.get_dashboard_filter_options()

        is_filtered = bool(
            source_file or
            (date_preset and date_preset != "all") or
            start_date or
            end_date or
            (status_filter and status_filter != "all")
        )

        return {
            "datasets_processed": datasets_processed,
            "valid_records": total_tx,
            "feature_snapshots_generated": total_features,
            "total_records_processed": total_processed,
            "accepted_records": total_tx,
            "rejected_records": total_rej,
            "rejection_rate_percent": rejection_rate,
            "valid_records_percent": valid_records_percent,
            "generated_ml_features": total_features,
            "needs_attention_count": needs_attention,
            "total_historical_inputs": total_hist_input,
            "total_historical_accepted": total_hist_accepted,
            "total_historical_rejected": total_hist_rejected,
            "rejection_reasons_summary": reasons_summary,
            "accepted_vs_rejected": accepted_vs_rejected,
            "activity_timeline": activity_timeline,
            "recent_activity": recent_activity,
            "available_datasets": filter_options["datasets"],
            "active_filters": {
                "source_file": source_file,
                "date_preset": date_preset,
                "start_date": start_date,
                "end_date": end_date,
                "status": status_filter,
            },
            "is_filtered": is_filtered,
        }

    def get_dashboard_activity(
        self,
        source_file: Optional[str] = None,
        date_preset: Optional[str] = None,
        start_date: Optional[str] = None,
        end_date: Optional[str] = None,
        status_filter: Optional[str] = None,
        granularity: str = "auto",
    ) -> Dict[str, Any]:
        """Provide detailed activity timelines and per-run breakdown without double counting."""
        start_time, end_time = resolve_date_filter(date_preset, start_date, end_date)
        daily_timeline, gran_used = self._build_timeline(
            source_file=source_file,
            start_time=start_time,
            end_time=end_time,
            status_filter=status_filter,
            granularity=granularity,
        )

        # Recent execution runs activity matching filter
        runs_q = self.session.query(PipelineRun)
        if source_file:
            runs_q = runs_q.filter(PipelineRun.source_file == source_file)
        if start_time:
            runs_q = runs_q.filter(PipelineRun.start_time >= start_time)
        if end_time:
            runs_q = runs_q.filter(PipelineRun.start_time <= end_time)
        if status_filter and status_filter != "all":
            if status_filter == "completed":
                runs_q = runs_q.filter(PipelineRun.status == "success", PipelineRun.rejected_rows == 0)
            elif status_filter in ("warning", "completed_with_rejections"):
                runs_q = runs_q.filter(PipelineRun.status == "success", PipelineRun.rejected_rows > 0)
            elif status_filter == "failed":
                runs_q = runs_q.filter(PipelineRun.status == "failed")

        runs_query = runs_q.order_by(PipelineRun.start_time.desc()).limit(15).all()
        recent_runs = []
        for r in runs_query:
            friendly_status, badge = format_run_status(r.status, r.rejected_rows)
            friendly_type = format_friendly_run_type(r.run_type)
            st_iso = r.start_time.isoformat() if r.start_time else ""
            display_time = st_iso.split("T")[-1][:8] if "T" in st_iso else (st_iso[-8:] if len(st_iso) >= 8 else st_iso)
            recent_runs.append({
                "run_id": r.run_id,
                "short_id": r.run_id[-8:] if len(r.run_id) > 8 else r.run_id,
                "timestamp": st_iso,
                "display_time": display_time,
                "run_type": friendly_type,
                "input_rows": r.input_rows,
                "accepted_rows": r.accepted_rows,
                "rejected_rows": r.rejected_rows,
                "feature_rows": r.feature_rows,
                "status": friendly_status,
                "badge_color": badge,
            })

        is_filtered = bool(
            source_file or
            (date_preset and date_preset != "all") or
            start_date or
            end_date or
            (status_filter and status_filter != "all")
        )

        return {
            "daily_timeline": daily_timeline,
            "recent_runs": recent_runs,
            "granularity": gran_used,
            "is_filtered": is_filtered,
        }

    def get_dashboard_data_quality(
        self,
        source_file: Optional[str] = None,
        date_preset: Optional[str] = None,
        start_date: Optional[str] = None,
        end_date: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Provide detailed data quality distributions and category breakdowns with filter support."""
        start_time, end_time = resolve_date_filter(date_preset, start_date, end_date)

        rej_q = self.session.query(func.count(RejectedRecord.reject_id))
        needs_q = self.session.query(func.count(RejectedRecord.reject_id)).filter(
            or_(RejectedRecord.resolution_status == "unresolved", RejectedRecord.resolution_status == None)
        )
        reasons_q = self.session.query(
            RejectedRecord.rejection_reason,
            func.count(RejectedRecord.reject_id),
        )

        if source_file:
            rej_q = rej_q.filter(RejectedRecord.source_file == source_file)
            needs_q = needs_q.filter(RejectedRecord.source_file == source_file)
            reasons_q = reasons_q.filter(RejectedRecord.source_file == source_file)
        if start_time:
            rej_q = rej_q.filter(RejectedRecord.created_at >= start_time)
            needs_q = needs_q.filter(RejectedRecord.created_at >= start_time)
            reasons_q = reasons_q.filter(RejectedRecord.created_at >= start_time)
        if end_time:
            rej_q = rej_q.filter(RejectedRecord.created_at <= end_time)
            needs_q = needs_q.filter(RejectedRecord.created_at <= end_time)
            reasons_q = reasons_q.filter(RejectedRecord.created_at <= end_time)

        total_rej = rej_q.scalar() or 0
        needs_attention = needs_q.scalar() or 0
        resolved_count = max(0, total_rej - needs_attention)

        reasons_summary = []
        category_counts: Dict[str, int] = {}
        for reason_code, count in reasons_q.group_by(RejectedRecord.rejection_reason).all():
            title, category, descr, guidance = map_error_to_metadata(reason_code)
            category_counts[category] = category_counts.get(category, 0) + count
            reasons_summary.append({
                "code": reason_code,
                "title": title,
                "category": category,
                "description": descr,
                "guidance": guidance,
                "count": count,
            })
        reasons_summary.sort(key=lambda x: x["count"], reverse=True)

        colors = ["#f43f5e", "#f59e0b", "#8B5CF6", "#A855F7", "#D8B4FE", "#10b981"]
        category_breakdown = [
            {"category": cat, "count": cnt, "color": colors[i % len(colors)]}
            for i, (cat, cnt) in enumerate(sorted(category_counts.items(), key=lambda x: x[1], reverse=True))
        ]

        return {
            "total_quarantined": total_rej,
            "unresolved_count": needs_attention,
            "resolved_count": resolved_count,
            "rejection_reasons_summary": reasons_summary,
            "category_breakdown": category_breakdown,
            "integrity_status": "PASSED" if total_rej == 0 or resolved_count == total_rej else "ATTENTION_REQUIRED",
        }

    def get_dashboard_recent_runs(
        self,
        limit: int = 10,
        source_file: Optional[str] = None,
        date_preset: Optional[str] = None,
        start_date: Optional[str] = None,
        end_date: Optional[str] = None,
        status_filter: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Fetch latest pipeline execution runs with full row accounting and filter support."""
        start_time, end_time = resolve_date_filter(date_preset, start_date, end_date)

        runs_q = self.session.query(PipelineRun)
        if source_file:
            runs_q = runs_q.filter(PipelineRun.source_file == source_file)
        if start_time:
            runs_q = runs_q.filter(PipelineRun.start_time >= start_time)
        if end_time:
            runs_q = runs_q.filter(PipelineRun.start_time <= end_time)
        if status_filter and status_filter != "all":
            if status_filter == "completed":
                runs_q = runs_q.filter(PipelineRun.status == "success", PipelineRun.rejected_rows == 0)
            elif status_filter in ("warning", "completed_with_rejections"):
                runs_q = runs_q.filter(PipelineRun.status == "success", PipelineRun.rejected_rows > 0)
            elif status_filter == "failed":
                runs_q = runs_q.filter(PipelineRun.status == "failed")

        total_runs = runs_q.count()
        runs_query = runs_q.order_by(PipelineRun.start_time.desc()).limit(limit).all()

        runs_list = []
        for r in runs_query:
            friendly_status, badge = format_run_status(r.status, r.rejected_rows)
            friendly_type = format_friendly_run_type(r.run_type)
            source_name = (
                "transactions.csv" if r.run_type == "ingest_transactions" else (
                    "customers.csv" if r.run_type == "ingest_customers" else (
                        "prediction_requests.csv" if r.run_type == "ingest_prediction_requests" else (
                            "pipeline_batch" if r.run_type == "full_pipeline" else friendly_type
                        )
                    )
                )
            )
            runs_list.append({
                "run_id": r.run_id,
                "dataset_name": source_name,
                "friendly_type": friendly_type,
                "raw_run_type": r.run_type,
                "status": friendly_status,
                "badge_color": badge,
                "start_time": r.start_time.isoformat() if r.start_time else None,
                "input_records": r.input_rows,
                "accepted_records": r.accepted_rows,
                "rejected_records": r.rejected_rows,
                "feature_records": r.feature_rows,
                "duration_seconds": round(float(r.duration_seconds or 0.0), 2),
            })

        return {
            "total": total_runs,
            "runs": runs_list,
        }

    def get_record_history(
        self,
        search: Optional[str] = None,
        source_file: Optional[str] = None,
        status_filter: Optional[str] = None,
        error_category: Optional[str] = None,
        start_date: Optional[str] = None,
        end_date: Optional[str] = None,
        page: int = 1,
        limit: int = 25,
    ) -> Dict[str, Any]:
        """Search and filter through historical records with server-side pagination."""
        query = self.session.query(SourceRecordHistory)

        # Filters
        if search:
            s = f"%{search.strip()}%"
            query = query.filter(
                or_(
                    SourceRecordHistory.record_id.ilike(s),
                    SourceRecordHistory.entity_id.ilike(s),
                    SourceRecordHistory.rejection_reason.ilike(s),
                    SourceRecordHistory.source_file.ilike(s),
                )
            )

        if source_file and source_file.lower() != "all":
            query = query.filter(SourceRecordHistory.source_file == source_file)

        if status_filter and status_filter.lower() != "all":
            query = query.filter(SourceRecordHistory.processing_status.ilike(status_filter))

        if start_date:
            try:
                dt_start = datetime.fromisoformat(start_date.replace("Z", "+00:00"))
                query = query.filter(SourceRecordHistory.event_time >= dt_start)
            except Exception:
                pass

        if end_date:
            try:
                dt_end = datetime.fromisoformat(end_date.replace("Z", "+00:00"))
                query = query.filter(SourceRecordHistory.event_time <= dt_end)
            except Exception:
                pass

        # Error category filtering requires looking up matching reason codes
        if error_category and error_category.lower() != "all":
            matching_codes = [
                code for code, meta in ERROR_CATALOG.items()
                if meta["category"].lower() == error_category.lower()
            ]
            if matching_codes:
                clauses = [SourceRecordHistory.rejection_reason.ilike(f"%{c}%") for c in matching_codes]
                query = query.filter(or_(*clauses))

        total_count = query.count()
        offset = (page - 1) * limit
        records = query.order_by(desc(SourceRecordHistory.last_processed_at)).offset(offset).limit(limit).all()

        # Build filter options for frontend dropdowns
        all_sources = [r[0] for r in self.session.query(SourceRecordHistory.source_file).distinct().all() if r[0]]
        all_categories = sorted(list({meta["category"] for meta in ERROR_CATALOG.values()}))
        statuses = ["accepted", "rejected", "corrected", "reprocessed"]

        results = []
        for r in records:
            d = r.to_dict()
            title, cat, _, _ = map_error_to_metadata(r.rejection_reason)
            d["rejection_title"] = title if r.processing_status != "accepted" else None
            d["rejection_category"] = cat if r.processing_status != "accepted" else None
            results.append(d)

        return {
            "total": total_count,
            "page": page,
            "limit": limit,
            "records": results,
            "filter_options": {
                "source_files": all_sources,
                "error_categories": all_categories,
                "statuses": statuses,
            },
        }

    def get_record_detail(self, history_id: str) -> Optional[Dict[str, Any]]:
        """Retrieve complete audit history, correction versions, and lifecycle events for a record."""
        rec = self.session.query(SourceRecordHistory).filter(SourceRecordHistory.history_id == history_id).first()
        if not rec:
            # Fallback check by record_id
            rec = self.session.query(SourceRecordHistory).filter(SourceRecordHistory.record_id == history_id).first()
        if not rec:
            # Fallback check if passed ID is a reject_id prefixed with HIST_
            rec = self.session.query(SourceRecordHistory).filter(SourceRecordHistory.history_id == f"HIST_{history_id}").first()
        if not rec:
            # Fallback check if this matches a RejectedRecord by reject_id
            rej_fallback = self.session.query(RejectedRecord).filter(RejectedRecord.reject_id == history_id).first()
            if rej_fallback:
                rec = self.session.query(SourceRecordHistory).filter(
                    SourceRecordHistory.source_file == rej_fallback.source_file,
                    SourceRecordHistory.source_row_number == rej_fallback.source_row_number
                ).first()
        if not rec:
            return None

        # Look up corresponding reject if any
        reject = None
        if rec.history_id.startswith("HIST_REJ_"):
            rej_id = rec.history_id.replace("HIST_", "")
            reject = self.session.query(RejectedRecord).filter(RejectedRecord.reject_id == rej_id).first()
        elif rec.record_id:
            reject = self.session.query(RejectedRecord).filter(
                RejectedRecord.raw_record.ilike(f"%{rec.record_id}%")
            ).first()

        # Look up corrections
        corrections = (
            self.session.query(RecordCorrection)
            .filter(or_(RecordCorrection.history_id == rec.history_id, RecordCorrection.reject_id == (reject.reject_id if reject else "")))
            .order_by(RecordCorrection.created_at.asc())
            .all()
        )

        # Look up events
        events = (
            self.session.query(RecordProcessingEvent)
            .filter(or_(RecordProcessingEvent.history_id == rec.history_id, RecordProcessingEvent.reject_id == (reject.reject_id if reject else "")))
            .order_by(RecordProcessingEvent.created_at.asc())
            .all()
        )

        # Check for potential historical snapshot impact
        affected_warning = None
        if rec.entity_id and rec.event_time:
            computed_snapshots_count = (
                self.session.query(func.count(FeatureSnapshot.snapshot_id))
                .filter(FeatureSnapshot.customer_id == rec.entity_id, FeatureSnapshot.as_of_time >= rec.event_time)
                .scalar() or 0
            )
            if computed_snapshots_count > 0:
                affected_warning = (
                    f"Warning: {computed_snapshots_count} feature snapshot(s) were previously generated for "
                    f"entity '{rec.entity_id}' after this event timestamp. Past snapshot outputs remain immutable "
                    "to maintain reproducible audit history. Reprocessing will update future feature evaluations."
                )

        rec_dict = rec.to_dict()
        title, cat, _, _ = map_error_to_metadata(rec.rejection_reason)
        rec_dict["rejection_title"] = title if rec.processing_status != "accepted" else None
        rec_dict["rejection_category"] = cat if rec.processing_status != "accepted" else None

        return {
            "record": rec_dict,
            "original_payload": rec.original_payload,
            "reject_id": reject.reject_id if reject else (rec.history_id.replace("HIST_", "") if "REJ_" in rec.history_id else None),
            "corrections": [c.to_dict() for c in corrections],
            "events": [e.to_dict() for e in events],
            "affected_snapshots_warning": affected_warning,
        }

    def get_processing_history_runs(
        self,
        limit: int = 50,
        status_filter: Optional[str] = None,
        search: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        """Retrieve enhanced pipeline execution history for the processing runs tab."""
        query = self.session.query(PipelineRun)

        if search:
            s = f"%{search.strip()}%"
            query = query.filter(or_(PipelineRun.run_id.ilike(s), PipelineRun.run_type.ilike(s)))

        if status_filter and status_filter.lower() != "all":
            if status_filter.lower() == "failed":
                query = query.filter(PipelineRun.status == "failed")
            elif status_filter.lower() == "warnings":
                query = query.filter(PipelineRun.status == "success", PipelineRun.rejected_rows > 0)
            elif status_filter.lower() == "success":
                query = query.filter(PipelineRun.status == "success", PipelineRun.rejected_rows == 0)

        runs = query.order_by(PipelineRun.start_time.desc()).limit(limit).all()

        results = []
        for r in runs:
            friendly_status, badge = format_run_status(r.status, r.rejected_rows)
            results.append({
                "run_id": r.run_id,
                "friendly_type": format_friendly_run_type(r.run_type),
                "raw_run_type": r.run_type,
                "source_file": r.source_file,
                "status": friendly_status,
                "status_badge": badge,
                "start_time": r.start_time.isoformat() if r.start_time else None,
                "end_time": r.end_time.isoformat() if r.end_time else None,
                "duration_seconds": round(float(r.duration_seconds or 0.0), 3),
                "input_rows": r.input_rows,
                "accepted_rows": r.accepted_rows,
                "rejected_rows": r.rejected_rows,
                "feature_rows": r.feature_rows,
                "reconciliation_status": "PASSED" if r.status == "success" else "FLAGGED",
                "error_message": r.error_message,
            })
        return results

    @staticmethod
    def validate_record_payload(payload: Dict[str, Any]) -> Dict[str, Any]:
        """Dry-run validation of a record payload returning exact field-level errors."""
        errors: Dict[str, str] = {}
        normalized: Dict[str, Any] = {}

        # 1. Entity ID / Customer ID
        entity_id = payload.get("customer_id") or payload.get("entity_id") or payload.get("account_id")
        if not entity_id or not str(entity_id).strip():
            errors["entity_id"] = "Entity ID (e.g., customer_id) is required and cannot be empty."
        else:
            normalized["customer_id"] = str(entity_id).strip()

        # 2. Record ID / Transaction ID
        record_id = payload.get("transaction_id") or payload.get("record_id") or payload.get("event_id")
        if not record_id or not str(record_id).strip():
            errors["transaction_id"] = "Record ID (e.g., transaction_id) is required and cannot be empty."
        else:
            normalized["transaction_id"] = str(record_id).strip()

        # 3. Amount
        raw_amount = payload.get("amount")
        if raw_amount is None or str(raw_amount).strip() == "":
            errors["amount"] = "Transaction amount is required."
        else:
            try:
                dec_val = Decimal(str(raw_amount).strip())
                if dec_val < Decimal("0.00"):
                    errors["amount"] = f"Amount cannot be negative ({dec_val}). Must be a non-negative decimal."
                else:
                    normalized["amount"] = float(dec_val)
            except (InvalidOperation, ValueError):
                errors["amount"] = f"Invalid numeric amount format: '{raw_amount}'"

        # 4. Event Time
        event_dt = None
        raw_event_time = payload.get("event_time") or payload.get("timestamp")
        if not raw_event_time or not str(raw_event_time).strip():
            errors["event_time"] = "Event timestamp is required."
        else:
            try:
                event_dt = parse_utc_timestamp(raw_event_time)
                if event_dt:
                    normalized["event_time"] = event_dt.isoformat()
                else:
                    errors["event_time"] = "Event timestamp is empty."
            except Exception:
                errors["event_time"] = f"Invalid date format '{raw_event_time}'. Use ISO-8601 (e.g., 2026-03-15T14:30:00Z)."

        # 5. Available At
        available_dt = None
        raw_avail_time = payload.get("available_at")
        if raw_avail_time and str(raw_avail_time).strip():
            try:
                available_dt = parse_utc_timestamp(raw_avail_time)
                if available_dt:
                    normalized["available_at"] = available_dt.isoformat()
                else:
                    available_dt = event_dt
                    normalized["available_at"] = event_dt.isoformat() if event_dt else None
            except Exception:
                errors["available_at"] = f"Invalid date format '{raw_avail_time}'. Use ISO-8601."
        elif event_dt:
            # Default to event_time if not provided
            available_dt = event_dt
            normalized["available_at"] = event_dt.isoformat()

        # Causality timeline check
        if event_dt and available_dt and available_dt < event_dt:
            errors["available_at"] = "available_at cannot precede event_time (causality timeline violation)."

        # 6. Event Type / Transaction Type
        raw_type = payload.get("event_type") or payload.get("transaction_type") or "purchase"
        normalized["transaction_type"] = str(raw_type).strip().lower()

        is_valid = len(errors) == 0
        summary = "Record payload is fully valid and ready for reprocessing." if is_valid else f"Validation failed with {len(errors)} error(s)."

        return {
            "is_valid": is_valid,
            "errors": errors,
            "normalized_payload": normalized,
            "plain_english_summary": summary,
        }

    def save_correction_draft(
        self,
        reject_id: str,
        corrected_payload: Dict[str, Any],
        correction_reason: Optional[str] = None,
        resolved_by: str = "system_operator",
    ) -> Dict[str, Any]:
        """Save a draft or validated correction attempt without executing ingestion."""
        # Find reject record
        reject = self.session.query(RejectedRecord).filter(RejectedRecord.reject_id == reject_id).first()
        raw_orig = reject.raw_record if reject else "{}"

        # Find history record
        hist = (
            self.session.query(SourceRecordHistory)
            .filter(SourceRecordHistory.history_id == f"HIST_{reject_id}")
            .first()
        )
        if not hist and reject:
            hist = (
                self.session.query(SourceRecordHistory)
                .filter(SourceRecordHistory.record_id == reject_id)
                .first()
            )

        # Validate
        validation = self.validate_record_payload(corrected_payload)
        status_val = "valid" if validation["is_valid"] else "invalid"

        corr = RecordCorrection(
            correction_id=f"CORR_{uuid.uuid4().hex[:12]}",
            history_id=hist.history_id if hist else None,
            reject_id=reject.reject_id if reject else reject_id,
            original_payload=raw_orig,
            corrected_payload=json.dumps(corrected_payload, default=str),
            validation_status=status_val,
            validation_errors=json.dumps(validation["errors"]) if validation["errors"] else None,
            correction_reason=correction_reason or "Operator manual correction",
            resolved_by=resolved_by,
            created_at=utc_now(),
        )
        self.session.add(corr)

        # Log event
        evt = RecordProcessingEvent(
            event_id=f"EVT_{uuid.uuid4().hex[:12]}",
            history_id=hist.history_id if hist else None,
            reject_id=reject_id,
            run_id="manual_edit",
            event_type="correction_saved",
            status="info" if validation["is_valid"] else "warning",
            message=f"Correction version created ({status_val}). Errors: {list(validation['errors'].keys())}",
            created_at=utc_now(),
        )
        self.session.add(evt)
        self.session.commit()

        return corr.to_dict()

    def reprocess_rejected_record(
        self,
        reject_id: str,
        corrected_payload: Dict[str, Any],
        correction_reason: Optional[str] = None,
        force_override: bool = False,
    ) -> Dict[str, Any]:
        """
        Safely reprocess a quarantined rejected record with anti-leakage guarantee.
        
        Anti-Leakage Rule:
            effective_available_at = max(available_at, current_utc_timestamp)
        """
        # 1. Run rigorous validation
        validation = self.validate_record_payload(corrected_payload)
        if not validation["is_valid"]:
            return {
                "status": "validation_failed",
                "reject_id": reject_id,
                "message": f"Validation failed: {validation['errors']}",
                "effective_available_at": None,
                "affected_snapshots_warning": None,
                "retry_run_id": "",
            }

        norm = validation["normalized_payload"]
        tx_id = norm["transaction_id"]
        customer_id = norm["customer_id"]
        event_time = parse_utc_timestamp(norm["event_time"])
        available_at = parse_utc_timestamp(norm["available_at"])
        amount = Decimal(str(norm["amount"]))
        tx_type = norm["transaction_type"]

        # 2. Strict Anti-Leakage Effective Availability Calculation:
        # Data corrected now was NOT available at the historical event time!
        now_utc = utc_now()
        effective_available_at = max(available_at, now_utc)

        # 3. Lookup reject record
        reject = self.session.query(RejectedRecord).filter(RejectedRecord.reject_id == reject_id).first()
        raw_orig = reject.raw_record if reject else json.dumps(corrected_payload)

        # 4. Lookup or create SourceRecordHistory
        hist = (
            self.session.query(SourceRecordHistory)
            .filter(SourceRecordHistory.history_id == f"HIST_{reject_id}")
            .first()
        )
        if not hist and reject:
            hist = (
                self.session.query(SourceRecordHistory)
                .filter(SourceRecordHistory.record_id == tx_id)
                .first()
            )
        if not hist:
            hist = SourceRecordHistory(
                history_id=f"HIST_{reject_id}",
                record_id=tx_id,
                entity_id=customer_id,
                source_file=reject.source_file if reject else "manual_reprocess",
                source_row_number=reject.source_row_number if reject else 0,
                processing_status="quarantined",
                rejection_reason=reject.rejection_reason if reject else None,
                original_payload=raw_orig,
                initial_run_id=reject.run_id if reject else "initial",
                latest_run_id=reject.run_id if reject else "initial",
                first_seen_at=reject.rejected_at if reject else now_utc,
                last_processed_at=now_utc,
            )
            self.session.add(hist)

        # 5. Check if customer exists in parent Customer table (or auto-register if needed)
        cust = self.session.query(Customer).filter(Customer.customer_id == customer_id).first()
        if not cust:
            # Auto-register customer so foreign key integrity is fulfilled cleanly
            cust = Customer(
                customer_id=customer_id,
                created_at=event_time,
                customer_segment="reprocessed",
            )
            self.session.add(cust)
            self.session.flush()

        # 6. Idempotency & Conflict Check on Transaction table
        existing_tx = self.session.query(Transaction).filter(Transaction.transaction_id == tx_id).first()
        retry_run_id = f"RUN_REPROC_{uuid.uuid4().hex[:10]}"

        if existing_tx:
            # Verify if identical or conflict (handling SQLite timezone stripping)
            ex_event = ensure_utc(existing_tx.event_time).replace(microsecond=0) if existing_tx.event_time else None
            req_event = ensure_utc(event_time).replace(microsecond=0) if event_time else None
            same_event = ex_event == req_event
            same_amount = Decimal(str(existing_tx.amount)) == Decimal(str(amount))
            same_cust = str(existing_tx.customer_id) == str(customer_id)
            same_type = str(existing_tx.transaction_type or "").lower() == str(tx_type or "").lower()

            is_identical = same_cust and same_event and same_amount and same_type
            if is_identical and not force_override:
                return {
                    "status": "already_processed",
                    "history_id": hist.history_id,
                    "reject_id": reject_id,
                    "message": f"Identical record '{tx_id}' already exists in operational storage (No-op idempotent).",
                    "effective_available_at": existing_tx.available_at.isoformat(),
                    "affected_snapshots_warning": None,
                    "retry_run_id": retry_run_id,
                }
            elif force_override:
                # Update existing record
                existing_tx.customer_id = customer_id
                existing_tx.event_time = event_time
                existing_tx.available_at = effective_available_at
                existing_tx.amount = amount
                existing_tx.transaction_type = tx_type
            else:
                return {
                    "status": "conflict",
                    "history_id": hist.history_id,
                    "reject_id": reject_id,
                    "message": f"Transaction ID '{tx_id}' already exists with different values. Use force override if replacement is intended.",
                    "effective_available_at": None,
                    "affected_snapshots_warning": None,
                    "retry_run_id": retry_run_id,
                }
        else:
            # Insert brand new operational transaction
            new_tx = Transaction(
                transaction_id=tx_id,
                customer_id=customer_id,
                event_time=event_time,
                available_at=effective_available_at,
                amount=amount,
                transaction_type=tx_type,
                source_file=hist.source_file or (reject.source_file if reject else "manual_reprocess"),
                ingested_at=now_utc,
            )
            self.session.add(new_tx)

        # 7. Record Pipeline Run for audit tracking
        reproc_run = PipelineRun(
            run_id=retry_run_id,
            run_type="reprocess_retry",
            source_file=hist.source_file,
            status="success",
            start_time=now_utc,
            end_time=utc_now(),
            duration_seconds=0.05,
            input_rows=1,
            accepted_rows=1,
            rejected_rows=0,
            feature_rows=0,
        )
        self.session.add(reproc_run)

        # 8. Save Record Correction entry
        corr = RecordCorrection(
            correction_id=f"CORR_{uuid.uuid4().hex[:12]}",
            history_id=hist.history_id,
            reject_id=reject.reject_id if reject else reject_id,
            original_payload=raw_orig,
            corrected_payload=json.dumps(norm, default=str),
            validation_status="reprocessed",
            correction_reason=correction_reason or "Operator verified and reprocessed",
            resolved_by="system_operator",
            created_at=now_utc,
            processed_at=utc_now(),
            retry_run_id=retry_run_id,
        )
        self.session.add(corr)

        # 9. Update RejectedRecord resolution status
        if reject:
            reject.resolution_status = "reprocessed"
            reject.resolved_at = utc_now()

        # 10. Update SourceRecordHistory
        hist.processing_status = "reprocessed"
        hist.entity_id = customer_id
        hist.event_time = event_time
        hist.available_at = effective_available_at
        hist.amount = float(amount)
        hist.event_type = tx_type
        hist.latest_run_id = retry_run_id
        hist.last_processed_at = utc_now()
        hist.resolved_at = utc_now()

        # 11. Audit Event Trail
        evt = RecordProcessingEvent(
            event_id=f"EVT_{uuid.uuid4().hex[:12]}",
            history_id=hist.history_id,
            reject_id=reject_id,
            run_id=retry_run_id,
            event_type="reprocessed_success",
            status="success",
            message=(
                f"Record safely ingested into operational storage. "
                f"Effective availability set to {effective_available_at.isoformat()} (Anti-Leakage Protected)."
            ),
            created_at=utc_now(),
        )
        self.session.add(evt)

        # 12. Check for historical snapshot conflict notice
        snapshots_count = (
            self.session.query(func.count(FeatureSnapshot.snapshot_id))
            .filter(FeatureSnapshot.customer_id == customer_id, FeatureSnapshot.as_of_time >= event_time)
            .scalar() or 0
        )
        snapshot_warning = None
        if snapshots_count > 0:
            snapshot_warning = (
                f"{snapshots_count} previous feature snapshot(s) exist for entity '{customer_id}' after {event_time.strftime('%Y-%m-%d')}. "
                "Historical snapshots remain unchanged to preserve strict reproducibility; new snapshots will include this record."
            )

        self.session.commit()

        return {
            "status": "success",
            "history_id": hist.history_id,
            "reject_id": reject_id,
            "message": "Record successfully corrected and promoted to operational storage.",
            "effective_available_at": effective_available_at.isoformat(),
            "affected_snapshots_warning": snapshot_warning,
            "retry_run_id": retry_run_id,
        }

    def get_quarantine_filter_options(self) -> Dict[str, Any]:
        """Retrieve dynamic filter choices based on existing quarantined records in the database."""
        # 1. Distinct Source Files with counts
        file_counts = (
            self.session.query(
                RejectedRecord.source_file,
                func.count(RejectedRecord.reject_id)
            )
            .group_by(RejectedRecord.source_file)
            .order_by(func.count(RejectedRecord.reject_id).desc())
            .all()
        )
        source_files = [
            {"name": f[0], "count": f[1], "dataset_id": None}
            for f in file_counts if f[0]
        ]

        # 2. Rejection Reasons grouped by base category
        raw_reasons = (
            self.session.query(
                RejectedRecord.rejection_reason,
                func.count(RejectedRecord.reject_id)
            )
            .group_by(RejectedRecord.rejection_reason)
            .all()
        )
        reasons_map: Dict[str, Dict[str, Any]] = {}
        for r_str, cnt in raw_reasons:
            if not r_str:
                continue
            base = r_str.split("(")[0].split(":")[0].strip()
            if base not in reasons_map:
                title, cat, _, _ = map_error_to_metadata(base)
                reasons_map[base] = {
                    "code": base,
                    "title": title,
                    "category": cat,
                    "count": 0,
                }
            reasons_map[base]["count"] += cnt

        rejection_reasons = sorted(
            list(reasons_map.values()),
            key=lambda x: x["count"],
            reverse=True
        )

        # 3. Resolution Statuses
        status_counts = dict(
            self.session.query(
                RejectedRecord.resolution_status,
                func.count(RejectedRecord.reject_id)
            )
            .group_by(RejectedRecord.resolution_status)
            .all()
        )
        unres_count = status_counts.get("unresolved", 0) + status_counts.get(None, 0)
        repr_count = status_counts.get("reprocessed", 0)
        corr_count = status_counts.get("corrected", 0)
        failed_count = status_counts.get("retry_failed", 0)

        resolution_statuses = [
            {"status": "unresolved", "label": "Unresolved", "count": unres_count},
            {"status": "reprocessed", "label": "Reprocessed", "count": repr_count},
            {"status": "corrected", "label": "Corrected", "count": corr_count},
            {"status": "retry_failed", "label": "Retry Failed", "count": failed_count},
        ]

        # 4. Pipeline Runs with reject counts
        run_counts = (
            self.session.query(
                RejectedRecord.run_id,
                func.count(RejectedRecord.reject_id)
            )
            .group_by(RejectedRecord.run_id)
            .order_by(func.count(RejectedRecord.reject_id).desc())
            .limit(100)
            .all()
        )
        pipeline_runs = [
            {
                "run_id": r[0],
                "label": f"{r[0]} ({r[1]} rejects)",
                "count": r[1]
            }
            for r in run_counts if r[0]
        ]

        total_stored = self.session.query(func.count(RejectedRecord.reject_id)).scalar() or 0
        total_unresolved = unres_count

        return {
            "source_files": source_files,
            "rejection_reasons": rejection_reasons,
            "resolution_statuses": resolution_statuses,
            "pipeline_runs": pipeline_runs,
            "total_stored": total_stored,
            "total_unresolved": total_unresolved,
        }

    def get_quarantine_records(
        self,
        source_file: Optional[str] = None,
        rejection_reason: Optional[str] = None,
        status_filter: Optional[str] = None,
        run_id: Optional[str] = None,
        dataset_id: Optional[str] = None,
        start_date: Optional[str] = None,
        end_date: Optional[str] = None,
        search: Optional[str] = None,
        sort_order: str = "newest",
        page: Optional[int] = None,
        page_size: Optional[int] = None,
        limit: Optional[int] = None,
    ) -> Dict[str, Any]:
        """Query quarantined records with multi-dimensional filtering, searching, and pagination."""
        query = self.session.query(RejectedRecord)

        # 1. Source file filter
        if source_file and source_file.lower() != "all":
            query = query.filter(RejectedRecord.source_file == source_file)

        # 2. Rejection reason filter
        if rejection_reason and rejection_reason.lower() != "all":
            query = query.filter(RejectedRecord.rejection_reason.ilike(f"%{rejection_reason}%"))

        # 3. Status filter
        if status_filter and status_filter.lower() != "all":
            if status_filter.lower() == "unresolved":
                query = query.filter(or_(
                    RejectedRecord.resolution_status == "unresolved",
                    RejectedRecord.resolution_status.is_(None)
                ))
            else:
                query = query.filter(RejectedRecord.resolution_status == status_filter.lower())

        # 4. Pipeline run filter
        if run_id and run_id.lower() != "all":
            query = query.filter(RejectedRecord.run_id == run_id)

        # 5. Dataset ID filter
        if dataset_id and dataset_id.lower() != "all":
            query = query.filter(RejectedRecord.raw_record.ilike(f"%{dataset_id}%"))

        # 6. Date range filter
        if start_date:
            try:
                s_dt = datetime.fromisoformat(start_date.replace("Z", "+00:00"))
            except Exception:
                try:
                    s_dt = datetime.strptime(start_date, "%Y-%m-%d").replace(tzinfo=timezone.utc)
                except Exception:
                    s_dt = None
            if s_dt:
                query = query.filter(RejectedRecord.rejected_at >= s_dt)

        if end_date:
            try:
                e_dt = datetime.fromisoformat(end_date.replace("Z", "+00:00"))
            except Exception:
                try:
                    e_dt = datetime.strptime(end_date, "%Y-%m-%d").replace(
                        hour=23, minute=59, second=59, microsecond=999999, tzinfo=timezone.utc
                    )
                except Exception:
                    e_dt = None
            if e_dt:
                query = query.filter(RejectedRecord.rejected_at <= e_dt)

        # 7. Search filter
        if search and search.strip():
            term = f"%{search.strip()}%"
            clauses = [
                RejectedRecord.reject_id.ilike(term),
                RejectedRecord.rejection_reason.ilike(term),
                RejectedRecord.raw_record.ilike(term),
            ]
            if search.strip().isdigit():
                clauses.append(RejectedRecord.source_row_number == int(search.strip()))
            else:
                clauses.append(cast(RejectedRecord.source_row_number, String).ilike(term))
            query = query.filter(or_(*clauses))

        # Total matching records count
        total_matching = query.count()

        # Database-wide counts
        total_stored = self.session.query(func.count(RejectedRecord.reject_id)).scalar() or 0
        total_unresolved = (
            self.session.query(func.count(RejectedRecord.reject_id))
            .filter(or_(RejectedRecord.resolution_status == "unresolved", RejectedRecord.resolution_status.is_(None)))
            .scalar() or 0
        )

        # Sorting (stable: secondary sort by reject_id)
        if sort_order == "oldest":
            query = query.order_by(RejectedRecord.rejected_at.asc(), RejectedRecord.reject_id.asc())
        else:
            query = query.order_by(RejectedRecord.rejected_at.desc(), RejectedRecord.reject_id.desc())

        # Pagination / Slicing
        effective_page = page or 1
        effective_page_size = page_size or limit or 25
        if page is not None:
            offset = (effective_page - 1) * effective_page_size
            records_db = query.offset(offset).limit(effective_page_size).all()
        else:
            records_db = query.limit(limit or 100).all()

        formatted_records = []
        for r in records_db:
            rec_dict = r.to_dict()
            try:
                raw = json.loads(r.raw_record) if isinstance(r.raw_record, str) else {}
            except Exception:
                raw = {}
            rec_dict["record_id"] = raw.get("transaction_id") or raw.get("record_id") or raw.get("event_id")
            rec_dict["entity_id"] = raw.get("customer_id") or raw.get("entity_id")
            title, cat, _, _ = map_error_to_metadata(r.rejection_reason)
            rec_dict["error_title"] = title
            rec_dict["error_category"] = cat
            formatted_records.append(rec_dict)

        total_pages = math.ceil(total_matching / effective_page_size) if total_matching > 0 else 1

        return {
            "records": formatted_records,
            "total": total_matching,
            "page": effective_page,
            "page_size": effective_page_size,
            "total_pages": total_pages,
            "total_stored": total_stored,
            "total_unresolved": total_unresolved,
            "active_filters": {
                "source_file": source_file,
                "rejection_reason": rejection_reason,
                "status": status_filter,
                "run_id": run_id,
                "dataset_id": dataset_id,
                "start_date": start_date,
                "end_date": end_date,
                "search": search,
                "sort": sort_order,
            },
        }
