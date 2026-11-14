# TimeSafe Feature Pipeline: Data Dictionary & Specification

## 1. Overview
This document specifies the exact schemas, column definitions, data types, nullability constraints, business rules, and default conventions for all source, target, and operational entities in the TimeSafe feature store.

All timestamps are stored in strict UTC ISO-8601 (`YYYY-MM-DDTHH:MM:SS.ffffffZ`). Monetary amounts use high-precision decimals (`Numeric(12, 2)`) to avoid IEEE 754 floating-point inaccuracies.

---

## 2. Source Entities

### 2.1 Table: `customers`
Represents the verified base entity for which features and transactions are associated.

| Column | Data Type | Nullable | Primary Key | Foreign Key | Description |
|---|---|---|---|---|---|
| `customer_id` | `VARCHAR(64)` | No | Yes | — | Unique deterministic customer identifier (e.g., `CUST_0001`). |
| `created_at` | `TIMESTAMP WITH TIME ZONE` | No | No | — | Account creation timestamp in UTC. Cutoffs and transactions cannot predate this. |
| `customer_segment` | `VARCHAR(32)` | Yes | No | — | Behavioral customer segment (`vip`, `regular`, `new`, `dormant`). |

**Constraints & Indexes**:
- Index: `ix_customers_id` on `customer_id`

---

### 2.2 Table: `transactions`
Raw transactional events recorded by the e-commerce platform.

| Column | Data Type | Nullable | Primary Key | Foreign Key | Description |
|---|---|---|---|---|---|
| `transaction_id` | `VARCHAR(64)` | No | Yes | — | Unique transaction identifier (e.g., `TX_000001`). |
| `customer_id` | `VARCHAR(64)` | No | No | `customers.customer_id` | Foreign key referencing the customer. Cascades on delete. |
| `event_time` | `TIMESTAMP WITH TIME ZONE` | No | No | — | The real-world occurrence time of the transaction in UTC. |
| `available_at` | `TIMESTAMP WITH TIME ZONE` | No | No | — | The ingestion/availability timestamp when the event became visible. |
| `amount` | `NUMERIC(12, 2)` | No | No | — | Transaction amount in currency units. Must be non-negative. |
| `transaction_type` | `VARCHAR(16)` | No | No | — | Type of transaction: restricted to `'purchase'` or `'refund'`. |
| `source_file` | `VARCHAR(255)` | No | No | — | Filename/manifest from which the record was ingested. |
| `ingested_at` | `TIMESTAMP WITH TIME ZONE` | No | No | — | Operational timestamp when the row was committed to the warehouse. |

**Constraints & Business Rules**:
- Check Constraint: `amount >= 0` (negative values quarantined)
- Check Constraint: `transaction_type IN ('purchase', 'refund')`
- Chronological Rule: `available_at >= event_time` (chronological anomalies quarantined)
- Timeline Rule: `event_time >= customer.created_at` (transactions predating customer creation quarantined)
- Composite Index: `ix_tx_cust_event_avail (customer_id, event_time, available_at)`

---

### 2.3 Table: `prediction_requests`
Defines observation cutoffs ($T$) for which features must be engineered.

| Column | Data Type | Nullable | Primary Key | Foreign Key | Description |
|---|---|---|---|---|---|
| `request_id` | `VARCHAR(64)` | No | Yes | — | Unique prediction request identifier (e.g., `REQ_0001`). |
| `customer_id` | `VARCHAR(64)` | No | No | `customers.customer_id` | Foreign key referencing the customer. |
| `as_of_time` | `TIMESTAMP WITH TIME ZONE` | No | No | — | Point-in-time prediction cutoff ($T$) in UTC. |

**Constraints & Business Rules**:
- Timeline Rule: `as_of_time >= customer.created_at` (prediction request cannot predate customer existence)
- Composite Index: `ix_pred_req_cust_asof (customer_id, as_of_time)`

---

## 3. Target Feature Store Entities

### 3.1 Table: `feature_snapshots`
Point-in-time engineered feature vectors computed strictly from information available at cutoff $T$.

| Column | Data Type | Nullable | Primary Key | Foreign Key | Description |
|---|---|---|---|---|---|
| `snapshot_id` | `VARCHAR(64)` | No | Yes | — | Unique deterministic identifier (e.g., `SNAP_CUST_0001_20260531_v1`). |
| `customer_id` | `VARCHAR(64)` | No | No | `customers.customer_id` | Target customer. |
| `as_of_time` | `TIMESTAMP WITH TIME ZONE` | No | No | — | Prediction cutoff timestamp $T$. |
| `feature_version` | `VARCHAR(16)` | No | No | — | Schema version of the feature vector (default: `'v1'`). |
| `txn_count_7d` | `INTEGER` | No | No | — | Count of eligible transactions in $[T - 7\text{d}, T)$. |
| `txn_count_30d` | `INTEGER` | No | No | — | Count of eligible transactions in $[T - 30\text{d}, T)$. |
| `total_purchase_amount_30d` | `NUMERIC(12, 2)` | No | No | — | Sum of purchase amounts in $[T - 30\text{d}, T)$. |
| `avg_purchase_amount_30d` | `NUMERIC(12, 2)` | No | No | — | Mean of purchase amounts in $[T - 30\text{d}, T)$. |
| `days_since_last_txn` | `REAL / FLOAT` | Yes | No | — | Elapsed days from cutoff $T$ to most recent eligible transaction. `NULL` if no prior transactions. |
| `refund_count_30d` | `INTEGER` | No | No | — | Count of refund transactions in $[T - 30\text{d}, T)$. |
| `refund_amount_30d` | `NUMERIC(12, 2)` | No | No | — | Sum of refund amounts in $[T - 30\text{d}, T)$. |
| `generated_at` | `TIMESTAMP WITH TIME ZONE` | No | No | — | Audit timestamp when snapshot was computed. |

**Null & Zero Conventions**:
When a customer has zero eligible transactions in the lookback window:
- `txn_count_7d = 0`
- `txn_count_30d = 0`
- `total_purchase_amount_30d = 0.00`
- `avg_purchase_amount_30d = 0.00`
- `days_since_last_txn = NULL`
- `refund_count_30d = 0`
- `refund_amount_30d = 0.00`

**Unique Constraint**:
- `uq_feature_snapshot (customer_id, as_of_time, feature_version)` guarantees idempotence and rerun safety.

---

### 3.2 Table: `training_labels`
Ground-truth future outcome labels generated separately from features.

| Column | Data Type | Nullable | Primary Key | Foreign Key | Description |
|---|---|---|---|---|---|
| `label_id` | `VARCHAR(64)` | No | Yes | — | Unique label identifier (e.g., `LBL_CUST_0001_20260531_v1`). |
| `customer_id` | `VARCHAR(64)` | No | No | `customers.customer_id` | Target customer. |
| `as_of_time` | `TIMESTAMP WITH TIME ZONE` | No | No | — | Prediction cutoff timestamp $T$. |
| `label_version` | `VARCHAR(16)` | No | No | — | Schema version of the label definition (default: `'v1'`). |
| `label_purchase_next_7d` | `INTEGER` | No | No | — | Binary target: `1` if $\ge 1$ purchase in $[T, T + 7\text{d})$, else `0`. |
| `generated_at` | `TIMESTAMP WITH TIME ZONE` | No | No | — | Audit timestamp when label was generated. |

**Future Window Gating & Watermark Rule**:
- The future observation window is $[T, T + 7\text{ days})$.
- Watermark Requirement: $\max(available\_at) \ge T + 7\text{ days}$.
- If the current data watermark has not reached $T + 7\text{ days}$, the outcome is **unobservable**. The pipeline omits or quarantines the record to prevent false negative leakage.
- Unique Constraint: `uq_training_label (customer_id, as_of_time, label_version)`

---

## 4. Operational Telemetry & Quarantine Entities

### 4.1 Table: `pipeline_runs`
Tracks telemetry, timing, and row-level accounting for every batch execution.

| Column | Data Type | Nullable | Primary Key | Description |
|---|---|---|---|---|
| `run_id` | `VARCHAR(64)` | No | Yes | Unique run identifier (e.g., `RUN_20261114_091217_4be9f8`). |
| `run_type` | `VARCHAR(32)` | No | No | Category: `'ingest_customers'`, `'ingest_transactions'`, `'full_pipeline'`. |
| `source_file` | `VARCHAR(255)` | Yes | No | File or manifest processed. |
| `status` | `VARCHAR(16)` | No | No | Execution state: `'running'`, `'success'`, `'failed'`. |
| `start_time` | `TIMESTAMP WITH TIME ZONE` | No | No | Run initiation timestamp in UTC. |
| `end_time` | `TIMESTAMP WITH TIME ZONE` | Yes | No | Run completion timestamp in UTC. |
| `input_rows` | `INTEGER` | No | No | Total rows ingested from source file. |
| `accepted_rows` | `INTEGER` | No | No | Total clean rows inserted or recognized as valid no-ops. |
| `rejected_rows` | `INTEGER` | No | No | Total defective rows routed to quarantine. |
| `feature_rows` | `INTEGER` | No | No | Number of feature snapshots generated. |
| `duration_seconds`| `REAL` | No | No | Execution duration in seconds ($end\_time - start\_time$). |
| `error_message` | `TEXT` | Yes | No | Full exception traceback if status is failed. |

**Reconciliation Equation**:
$$\text{input\_rows} = \text{accepted\_rows} + \text{rejected\_rows} = (\text{inserted\_rows} + \text{noop\_rows}) + \text{rejected\_rows}$$

---

### 4.2 Table: `rejected_records`
Quarantine store maintaining full lineage and raw payloads of invalid records.

| Column | Data Type | Nullable | Primary Key | Foreign Key | Description |
|---|---|---|---|---|---|
| `reject_id` | `VARCHAR(64)` | No | Yes | — | Unique rejection identifier (e.g., `REJ_a8f3b20c91de`). |
| `run_id` | `VARCHAR(64)` | No | No | `pipeline_runs.run_id` | Associated execution run. Cascades on delete. |
| `source_file` | `VARCHAR(255)` | No | No | — | Original source filename. |
| `source_row_number`| `INTEGER` | No | No | — | Exact line number in source CSV (1-indexed header, data starts at line 2). |
| `raw_record` | `TEXT` | No | No | — | Exact raw JSON string representation of the source line. |
| `rejection_reason`| `VARCHAR(255)` | No | No | — | Machine-readable rejection code and explanation. |
| `rejected_at` | `TIMESTAMP WITH TIME ZONE` | No | No | — | Quarantine timestamp in UTC. |

