"""SQLAlchemy Data Models for TimeSafe Feature Pipeline.

Implements source, target, and operational tables with explicit UTC
timestamps, decimal-compatible numeric types, indexes, and foreign keys.
"""
from datetime import datetime, timezone
from sqlalchemy import (
    Column,
    String,
    Integer,
    Numeric,
    Float,
    DateTime,
    Text,
    ForeignKey,
    UniqueConstraint,
    Index,
    CheckConstraint,
)
from sqlalchemy.orm import declarative_base, relationship

Base = declarative_base()


def utc_now() -> datetime:
    """Return current UTC timestamp with tzinfo."""
    return datetime.now(timezone.utc)


def ensure_utc(dt: datetime | None) -> datetime | None:
    """Ensure datetime has UTC timezone."""
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


class Customer(Base):
    """Source table representing e-commerce customers."""
    __tablename__ = "customers"

    customer_id = Column(String(64), primary_key=True, index=True)
    created_at = Column(DateTime(timezone=True), nullable=False)
    customer_segment = Column(String(32), nullable=True)

    # Relationships
    transactions = relationship("Transaction", back_populates="customer", cascade="all, delete-orphan")
    prediction_requests = relationship("PredictionRequest", back_populates="customer", cascade="all, delete-orphan")
    feature_snapshots = relationship("FeatureSnapshot", back_populates="customer", cascade="all, delete-orphan")
    training_labels = relationship("TrainingLabel", back_populates="customer", cascade="all, delete-orphan")

    def to_dict(self):
        return {
            "customer_id": self.customer_id,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "customer_segment": self.customer_segment,
        }


class Transaction(Base):
    """Source table representing transactional activity."""
    __tablename__ = "transactions"

    transaction_id = Column(String(64), primary_key=True, index=True)
    customer_id = Column(String(64), ForeignKey("customers.customer_id", ondelete="CASCADE"), nullable=False, index=True)
    event_time = Column(DateTime(timezone=True), nullable=False)
    available_at = Column(DateTime(timezone=True), nullable=False)
    amount = Column(Numeric(12, 2), nullable=False)
    transaction_type = Column(String(16), nullable=False)
    source_file = Column(String(255), nullable=False)
    ingested_at = Column(DateTime(timezone=True), nullable=False, default=utc_now)

    customer = relationship("Customer", back_populates="transactions")

    __table_args__ = (
        CheckConstraint("amount >= 0", name="chk_positive_amount"),
        CheckConstraint("transaction_type IN ('purchase', 'refund')", name="chk_transaction_type"),
        Index("ix_tx_cust_event_avail", "customer_id", "event_time", "available_at"),
    )

    def to_dict(self):
        return {
            "transaction_id": self.transaction_id,
            "customer_id": self.customer_id,
            "event_time": self.event_time.isoformat() if self.event_time else None,
            "available_at": self.available_at.isoformat() if self.available_at else None,
            "amount": float(self.amount) if self.amount is not None else 0.0,
            "transaction_type": self.transaction_type,
            "source_file": self.source_file,
            "ingested_at": self.ingested_at.isoformat() if self.ingested_at else None,
        }


class PredictionRequest(Base):
    """Source table specifying cutoff times for feature generation."""
    __tablename__ = "prediction_requests"

    request_id = Column(String(64), primary_key=True, index=True)
    customer_id = Column(String(64), ForeignKey("customers.customer_id", ondelete="CASCADE"), nullable=False, index=True)
    as_of_time = Column(DateTime(timezone=True), nullable=False)

    customer = relationship("Customer", back_populates="prediction_requests")

    __table_args__ = (
        Index("ix_pred_req_cust_asof", "customer_id", "as_of_time"),
    )

    def to_dict(self):
        return {
            "request_id": self.request_id,
            "customer_id": self.customer_id,
            "as_of_time": self.as_of_time.isoformat() if self.as_of_time else None,
        }


class FeatureSnapshot(Base):
    """Target table storing point-in-time engineered features."""
    __tablename__ = "feature_snapshots"

    snapshot_id = Column(String(64), primary_key=True)
    customer_id = Column(String(64), ForeignKey("customers.customer_id", ondelete="CASCADE"), nullable=False, index=True)
    as_of_time = Column(DateTime(timezone=True), nullable=False)
    feature_version = Column(String(16), nullable=False, default="v1")
    txn_count_7d = Column(Integer, nullable=False, default=0)
    txn_count_30d = Column(Integer, nullable=False, default=0)
    total_purchase_amount_30d = Column(Numeric(12, 2), nullable=False, default=0.00)
    avg_purchase_amount_30d = Column(Numeric(12, 2), nullable=False, default=0.00)
    days_since_last_txn = Column(Float, nullable=True)
    refund_count_30d = Column(Integer, nullable=False, default=0)
    refund_amount_30d = Column(Numeric(12, 2), nullable=False, default=0.00)
    generated_at = Column(DateTime(timezone=True), nullable=False, default=utc_now)

    customer = relationship("Customer", back_populates="feature_snapshots")

    __table_args__ = (
        UniqueConstraint("customer_id", "as_of_time", "feature_version", name="uq_feature_snapshot"),
        Index("ix_feat_snap_cust_asof_ver", "customer_id", "as_of_time", "feature_version"),
    )

    def to_dict(self):
        return {
            "snapshot_id": self.snapshot_id,
            "customer_id": self.customer_id,
            "as_of_time": self.as_of_time.isoformat() if self.as_of_time else None,
            "feature_version": self.feature_version,
            "txn_count_7d": self.txn_count_7d,
            "txn_count_30d": self.txn_count_30d,
            "total_purchase_amount_30d": float(self.total_purchase_amount_30d) if self.total_purchase_amount_30d is not None else 0.0,
            "avg_purchase_amount_30d": float(self.avg_purchase_amount_30d) if self.avg_purchase_amount_30d is not None else 0.0,
            "days_since_last_txn": self.days_since_last_txn,
            "refund_count_30d": self.refund_count_30d,
            "refund_amount_30d": float(self.refund_amount_30d) if self.refund_amount_30d is not None else 0.0,
            "generated_at": self.generated_at.isoformat() if self.generated_at else None,
        }


class TrainingLabel(Base):
    """Target table storing ground truth future outcome labels."""
    __tablename__ = "training_labels"

    label_id = Column(String(64), primary_key=True)
    customer_id = Column(String(64), ForeignKey("customers.customer_id", ondelete="CASCADE"), nullable=False, index=True)
    as_of_time = Column(DateTime(timezone=True), nullable=False)
    label_version = Column(String(16), nullable=False, default="v1")
    label_purchase_next_7d = Column(Integer, nullable=False)
    generated_at = Column(DateTime(timezone=True), nullable=False, default=utc_now)

    customer = relationship("Customer", back_populates="training_labels")

    __table_args__ = (
        UniqueConstraint("customer_id", "as_of_time", "label_version", name="uq_training_label"),
        CheckConstraint("label_purchase_next_7d IN (0, 1)", name="chk_binary_label"),
        Index("ix_train_label_cust_asof_ver", "customer_id", "as_of_time", "label_version"),
    )

    def to_dict(self):
        return {
            "label_id": self.label_id,
            "customer_id": self.customer_id,
            "as_of_time": self.as_of_time.isoformat() if self.as_of_time else None,
            "label_version": self.label_version,
            "label_purchase_next_7d": self.label_purchase_next_7d,
            "generated_at": self.generated_at.isoformat() if self.generated_at else None,
        }


class PipelineRun(Base):
    """Operational table tracking execution telemetry and reconciliation."""
    __tablename__ = "pipeline_runs"

    run_id = Column(String(64), primary_key=True, index=True)
    run_type = Column(String(32), nullable=False)
    source_file = Column(String(255), nullable=True)
    status = Column(String(16), nullable=False)  # running, success, failed
    start_time = Column(DateTime(timezone=True), nullable=False, default=utc_now)
    end_time = Column(DateTime(timezone=True), nullable=True)
    input_rows = Column(Integer, nullable=False, default=0)
    accepted_rows = Column(Integer, nullable=False, default=0)
    rejected_rows = Column(Integer, nullable=False, default=0)
    feature_rows = Column(Integer, nullable=False, default=0)
    duration_seconds = Column(Float, nullable=False, default=0.0)
    error_message = Column(Text, nullable=True)

    rejected_records = relationship("RejectedRecord", back_populates="pipeline_run", cascade="all, delete-orphan")

    def to_dict(self):
        return {
            "run_id": self.run_id,
            "run_type": self.run_type,
            "source_file": self.source_file,
            "status": self.status,
            "start_time": self.start_time.isoformat() if self.start_time else None,
            "end_time": self.end_time.isoformat() if self.end_time else None,
            "input_rows": self.input_rows,
            "accepted_rows": self.accepted_rows,
            "rejected_rows": self.rejected_rows,
            "feature_rows": self.feature_rows,
            "duration_seconds": self.duration_seconds,
            "error_message": self.error_message,
        }


class RejectedRecord(Base):
    """Operational table for quarantined records with lineage and reason."""
    __tablename__ = "rejected_records"

    reject_id = Column(String(64), primary_key=True)
    run_id = Column(String(64), ForeignKey("pipeline_runs.run_id", ondelete="CASCADE"), nullable=False, index=True)
    source_file = Column(String(255), nullable=False)
    source_row_number = Column(Integer, nullable=False)
    raw_record = Column(Text, nullable=False)
    rejection_reason = Column(String(255), nullable=False)
    resolution_status = Column(String(32), nullable=False, default="unresolved")  # unresolved, corrected, reprocessed
    resolved_at = Column(DateTime(timezone=True), nullable=True)
    rejected_at = Column(DateTime(timezone=True), nullable=False, default=utc_now)

    pipeline_run = relationship("PipelineRun", back_populates="rejected_records")
    corrections = relationship("RecordCorrection", back_populates="rejected_record", cascade="all, delete-orphan")

    def to_dict(self):
        return {
            "reject_id": self.reject_id,
            "run_id": self.run_id,
            "source_file": self.source_file,
            "source_row_number": self.source_row_number,
            "raw_record": self.raw_record,
            "rejection_reason": self.rejection_reason,
            "resolution_status": self.resolution_status or "unresolved",
            "resolved_at": self.resolved_at.isoformat() if self.resolved_at else None,
            "rejected_at": self.rejected_at.isoformat() if self.rejected_at else None,
        }


class SourceRecordHistory(Base):
    """Immutable audit trail of every source record seen by the pipeline."""
    __tablename__ = "source_record_history"

    history_id = Column(String(64), primary_key=True)
    record_id = Column(String(64), nullable=True, index=True)
    entity_id = Column(String(64), nullable=True, index=True)
    source_file = Column(String(255), nullable=False, index=True)
    source_row_number = Column(Integer, nullable=False)
    event_time = Column(DateTime(timezone=True), nullable=True, index=True)
    available_at = Column(DateTime(timezone=True), nullable=True)
    amount = Column(Numeric(12, 2), nullable=True)
    event_type = Column(String(64), nullable=True)
    processing_status = Column(String(32), nullable=False, default="accepted")  # accepted, rejected, corrected, reprocessed
    rejection_reason = Column(String(255), nullable=True)
    original_payload = Column(Text, nullable=False)  # Immutable original JSON
    initial_run_id = Column(String(64), nullable=False, index=True)
    latest_run_id = Column(String(64), nullable=True)
    first_seen_at = Column(DateTime(timezone=True), nullable=False, default=utc_now)
    last_processed_at = Column(DateTime(timezone=True), nullable=False, default=utc_now)
    resolved_at = Column(DateTime(timezone=True), nullable=True)

    corrections = relationship("RecordCorrection", back_populates="history_record", cascade="all, delete-orphan")
    events = relationship("RecordProcessingEvent", back_populates="history_record", cascade="all, delete-orphan")

    __table_args__ = (
        Index("ix_src_hist_ent_status", "entity_id", "processing_status"),
        Index("ix_src_hist_file_row", "source_file", "source_row_number"),
    )

    def to_dict(self):
        return {
            "history_id": self.history_id,
            "record_id": self.record_id,
            "entity_id": self.entity_id,
            "source_file": self.source_file,
            "source_row_number": self.source_row_number,
            "event_time": self.event_time.isoformat() if self.event_time else None,
            "available_at": self.available_at.isoformat() if self.available_at else None,
            "amount": float(self.amount) if self.amount is not None else None,
            "event_type": self.event_type,
            "processing_status": self.processing_status,
            "rejection_reason": self.rejection_reason,
            "original_payload": self.original_payload,
            "initial_run_id": self.initial_run_id,
            "latest_run_id": self.latest_run_id,
            "first_seen_at": self.first_seen_at.isoformat() if self.first_seen_at else None,
            "last_processed_at": self.last_processed_at.isoformat() if self.last_processed_at else None,
            "resolved_at": self.resolved_at.isoformat() if self.resolved_at else None,
        }


class RecordCorrection(Base):
    """Tracks editable correction versions and revalidation attempts for rejected records."""
    __tablename__ = "record_corrections"

    correction_id = Column(String(64), primary_key=True)
    history_id = Column(String(64), ForeignKey("source_record_history.history_id", ondelete="CASCADE"), nullable=True, index=True)
    reject_id = Column(String(64), ForeignKey("rejected_records.reject_id", ondelete="SET NULL"), nullable=True, index=True)
    original_payload = Column(Text, nullable=False)
    corrected_payload = Column(Text, nullable=False)
    validation_status = Column(String(32), nullable=False, default="draft")  # draft, valid, invalid, reprocessed, failed
    validation_errors = Column(Text, nullable=True)  # JSON or text error messages
    correction_reason = Column(String(255), nullable=True)
    resolved_by = Column(String(64), nullable=False, default="system_operator")
    created_at = Column(DateTime(timezone=True), nullable=False, default=utc_now)
    processed_at = Column(DateTime(timezone=True), nullable=True)
    retry_run_id = Column(String(64), nullable=True)

    history_record = relationship("SourceRecordHistory", back_populates="corrections")
    rejected_record = relationship("RejectedRecord", back_populates="corrections")

    def to_dict(self):
        return {
            "correction_id": self.correction_id,
            "history_id": self.history_id,
            "reject_id": self.reject_id,
            "original_payload": self.original_payload,
            "corrected_payload": self.corrected_payload,
            "validation_status": self.validation_status,
            "validation_errors": self.validation_errors,
            "correction_reason": self.correction_reason,
            "resolved_by": self.resolved_by,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "processed_at": self.processed_at.isoformat() if self.processed_at else None,
            "retry_run_id": self.retry_run_id,
        }


class RecordProcessingEvent(Base):
    """Detailed audit log of state changes for each record."""
    __tablename__ = "record_processing_events"

    event_id = Column(String(64), primary_key=True)
    history_id = Column(String(64), ForeignKey("source_record_history.history_id", ondelete="CASCADE"), nullable=True, index=True)
    reject_id = Column(String(64), nullable=True, index=True)
    run_id = Column(String(64), nullable=False, index=True)
    event_type = Column(String(64), nullable=False)  # initial_ingest, quarantined, correction_saved, validation_checked, reprocessed_success, reprocessed_failed
    status = Column(String(32), nullable=False)  # success, warning, failure, info
    message = Column(Text, nullable=False)
    created_at = Column(DateTime(timezone=True), nullable=False, default=utc_now)

    history_record = relationship("SourceRecordHistory", back_populates="events")

    def to_dict(self):
        return {
            "event_id": self.event_id,
            "history_id": self.history_id,
            "reject_id": self.reject_id,
            "run_id": self.run_id,
            "event_type": self.event_type,
            "status": self.status,
            "message": self.message,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }
