"""Pydantic Request and Response Schemas for TimeSafe API."""
from datetime import datetime
from decimal import Decimal
from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field


# 1. Health
class HealthResponse(BaseModel):
    status: str = "ok"
    version: str = "0.1.0"
    timestamp: str
    database: str = "connected"


# 2. Synthetic Data Generation
class GenerateDataRequest(BaseModel):
    customers: int = Field(default=20, ge=1, le=10000)
    transactions: int = Field(default=100, ge=1, le=500000)
    predictions: int = Field(default=15, ge=1, le=50000)
    seed: int = Field(default=42)
    include_invalid: bool = Field(default=True)


class GenerateDataResponse(BaseModel):
    status: str
    customers_count: int
    transactions_count: int
    prediction_requests_count: int
    output_dir: str
    hashes: Dict[str, str]


# 3. Pipeline Ingestion & Execution
class IngestResponse(BaseModel):
    status: str
    run_id: str
    input_rows: int
    inserted_rows: int
    noop_rows: int
    rejected_rows: int
    duration_seconds: float


class TriggerPipelineRequest(BaseModel):
    customers_path: Optional[str] = None
    transactions_path: Optional[str] = None
    predictions_path: Optional[str] = None
    feature_version: str = "v1"
    label_version: str = "v1"


class TriggerPipelineResponse(BaseModel):
    status: str
    run_id: str
    duration_seconds: float
    feature_snapshots_count: int
    training_labels_count: int
    overall_status: str


class PipelineRunItem(BaseModel):
    run_id: str
    run_type: str
    source_file: Optional[str] = None
    status: str
    start_time: Optional[str] = None
    end_time: Optional[str] = None
    input_rows: int
    accepted_rows: int
    rejected_rows: int
    feature_rows: int
    duration_seconds: float
    error_message: Optional[str] = None


# 4. Features
class FeatureSnapshotItem(BaseModel):
    snapshot_id: str
    customer_id: str
    as_of_time: str
    feature_version: str
    txn_count_7d: int
    txn_count_30d: int
    total_purchase_amount_30d: float
    avg_purchase_amount_30d: float
    days_since_last_txn: Optional[float] = None
    refund_count_30d: int
    refund_amount_30d: float
    generated_at: str


class FeaturePreviewRequest(BaseModel):
    customer_id: str
    as_of_time: str
    feature_version: str = "v1"


class FeaturePreviewResponse(BaseModel):
    customer_id: str
    as_of_time: str
    feature_version: str
    txn_count_7d: int
    txn_count_30d: int
    total_purchase_amount_30d: float
    avg_purchase_amount_30d: float
    days_since_last_txn: Optional[float] = None
    refund_count_30d: int
    refund_amount_30d: float


# 5. Rejected Records
class RejectedRecordItem(BaseModel):
    reject_id: str
    run_id: str
    source_file: str
    source_row_number: int
    raw_record: str
    rejection_reason: str
    rejected_at: str


# 6. Metrics & Reconciliation
class SystemMetricsResponse(BaseModel):
    total_customers: int
    total_transactions: int
    total_feature_snapshots: int
    total_training_labels: int
    total_rejected_records: int
    total_pipeline_runs: int
    successful_runs: int
    failed_runs: int
    avg_pipeline_duration_seconds: float
    last_run_time: Optional[str] = None
    reconciliation_status: str


class ReconciliationReportResponse(BaseModel):
    generated_at: str
    overall_status: str
    counts: Dict[str, int]
    integrity_checks: Dict[str, Any]
    run_audits: List[Dict[str, Any]]


# 7. Generic Dataset & Feature Wizard Schemas
class UploadPreviewResponse(BaseModel):
    filename: str
    total_rows: int
    columns: List[str]
    preview: List[Dict[str, Any]]
    suggested_mapping: Dict[str, Optional[str]]
    suggested_cutoff: str


class GenerateGenericFeaturesRequest(BaseModel):
    filename: Optional[str] = None
    column_mapping: Dict[str, str]
    cutoff_time: str
    feature_options: List[str] = Field(
        default_factory=lambda: ["count_7d", "count_30d", "total_amount_30d", "avg_amount_30d", "days_since_last"]
    )
    assume_available_at_event_time: bool = False
    feature_version: str = "v1"


class GenerateGenericFeaturesResponse(BaseModel):
    status: str
    total_entities: int
    total_events: int
    eligible_events: int
    duration_seconds: float
    preview: List[Dict[str, Any]]
    all_features: List[Dict[str, Any]]
    leakage_prevention_guarantee: str
    has_availability_warning: bool


