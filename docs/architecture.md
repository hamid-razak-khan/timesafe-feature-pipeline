# TimeSafe Feature Pipeline: Architecture & System Design

## 1. Executive Summary
TimeSafe is an end-to-end, production-grade ML Feature Store and Data Engineering Pipeline engineered to prevent **target leakage** and **train/serve skew** in transactional predictive modeling.

Demonstrated on an e-commerce platform scenario predicting 7-day purchase likelihood, the system enforces mathematical point-in-time correctness: features as of cutoff $T$ are constructed strictly from events that both occurred and were available by $T$.

---

## 2. Component Architecture

```mermaid
flowchart TD
    subgraph Ingestion_Layer["1. Ingestion & Validation Engine"]
        RawCSV["Raw Stream / CSV Files\n(customers, transactions, prediction_requests)"] --> IngestionSvc["Ingestion Service\n(Stream chunking & typing)"]
        IngestionSvc --> ValidationEngine["Validation Service\n- Schema & required column validation\n- Customer foreign-key integrity\n- Decimal parsing & non-negativity\n- Chronological validation (available_at >= event_time)\n- Customer timeline checks\n- Duplicate & conflict detection"]
        ValidationEngine -->|"Defective / Conflicting"| Quarantined["Quarantine Store\n(rejected_records table)"]
        ValidationEngine -->|"Valid / No-Op"| CleanStore[("Operational Store (SQLite / PostgreSQL)\n- customers\n- transactions\n- prediction_requests")]
    end

    subgraph Feature_Layer["2. Unified Point-in-Time Feature Engine"]
        CleanStore --> PITFilter["Dual-Timestamp Anti-Leakage Filter\nevent_time < T AND available_at <= T\nWindow: [T - 30d, T)"]
        PITFilter --> SharedFeatureEngine["Shared compute_features()\n(Used by BOTH Training & Inference)"]
        SharedFeatureEngine --> Snapshots[("feature_snapshots\nUnique (customer_id, as_of_time, version)")]
    end

    subgraph Label_Layer["3. Target Label Generation Engine"]
        CleanStore --> WatermarkGate{"Data Watermark Gate\nmax(available_at) >= T + 7d?"}
        WatermarkGate -->|"Yes: Window Complete"| LabelGen["Compute label_purchase_next_7d\nPurchase in [T, T + 7d)"]
        WatermarkGate -->|"No: Window Incomplete"| OmitLabel["Omit / Mark Unobservable\n(Prevents Negative Label Bias)"]
        LabelGen --> TrainingLabels[("training_labels\nUnique (customer_id, as_of_time, version)")]
    end

    subgraph Observability_Layer["4. Reconciliation & Telemetry"]
        PipelineRunner["Pipeline Runner\n(Transactional batch executor)"] --> RunLogs[("pipeline_runs table")]
        PipelineRunner --> ReconEngine["Reconciliation Engine\ninput = inserted + noop + rejected"]
        ReconEngine --> JSONReport["reports/validation_report.json"]
    end

    subgraph Interface_Layer["5. API & UI Layer"]
        CleanStore & Snapshots & TrainingLabels & RunLogs & Quarantined --> FastAPI["FastAPI Backend (/api)"]
        FastAPI --> Dashboard["React Dashboard (Vite + Tailwind + Recharts)"]
    end
```

---

## 3. Core Architectural Modules

### 3.1 Ingestion & Validation Service (`backend/services/ingestion_service.py`)
- **Chunked Processing**: Processes inputs in configurable 1,000-row batches to preserve low memory overhead even during 100,000+ row workloads.
- **Traceable Quarantine**: Records failing rows to `rejected_records` with run ID, source file, line number, raw JSON record, and rejection reason. Records are never dropped silently.
- **Deduplication Policy**:
  - *Identical Record*: Marked as a safe `noop` (does not increment database rows or duplicate business features).
  - *Conflicting Primary Key*: Quarantined with `CONFLICTING_PRIMARY_KEY` to protect historical truth.
  - *In-File Duplicates*: First instance accepted; subsequent occurrences quarantined.

### 3.2 Unified Feature Engine (`backend/services/feature_engineering.py`)
- Single mathematical implementation `compute_features(...)` shared identically across offline training dataset generation and real-time inference preview (`/api/features/preview`).
- Eliminates **training-serving skew** by ensuring identical feature names, types, ordering, null conventions, and window boundaries.

### 3.3 Target Label Service (`backend/services/label_generation.py`)
- Target: `label_purchase_next_7d` (binary: 1 if $\ge 1$ purchase in $[T, T + 7\text{d})$, else 0).
- **Watermark Completeness Check**: Evaluates maximum `available_at` in the system. If $\text{watermark} < T + 7\text{ days}$, the future window is incomplete; the label is marked unobservable and omitted, preventing false negative labels.

### 3.4 Reconciliation Engine (`backend/services/reconciliation.py`)
Enforces the conservation accounting invariant:
$$\text{input\_rows} = \text{accepted\_rows} + \text{rejected\_rows} = \text{inserted\_rows} + \text{noop\_rows} + \text{rejected\_rows}$$
Audits:
- Referential integrity (zero orphaned transaction or feature rows)
- Snapshot uniqueness (zero duplicate `(customer_id, as_of_time, feature_version)` tuples)
- Outputs verifiable evidence to `reports/validation_report.json`.

---

## 4. Point-in-Time Correctness & Anti-Leakage Proofs

### The Dual-Timestamp Rule
Every transaction carries:
- `event_time`: Moment the customer executed the transaction.
- `available_at`: Moment the transaction arrived and was committed to the warehouse.

Given prediction cutoff $T$:
$$\text{Eligible}(tx, T) \iff tx.event\_time < T \quad \mathbf{AND} \quad tx.available\_at \le T$$

### Boundary Invariants
1. **Strictly Preceding ($event\_time < T$)**: A transaction occurring exactly at $T$ is excluded.
2. **Late-Arriving Events ($available\_at > T$)**: An event occurring prior to $T$ but ingested after $T$ is excluded from the snapshot at $T$.
3. **Exact Lookback Boundaries**:
   - 7-day window: $[T - 7\text{ days}, T)$. An event exactly at $T - 7\text{ days}$ is included.
   - 30-day window: $[T - 30\text{ days}, T)$. An event exactly at $T - 30\text{ days}$ is included.
4. **Customer Existence**: A feature snapshot or prediction request where $T < customer.created\_at$ is invalid and rejected.

---

## 5. Database Layer & PostgreSQL / Supabase Migration

### Current SQLite Implementation
- Uses SQLAlchemy 2.0 / 1.4 abstraction with `DATABASE_URL`.
- Enforces relational foreign keys on connection: `PRAGMA foreign_keys = ON;`.
- Enables high-concurrency read/write with Write-Ahead Logging: `PRAGMA journal_mode = WAL;`.
- Composite indexes on `(customer_id, event_time, available_at)` ensure sub-second lookups even across 100,000+ rows.

### Future PostgreSQL / Supabase Migration
1. Change `DATABASE_URL` in `.env` to:
   ```bash
   DATABASE_URL="postgresql://postgres:[PASSWORD]@db.[PROJECT_REF].supabase.co:5432/postgres"
   ```
2. The schema definition in `database/schema.sql` and `database/models.py` uses portable ANSI SQL and standard SQLAlchemy types (`TIMESTAMP WITH TIME ZONE`, `NUMERIC(12, 2)`, `VARCHAR`, foreign keys, check constraints).
3. No dialect-specific hacks are used. Migrating requires running `database/seed.py --reset` with the PostgreSQL URL set.
