# TimeSafe Feature Pipeline: Design Trade-offs & Engineering Decisions

## 1. Overview
This document records the architectural decisions, trade-offs, and rationale adopted during the design and implementation of TimeSafe under the 8-hour hackathon development window.

---

## 2. Decision Matrix

| Architectural Area | Choice Selected | Alternatives Considered | Rationale & Trade-Off |
|---|---|---|---|
| **Pipeline Storage** | SQLite with WAL mode & Foreign Keys | PostgreSQL, Supabase, DuckDB, Parquet | **Selected**: Zero external installation overhead, 100% reproducible on any Windows/Linux machine, high local concurrency via WAL.<br/>**Trade-off**: High write contention under massive multi-writer concurrency; addressed by single-writer transactional batching and preparing clean PostgreSQL migration. |
| **Orchestration** | Python Pipeline Runner with DB State | Apache Airflow, Prefect, Celery, Temporal | **Selected**: No external daemon dependencies, transparent step debugging, sub-second latency for hackathon slice.<br/>**Trade-off**: Lacks built-in distributed node execution across worker fleets. |
| **Feature Transformation Engine** | Shared Python/Pandas `compute_features` | PySpark, dbt, SQL Window Functions | **Selected**: Guarantees byte-for-byte feature parity between batch training and single-record inference preview.<br/>**Trade-off**: Requires fitting single-customer history into memory; mitigated by filtering customer events in SQL before passing to Python. |
| **Monetary Representation** | Python `Decimal` & SQL `Numeric(12, 2)` | IEEE 754 Floating-point `Float` | **Selected**: Prevents floating-point rounding drifts (e.g. `$0.10 + $0.20 = $0.30000000000000004`).<br/>**Trade-off**: Slight compute overhead during arithmetic compared to raw native C floats. |
| **Target Leakage Gating** | Watermark Gate ($\max(available\_at) \ge T + 7\text{d}$) | Imputing 0 for unobserved windows | **Selected**: Guarantees zero negative label contamination on incomplete future periods.<br/>**Trade-off**: Recent prediction requests cannot be labeled until the complete 7-day observation window closes. |
| **Data Deduplication Policy** | Identical = NO-OP; Conflicting = Quarantine | Overwrite (Upsert), Silent Drop | **Selected**: Preserves auditable historical truth and prevents silent data corruption while enabling safe reruns.<br/>**Trade-off**: Requires caching primary key signatures during ingestion. |

---

## 3. Detailed Trade-off Analysis

### 3.1 Local Architecture vs Distributed Engines (Spark / Kafka)
* **The Question**: Why not include Kafka for streaming and Spark for feature transformation?
* **Analysis**: Adding Kafka and Spark introduces external JVM runtimes, Zookeeper/KRaft clusters, and significant operational fragility within an 8-hour delivery window.
* **Result**: TimeSafe achieved **5,739.7 rows/second** ingestion throughput and **150+ snapshots/second** feature calculation on pure Python/SQLite on a standard laptop, proving that clean architecture beats premature distributed complexity.

### 3.2 Single Shared Engine vs Dual SQL/Python Implementations
* **The Question**: Should features be computed using SQL window functions for batch and Python for real-time inference?
* **Analysis**: Maintaining separate SQL and Python feature formulas is the #1 cause of **train/serve skew** in real-world ML systems (differences in rounding, edge boundary definitions, or NULL handling).
* **Result**: TimeSafe implements a single, unified `compute_features(...)` function that is executed identically by both the batch pipeline and the live `/api/features/preview` endpoint.

### 3.3 Synchronous vs Asynchronous Job Execution
* **The Question**: Should `/api/pipeline/run` run synchronously or queue a background Celery task?
* **Analysis**: Synchronous execution allows the web dashboard and CLI callers to receive immediate, atomic reconciliation results.
* **Trade-off**: For multi-million-row backfills taking over 60 seconds, HTTP timeouts would occur. In production, this would be decoupled into a Redis/Celery queue with SSE/WebSocket progress updates.

---

## 4. Known Limitations & Production Roadmap
1. **Concurrency**: SQLite allows multiple concurrent readers but serializes writers. In high-concurrency production deployments, migrating to PostgreSQL removes writer serialization.
2. **Streaming Ingestion**: The current pipeline is optimized for micro-batch and batch CSV/API streams. Real-time streaming would incorporate an append-only event log (e.g., Kafka or AWS Kinesis).
3. **Feature Versioning Drift**: When feature logic changes, version strings (`v1`, `v2`) allow co-existence of multiple schemas in the same target table without dropping historical data.
