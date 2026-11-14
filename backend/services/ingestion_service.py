"""Ingestion Service for TimeSafe Feature Pipeline.

Performs robust, chunked CSV ingestion with strict schema verification,
quarantine routing for defective records, conflict-aware idempotency,
and atomic database transactions.
"""
import os
import csv
import uuid
import json
import logging
from datetime import datetime, timezone
from decimal import Decimal
from typing import Dict, Any, List, Optional
from sqlalchemy.orm import Session
from sqlalchemy import select

from database.models import (
    Customer,
    Transaction,
    PredictionRequest,
    PipelineRun,
    RejectedRecord,
    SourceRecordHistory,
    RecordProcessingEvent,
    utc_now,
    ensure_utc,
)
from backend.services.validation_service import ValidationService

logger = logging.getLogger("timesafe.ingestion")


class IngestionService:
    """Orchestrates source data ingestion, quarantine logging, and reconciliation metrics."""

    def __init__(self, session: Session):
        self.session = session

    def _create_pipeline_run(self, run_type: str, source_file: str) -> PipelineRun:
        """Initialize an operational pipeline_run record committed immediately as running."""
        run_id = f"RUN_{datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')}_{uuid.uuid4().hex[:6]}"
        run = PipelineRun(
            run_id=run_id,
            run_type=run_type,
            source_file=source_file,
            status="running",
            start_time=utc_now(),
            input_rows=0,
            accepted_rows=0,
            rejected_rows=0,
            feature_rows=0,
            duration_seconds=0.0,
        )
        self.session.add(run)
        self.session.commit()
        return run

    def _record_rejection(
        self,
        run_id: str,
        source_file: str,
        row_number: int,
        raw_record: Any,
        reason: str,
    ) -> RejectedRecord:
        """Log a rejected record to the operational quarantine table and history audit."""
        raw_str = raw_record if isinstance(raw_record, str) else json.dumps(raw_record, default=str)
        reject = RejectedRecord(
            reject_id=f"REJ_{uuid.uuid4().hex[:12]}",
            run_id=run_id,
            source_file=source_file,
            source_row_number=row_number,
            raw_record=raw_str,
            rejection_reason=reason,
            resolution_status="unresolved",
            rejected_at=utc_now(),
        )
        self.session.add(reject)

        # Parse entity and record ID if available from payload
        entity = None
        record_id = None
        try:
            payload = json.loads(raw_str) if raw_str.strip().startswith("{") else {}
            entity = payload.get("customer_id") or payload.get("entity_id") or payload.get("account_id")
            record_id = payload.get("transaction_id") or payload.get("event_id") or payload.get("record_id")
        except Exception:
            pass

        history = SourceRecordHistory(
            history_id=f"HIST_{reject.reject_id}",
            record_id=str(record_id) if record_id else reject.reject_id,
            entity_id=str(entity) if entity else None,
            source_file=source_file,
            source_row_number=row_number,
            processing_status="rejected",
            rejection_reason=reason,
            original_payload=raw_str,
            initial_run_id=run_id,
            latest_run_id=run_id,
            first_seen_at=utc_now(),
            last_processed_at=utc_now(),
        )
        self.session.add(history)

        evt = RecordProcessingEvent(
            event_id=f"EVT_{uuid.uuid4().hex[:12]}",
            history_id=history.history_id,
            reject_id=reject.reject_id,
            run_id=run_id,
            event_type="quarantined",
            status="warning",
            message=f"Quarantined: {reason}",
            created_at=utc_now(),
        )
        self.session.add(evt)
        return reject

    def ingest_customers(self, file_path: str, run_id: Optional[str] = None) -> Dict[str, Any]:
        """Ingest customers from CSV."""
        source_name = os.path.basename(file_path)
        run = self._create_pipeline_run("ingest_customers", source_name) if not run_id else (
            self.session.query(PipelineRun).filter(PipelineRun.run_id == run_id).first()
        )

        input_rows = 0
        inserted_rows = 0
        noop_rows = 0
        rejected_rows = 0
        seen_in_batch = set()

        if not os.path.exists(file_path):
            err = f"File not found: {file_path}"
            if run:
                run.status = "failed"
                run.end_time = utc_now()
                run.error_message = err
                self.session.commit()
            return {"status": "failed", "error": err}

        # Check existing customers in DB for idempotency
        existing_customers = {
            c.customer_id: c.created_at
            for c in self.session.query(Customer).all()
        }

        try:
            with open(file_path, "r", encoding="utf-8-sig") as f:
                reader = csv.DictReader(f)
                if reader.fieldnames is None:
                    # Empty file
                    run.status = "success"
                    run.end_time = utc_now()
                    self.session.commit()
                    return {
                        "status": "success",
                        "run_id": run.run_id,
                        "input_rows": 0,
                        "inserted_rows": 0,
                        "noop_rows": 0,
                        "rejected_rows": 0,
                    }

                is_schema_valid, schema_err = ValidationService.validate_customer_schema(reader.fieldnames)
                if not is_schema_valid:
                    run.status = "failed"
                    run.end_time = utc_now()
                    run.error_message = schema_err
                    self.session.commit()
                    return {"status": "failed", "error": schema_err, "run_id": run.run_id}

                for row_idx, row in enumerate(reader, start=2):
                    input_rows += 1
                    val_result = ValidationService.validate_customer_row(row, seen_in_batch)
                    if not val_result.is_valid:
                        rejected_rows += 1
                        self._record_rejection(
                            run.run_id, source_name, row_idx, row, val_result.rejection_reason
                        )
                        continue

                    data = val_result.cleaned_data
                    cust_id = data["customer_id"]
                    seen_in_batch.add(cust_id)

                    if cust_id in existing_customers:
                        noop_rows += 1
                    else:
                        customer_obj = Customer(
                            customer_id=cust_id,
                            created_at=data["created_at"],
                            customer_segment=data["customer_segment"],
                        )
                        self.session.add(customer_obj)
                        existing_customers[cust_id] = data["created_at"]
                        inserted_rows += 1

            run.status = "success"
            run.end_time = utc_now()
            run.input_rows = input_rows
            run.accepted_rows = inserted_rows + noop_rows
            run.rejected_rows = rejected_rows
            start = ensure_utc(run.start_time) or utc_now()
            end = ensure_utc(run.end_time) or utc_now()
            run.duration_seconds = max(0.0, (end - start).total_seconds())
            self.session.commit()

            return {
                "status": "success",
                "run_id": run.run_id,
                "input_rows": input_rows,
                "inserted_rows": inserted_rows,
                "noop_rows": noop_rows,
                "rejected_rows": rejected_rows,
                "duration_seconds": run.duration_seconds,
            }
        except Exception as e:
            self.session.rollback()
            run_in_db = self.session.query(PipelineRun).filter(PipelineRun.run_id == run.run_id).first()
            if run_in_db:
                run_in_db.status = "failed"
                run_in_db.end_time = utc_now()
                run_in_db.error_message = str(e)
                self.session.commit()
            raise

    def ingest_transactions(self, file_path: str, run_id: Optional[str] = None) -> Dict[str, Any]:
        """Ingest transactions from CSV with chunking, validation, and conflict-aware idempotency."""
        source_name = os.path.basename(file_path)
        run = self._create_pipeline_run("ingest_transactions", source_name) if not run_id else (
            self.session.query(PipelineRun).filter(PipelineRun.run_id == run_id).first()
        )

        input_rows = 0
        inserted_rows = 0
        noop_rows = 0
        rejected_rows = 0
        seen_tx_in_batch = set()
        history_batch = []

        if not os.path.exists(file_path):
            err = f"File not found: {file_path}"
            if run:
                run.status = "failed"
                run.end_time = utc_now()
                run.error_message = err
                self.session.commit()
            return {"status": "failed", "error": err}

        # Cache known customers for referential integrity
        known_customers = {
            c.customer_id: c.created_at
            for c in self.session.query(Customer.customer_id, Customer.created_at).all()
        }

        # Cache existing transaction signatures for conflict & idempotency detection
        existing_txs = {
            t.transaction_id: (
                t.customer_id,
                t.event_time,
                t.available_at,
                Decimal(str(t.amount)),
                t.transaction_type,
            )
            for t in self.session.query(
                Transaction.transaction_id,
                Transaction.customer_id,
                Transaction.event_time,
                Transaction.available_at,
                Transaction.amount,
                Transaction.transaction_type,
            ).all()
        }

        try:
            with open(file_path, "r", encoding="utf-8-sig") as f:
                reader = csv.DictReader(f)
                if reader.fieldnames is None:
                    # Empty file
                    run.status = "success"
                    run.end_time = utc_now()
                    self.session.commit()
                    return {
                        "status": "success",
                        "run_id": run.run_id,
                        "input_rows": 0,
                        "inserted_rows": 0,
                        "noop_rows": 0,
                        "rejected_rows": 0,
                    }

                is_schema_valid, schema_err = ValidationService.validate_transaction_schema(reader.fieldnames)
                if not is_schema_valid:
                    run.status = "failed"
                    run.end_time = utc_now()
                    run.error_message = schema_err
                    self.session.commit()
                    return {"status": "failed", "error": schema_err, "run_id": run.run_id}

                batch = []
                BATCH_SIZE = 1000

                for row_idx, row in enumerate(reader, start=2):
                    input_rows += 1
                    val_result = ValidationService.validate_transaction_row(
                        row=row,
                        known_customers=known_customers,
                        seen_tx_ids=seen_tx_in_batch,
                        source_file=source_name,
                    )

                    if not val_result.is_valid:
                        rejected_rows += 1
                        self._record_rejection(
                            run_id=run.run_id,
                            source_file=source_name,
                            row_number=row_idx,
                            raw_record=row,
                            reason=val_result.rejection_reason,
                        )
                        continue

                    data = val_result.cleaned_data
                    tx_id = data["transaction_id"]
                    seen_tx_in_batch.add(tx_id)

                    # Check against existing DB records
                    if tx_id in existing_txs:
                        existing_sig = existing_txs[tx_id]
                        new_sig = (
                            data["customer_id"],
                            data["event_time"],
                            data["available_at"],
                            data["amount"],
                            data["transaction_type"],
                        )
                        existing_event = existing_sig[1]
                        if existing_event.tzinfo is None:
                            existing_event = existing_event.replace(tzinfo=timezone.utc)
                        existing_avail = existing_sig[2]
                        if existing_avail.tzinfo is None:
                            existing_avail = existing_avail.replace(tzinfo=timezone.utc)
                        new_event = data["event_time"]
                        if new_event.tzinfo is None:
                            new_event = new_event.replace(tzinfo=timezone.utc)
                        new_avail = data["available_at"]
                        if new_avail.tzinfo is None:
                            new_avail = new_avail.replace(tzinfo=timezone.utc)

                        same_event = existing_event.replace(microsecond=0) == new_event.replace(microsecond=0)
                        same_avail = existing_avail.replace(microsecond=0) == new_avail.replace(microsecond=0)
                        same_amount = existing_sig[3] == new_sig[3]
                        same_cust = existing_sig[0] == new_sig[0]
                        same_type = existing_sig[4] == new_sig[4]

                        if same_cust and same_event and same_avail and same_amount and same_type:
                            # Identical record re-ingested -> safe NO-OP
                            noop_rows += 1
                        else:
                            # Conflicting record with duplicate ID -> Quarantine
                            rejected_rows += 1
                            self._record_rejection(
                                run_id=run.run_id,
                                source_file=source_name,
                                row_number=row_idx,
                                raw_record=row,
                                reason="CONFLICTING_PRIMARY_KEY: Transaction ID exists with differing attributes",
                            )
                        continue

                    # New valid record
                    tx_obj = Transaction(
                        transaction_id=tx_id,
                        customer_id=data["customer_id"],
                        event_time=data["event_time"],
                        available_at=data["available_at"],
                        amount=data["amount"],
                        transaction_type=data["transaction_type"],
                        source_file=data["source_file"],
                        ingested_at=utc_now(),
                    )
                    batch.append(tx_obj)
                    hist_obj = SourceRecordHistory(
                        history_id=f"HIST_TX_{tx_id}",
                        record_id=tx_id,
                        entity_id=data["customer_id"],
                        source_file=source_name,
                        source_row_number=row_idx,
                        event_time=data["event_time"],
                        available_at=data["available_at"],
                        amount=float(data["amount"]),
                        event_type=data["transaction_type"],
                        processing_status="accepted",
                        original_payload=json.dumps(row, default=str),
                        initial_run_id=run.run_id,
                        latest_run_id=run.run_id,
                        first_seen_at=utc_now(),
                        last_processed_at=utc_now(),
                    )
                    history_batch.append(hist_obj)
                    existing_txs[tx_id] = (
                        data["customer_id"],
                        data["event_time"],
                        data["available_at"],
                        data["amount"],
                        data["transaction_type"],
                    )
                    inserted_rows += 1

                    if len(batch) >= BATCH_SIZE:
                        self.session.bulk_save_objects(batch)
                        self.session.bulk_save_objects(history_batch)
                        self.session.flush()
                        batch.clear()
                        history_batch.clear()

                if batch:
                    self.session.bulk_save_objects(batch)
                    self.session.bulk_save_objects(history_batch)
                    self.session.flush()
                    batch.clear()
                    history_batch.clear()

            run.status = "success"
            run.end_time = utc_now()
            run.input_rows = input_rows
            run.accepted_rows = inserted_rows + noop_rows
            run.rejected_rows = rejected_rows
            start = ensure_utc(run.start_time) or utc_now()
            end = ensure_utc(run.end_time) or utc_now()
            run.duration_seconds = max(0.0, (end - start).total_seconds())
            self.session.commit()

            return {
                "status": "success",
                "run_id": run.run_id,
                "input_rows": input_rows,
                "inserted_rows": inserted_rows,
                "noop_rows": noop_rows,
                "rejected_rows": rejected_rows,
                "duration_seconds": run.duration_seconds,
            }
        except Exception as e:
            self.session.rollback()
            run_in_db = self.session.query(PipelineRun).filter(PipelineRun.run_id == run.run_id).first()
            if run_in_db:
                run_in_db.status = "failed"
                run_in_db.end_time = utc_now()
                run_in_db.error_message = str(e)
                self.session.commit()
            raise

    def ingest_prediction_requests(self, file_path: str, run_id: Optional[str] = None) -> Dict[str, Any]:
        """Ingest prediction requests specifying evaluation cutoffs."""
        source_name = os.path.basename(file_path)
        run = self._create_pipeline_run("ingest_prediction_requests", source_name) if not run_id else (
            self.session.query(PipelineRun).filter(PipelineRun.run_id == run_id).first()
        )

        input_rows = 0
        inserted_rows = 0
        noop_rows = 0
        rejected_rows = 0
        seen_in_batch = set()

        if not os.path.exists(file_path):
            err = f"File not found: {file_path}"
            if run:
                run.status = "failed"
                run.end_time = utc_now()
                run.error_message = err
                self.session.commit()
            return {"status": "failed", "error": err}

        known_customers = {
            c.customer_id: c.created_at
            for c in self.session.query(Customer.customer_id, Customer.created_at).all()
        }

        existing_requests = {
            r.request_id for r in self.session.query(PredictionRequest.request_id).all()
        }

        try:
            with open(file_path, "r", encoding="utf-8-sig") as f:
                reader = csv.DictReader(f)
                if reader.fieldnames is None:
                    run.status = "success"
                    run.end_time = utc_now()
                    self.session.commit()
                    return {
                        "status": "success",
                        "run_id": run.run_id,
                        "input_rows": 0,
                        "inserted_rows": 0,
                        "noop_rows": 0,
                        "rejected_rows": 0,
                    }

                is_schema_valid, schema_err = ValidationService.validate_prediction_schema(reader.fieldnames)
                if not is_schema_valid:
                    run.status = "failed"
                    run.end_time = utc_now()
                    run.error_message = schema_err
                    self.session.commit()
                    return {"status": "failed", "error": schema_err, "run_id": run.run_id}

                for row_idx, row in enumerate(reader, start=2):
                    input_rows += 1
                    val_result = ValidationService.validate_prediction_row(row, known_customers, seen_in_batch)
                    if not val_result.is_valid:
                        rejected_rows += 1
                        self._record_rejection(
                            run.run_id, source_name, row_idx, row, val_result.rejection_reason
                        )
                        continue

                    data = val_result.cleaned_data
                    req_id = data["request_id"]
                    seen_in_batch.add(req_id)

                    if req_id in existing_requests:
                        noop_rows += 1
                    else:
                        req_obj = PredictionRequest(
                            request_id=req_id,
                            customer_id=data["customer_id"],
                            as_of_time=data["as_of_time"],
                        )
                        self.session.add(req_obj)
                        existing_requests.add(req_id)
                        inserted_rows += 1

            run.status = "success"
            run.end_time = utc_now()
            run.input_rows = input_rows
            run.accepted_rows = inserted_rows + noop_rows
            run.rejected_rows = rejected_rows
            start = ensure_utc(run.start_time) or utc_now()
            end = ensure_utc(run.end_time) or utc_now()
            run.duration_seconds = max(0.0, (end - start).total_seconds())
            self.session.commit()

            return {
                "status": "success",
                "run_id": run.run_id,
                "input_rows": input_rows,
                "inserted_rows": inserted_rows,
                "noop_rows": noop_rows,
                "rejected_rows": rejected_rows,
                "duration_seconds": run.duration_seconds,
            }
        except Exception as e:
            self.session.rollback()
            run_in_db = self.session.query(PipelineRun).filter(PipelineRun.run_id == run.run_id).first()
            if run_in_db:
                run_in_db.status = "failed"
                run_in_db.end_time = utc_now()
                run_in_db.error_message = str(e)
                self.session.commit()
            raise
