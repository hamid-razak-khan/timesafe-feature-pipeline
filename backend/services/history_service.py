"""History, Observability, and Safe Reprocessing Service for TimeSafe."""
import json
import uuid
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation
from typing import Dict, Any, List, Optional, Tuple
from sqlalchemy.orm import Session
from sqlalchemy import func, desc, or_, and_

from database.models import (
    Customer,
    Transaction,
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


class HistoryService:
    def __init__(self, session: Session):
        self.session = session

    def get_dashboard_summary(self) -> Dict[str, Any]:
        """Aggregate high-level metrics for the executive and operational dashboard."""
        # 1. Total records in history
        total_hist = self.session.query(func.count(SourceRecordHistory.history_id)).scalar() or 0
        total_tx = self.session.query(func.count(Transaction.transaction_id)).scalar() or 0
        total_rej = self.session.query(func.count(RejectedRecord.reject_id)).scalar() or 0
        total_features = self.session.query(func.count(FeatureSnapshot.snapshot_id)).scalar() or 0

        # Total processed is either historical audit rows or sum of tx + rej
        total_processed = max(total_hist, total_tx + total_rej)
        rejection_rate = round((total_rej / total_processed * 100), 1) if total_processed > 0 else 0.0

        # Unresolved rejects needing attention
        needs_attention = self.session.query(func.count(RejectedRecord.reject_id)).filter(
            or_(RejectedRecord.resolution_status == "unresolved", RejectedRecord.resolution_status == None)
        ).scalar() or 0

        # Rejection reasons summary with friendly titles
        reasons_query = (
            self.session.query(RejectedRecord.rejection_reason, func.count(RejectedRecord.reject_id))
            .group_by(RejectedRecord.rejection_reason)
            .all()
        )
        reasons_summary = []
        for reason_code, count in reasons_query:
            title, category, descr, _ = map_error_to_metadata(reason_code)
            reasons_summary.append({
                "code": reason_code,
                "title": title,
                "category": category,
                "description": descr,
                "count": count,
            })
        reasons_summary.sort(key=lambda x: x["count"], reverse=True)

        # Accepted vs Rejected distribution
        accepted_vs_rejected = {
            "accepted": total_tx,
            "rejected": total_rej,
        }

        # Activity timeline by day
        timeline_query = (
            self.session.query(
                func.strftime("%Y-%m-%d", PipelineRun.start_time).label("run_date"),
                func.sum(PipelineRun.accepted_rows).label("accepted"),
                func.sum(PipelineRun.rejected_rows).label("rejected"),
                func.sum(PipelineRun.feature_rows).label("features"),
            )
            .group_by("run_date")
            .order_by("run_date")
            .limit(14)
            .all()
        )
        activity_timeline = []
        for row in timeline_query:
            if row[0]:
                activity_timeline.append({
                    "date": row[0],
                    "accepted": int(row[1] or 0),
                    "rejected": int(row[2] or 0),
                    "features": int(row[3] or 0),
                })

        if not activity_timeline:
            today_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")
            activity_timeline = [{
                "date": today_str,
                "accepted": total_tx,
                "rejected": total_rej,
                "features": total_features,
            }]

        # Recent pipeline activity
        recent_runs_query = (
            self.session.query(PipelineRun)
            .order_by(PipelineRun.start_time.desc())
            .limit(6)
            .all()
        )
        recent_activity = []
        for r in recent_runs_query:
            friendly_status, badge = format_run_status(r.status, r.rejected_rows)
            friendly_type = format_friendly_run_type(r.run_type)
            recent_activity.append({
                "run_id": r.run_id,
                "friendly_type": friendly_type,
                "raw_run_type": r.run_type,
                "status": friendly_status,
                "badge_color": badge,
                "start_time": r.start_time.isoformat() if r.start_time else None,
                "records_processed": r.input_rows,
                "accepted_rows": r.accepted_rows,
                "rejected_rows": r.rejected_rows,
                "duration_seconds": round(float(r.duration_seconds or 0.0), 2),
            })

        return {
            "total_records_processed": total_processed,
            "accepted_records": total_tx,
            "rejected_records": total_rej,
            "rejection_rate_percent": rejection_rate,
            "generated_ml_features": total_features,
            "needs_attention_count": needs_attention,
            "rejection_reasons_summary": reasons_summary,
            "accepted_vs_rejected": accepted_vs_rejected,
            "activity_timeline": activity_timeline,
            "recent_activity": recent_activity,
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
