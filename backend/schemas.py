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
    resolution_status: Optional[str] = "unresolved"
    resolved_at: Optional[str] = None
    rejected_at: str
    error_category: Optional[str] = None
    error_title: Optional[str] = None
    entity_id: Optional[str] = None
    record_id: Optional[str] = None


class PaginatedRejectsResponse(BaseModel):
    records: List[RejectedRecordItem]
    total: int
    page: int
    page_size: int
    total_pages: int
    total_stored: int
    total_unresolved: int
    active_filters: Optional[Dict[str, Any]] = None


class SourceFileOption(BaseModel):
    name: str
    count: int
    dataset_id: Optional[str] = None


class RejectionReasonOption(BaseModel):
    code: str
    title: str
    category: str
    count: int


class ResolutionStatusOption(BaseModel):
    status: str
    label: str
    count: int


class PipelineRunOption(BaseModel):
    run_id: str
    label: str
    count: int


class RejectsFilterOptionsResponse(BaseModel):
    source_files: List[SourceFileOption]
    rejection_reasons: List[RejectionReasonOption]
    resolution_statuses: List[ResolutionStatusOption]
    pipeline_runs: List[PipelineRunOption]
    total_stored: int
    total_unresolved: int


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


# 8. User-Friendly Dashboard, History & Reprocessing Schemas
class DashboardSummaryResponse(BaseModel):
    total_records_processed: int
    accepted_records: int
    rejected_records: int
    rejection_rate_percent: float
    generated_ml_features: int
    needs_attention_count: int
    rejection_reasons_summary: List[Dict[str, Any]]
    accepted_vs_rejected: Dict[str, Any]
    activity_timeline: List[Dict[str, Any]]
    recent_activity: List[Dict[str, Any]]
    datasets_processed: Optional[int] = 0
    valid_records: Optional[int] = 0
    feature_snapshots_generated: Optional[int] = 0
    total_historical_inputs: Optional[int] = 0
    total_historical_accepted: Optional[int] = 0
    total_historical_rejected: Optional[int] = 0
    valid_records_percent: Optional[float] = 0.0
    available_datasets: Optional[List[Dict[str, Any]]] = None
    active_filters: Optional[Dict[str, Any]] = None
    is_filtered: Optional[bool] = False


class DashboardActivityResponse(BaseModel):
    daily_timeline: List[Dict[str, Any]]
    recent_runs: List[Dict[str, Any]]
    granularity: Optional[str] = "daily"
    is_filtered: Optional[bool] = False


class DashboardDataQualityResponse(BaseModel):
    total_quarantined: int
    unresolved_count: int
    resolved_count: int
    rejection_reasons_summary: List[Dict[str, Any]]
    category_breakdown: List[Dict[str, Any]]
    integrity_status: str


class DashboardRecentRunsResponse(BaseModel):
    total: int
    runs: List[Dict[str, Any]]


class RecordHistoryItem(BaseModel):
    history_id: str
    record_id: str
    entity_id: Optional[str] = None
    source_file: str
    source_row_number: int
    event_time: Optional[str] = None
    available_at: Optional[str] = None
    amount: Optional[float] = None
    event_type: Optional[str] = None
    processing_status: str
    rejection_reason: Optional[str] = None
    rejection_title: Optional[str] = None
    rejection_category: Optional[str] = None
    initial_run_id: str
    latest_run_id: str
    first_seen_at: Optional[str] = None
    last_processed_at: Optional[str] = None
    resolved_at: Optional[str] = None


class RecordHistoryListResponse(BaseModel):
    total: int
    page: int
    limit: int
    records: List[RecordHistoryItem]
    filter_options: Dict[str, List[str]]


class RecordCorrectionItem(BaseModel):
    correction_id: str
    history_id: Optional[str] = None
    reject_id: Optional[str] = None
    original_payload: str
    corrected_payload: str
    validation_status: str
    validation_errors: Optional[str] = None
    correction_reason: Optional[str] = None
    resolved_by: str
    created_at: Optional[str] = None
    processed_at: Optional[str] = None
    retry_run_id: Optional[str] = None


class RecordProcessingEventItem(BaseModel):
    event_id: str
    history_id: Optional[str] = None
    reject_id: Optional[str] = None
    run_id: str
    event_type: str
    status: str
    message: str
    created_at: Optional[str] = None


class RecordDetailResponse(BaseModel):
    record: RecordHistoryItem
    original_payload: str
    reject_id: Optional[str] = None
    corrections: List[RecordCorrectionItem]
    events: List[RecordProcessingEventItem]
    affected_snapshots_warning: Optional[str] = None


class ProcessingHistoryRunItem(BaseModel):
    run_id: str
    friendly_type: str
    raw_run_type: str
    source_file: Optional[str] = None
    status: str
    status_badge: str
    start_time: Optional[str] = None
    end_time: Optional[str] = None
    duration_seconds: float
    input_rows: int
    accepted_rows: int
    rejected_rows: int
    feature_rows: int
    reconciliation_status: Optional[str] = None
    error_message: Optional[str] = None


class ProcessingHistoryListResponse(BaseModel):
    total: int
    runs: List[ProcessingHistoryRunItem]


class ValidateCorrectionRequest(BaseModel):
    entity_id: Optional[str] = None
    record_id: Optional[str] = None
    event_time: Optional[str] = None
    available_at: Optional[str] = None
    amount: Optional[Any] = None
    event_type: Optional[str] = None
    additional_fields: Optional[Dict[str, Any]] = None


class ValidateCorrectionResponse(BaseModel):
    is_valid: bool
    errors: Dict[str, str]
    normalized_payload: Dict[str, Any]
    plain_english_summary: str


class SaveCorrectionRequest(BaseModel):
    corrected_payload: Dict[str, Any]
    correction_reason: Optional[str] = None
    resolved_by: str = "system_operator"


class ReprocessRecordRequest(BaseModel):
    corrected_payload: Dict[str, Any]
    correction_reason: Optional[str] = None
    force_override: bool = False


class ReprocessRecordResponse(BaseModel):
    status: str
    history_id: Optional[str] = None
    reject_id: str
    message: str
    effective_available_at: Optional[str] = None
    affected_snapshots_warning: Optional[str] = None
    retry_run_id: str



