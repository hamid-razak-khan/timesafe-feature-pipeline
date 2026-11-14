-- ====================================================================
-- TimeSafe Feature Pipeline: Relational Database Schema DDL
-- Compatible with SQLite and PostgreSQL
-- ====================================================================

-- 1. Source Table: customers
CREATE TABLE IF NOT EXISTS customers (
    customer_id VARCHAR(64) PRIMARY KEY,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    customer_segment VARCHAR(32)
);

CREATE INDEX IF NOT EXISTS ix_customers_id ON customers(customer_id);

-- 2. Source Table: transactions
CREATE TABLE IF NOT EXISTS transactions (
    transaction_id VARCHAR(64) PRIMARY KEY,
    customer_id VARCHAR(64) NOT NULL,
    event_time TIMESTAMP WITH TIME ZONE NOT NULL,
    available_at TIMESTAMP WITH TIME ZONE NOT NULL,
    amount NUMERIC(12, 2) NOT NULL,
    transaction_type VARCHAR(16) NOT NULL,
    source_file VARCHAR(255) NOT NULL,
    ingested_at TIMESTAMP WITH TIME ZONE NOT NULL,
    CONSTRAINT fk_transactions_customer FOREIGN KEY (customer_id) REFERENCES customers(customer_id) ON DELETE CASCADE,
    CONSTRAINT chk_positive_amount CHECK (amount >= 0),
    CONSTRAINT chk_transaction_type CHECK (transaction_type IN ('purchase', 'refund'))
);

CREATE INDEX IF NOT EXISTS ix_tx_cust_event_avail ON transactions(customer_id, event_time, available_at);

-- 3. Source Table: prediction_requests
CREATE TABLE IF NOT EXISTS prediction_requests (
    request_id VARCHAR(64) PRIMARY KEY,
    customer_id VARCHAR(64) NOT NULL,
    as_of_time TIMESTAMP WITH TIME ZONE NOT NULL,
    CONSTRAINT fk_pred_requests_customer FOREIGN KEY (customer_id) REFERENCES customers(customer_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS ix_pred_req_cust_asof ON prediction_requests(customer_id, as_of_time);

-- 4. Target Table: feature_snapshots
CREATE TABLE IF NOT EXISTS feature_snapshots (
    snapshot_id VARCHAR(64) PRIMARY KEY,
    customer_id VARCHAR(64) NOT NULL,
    as_of_time TIMESTAMP WITH TIME ZONE NOT NULL,
    feature_version VARCHAR(16) NOT NULL DEFAULT 'v1',
    txn_count_7d INTEGER NOT NULL DEFAULT 0,
    txn_count_30d INTEGER NOT NULL DEFAULT 0,
    total_purchase_amount_30d NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    avg_purchase_amount_30d NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    days_since_last_txn REAL,
    refund_count_30d INTEGER NOT NULL DEFAULT 0,
    refund_amount_30d NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    generated_at TIMESTAMP WITH TIME ZONE NOT NULL,
    CONSTRAINT fk_feature_snapshots_customer FOREIGN KEY (customer_id) REFERENCES customers(customer_id) ON DELETE CASCADE,
    CONSTRAINT uq_feature_snapshot UNIQUE (customer_id, as_of_time, feature_version)
);

CREATE INDEX IF NOT EXISTS ix_feat_snap_cust_asof_ver ON feature_snapshots(customer_id, as_of_time, feature_version);

-- 5. Target Table: training_labels
CREATE TABLE IF NOT EXISTS training_labels (
    label_id VARCHAR(64) PRIMARY KEY,
    customer_id VARCHAR(64) NOT NULL,
    as_of_time TIMESTAMP WITH TIME ZONE NOT NULL,
    label_version VARCHAR(16) NOT NULL DEFAULT 'v1',
    label_purchase_next_7d INTEGER NOT NULL,
    generated_at TIMESTAMP WITH TIME ZONE NOT NULL,
    CONSTRAINT fk_training_labels_customer FOREIGN KEY (customer_id) REFERENCES customers(customer_id) ON DELETE CASCADE,
    CONSTRAINT uq_training_label UNIQUE (customer_id, as_of_time, label_version),
    CONSTRAINT chk_binary_label CHECK (label_purchase_next_7d IN (0, 1))
);

CREATE INDEX IF NOT EXISTS ix_train_label_cust_asof_ver ON training_labels(customer_id, as_of_time, label_version);

-- 6. Operational Table: pipeline_runs
CREATE TABLE IF NOT EXISTS pipeline_runs (
    run_id VARCHAR(64) PRIMARY KEY,
    run_type VARCHAR(32) NOT NULL,
    source_file VARCHAR(255),
    status VARCHAR(16) NOT NULL,
    start_time TIMESTAMP WITH TIME ZONE NOT NULL,
    end_time TIMESTAMP WITH TIME ZONE,
    input_rows INTEGER NOT NULL DEFAULT 0,
    accepted_rows INTEGER NOT NULL DEFAULT 0,
    rejected_rows INTEGER NOT NULL DEFAULT 0,
    feature_rows INTEGER NOT NULL DEFAULT 0,
    duration_seconds REAL NOT NULL DEFAULT 0.0,
    error_message TEXT
);

-- 7. Operational Table: rejected_records
CREATE TABLE IF NOT EXISTS rejected_records (
    reject_id VARCHAR(64) PRIMARY KEY,
    run_id VARCHAR(64) NOT NULL,
    source_file VARCHAR(255) NOT NULL,
    source_row_number INTEGER NOT NULL,
    raw_record TEXT NOT NULL,
    rejection_reason VARCHAR(255) NOT NULL,
    rejected_at TIMESTAMP WITH TIME ZONE NOT NULL,
    CONSTRAINT fk_rejected_pipeline_run FOREIGN KEY (run_id) REFERENCES pipeline_runs(run_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS ix_rejected_records_run ON rejected_records(run_id);

