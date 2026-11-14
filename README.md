# TimeSafe — Point-in-Time ML Feature Pipeline

[![Tests](https://img.shields.io/badge/pytest-47%20passed-10b981.svg)](backend/tests/)
[![Python](https://img.shields.io/badge/python-3.11+-3b82f6.svg)](https://www.python.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.104+-06b6d4.svg)](https://fastapi.tiangolo.com/)
[![React](https://img.shields.io/badge/React-18.2+-61dafb.svg)](https://react.dev/)
[![Throughput](https://img.shields.io/badge/benchmark-5%2C739%20rows%2Fsec-f59e0b.svg)](scripts/benchmark.py)

A reproducible, high-performance Data Engineering pipeline and Feature Store designed to eliminate **target leakage** and **train/serve skew** in machine learning feature extraction from arbitrary transactional event streams (banking, e-commerce, subscriptions, logistics).

---

## 1. Project Overview & Business Scenario
In real-world predictive ML pipelines (such as predicting customer purchases, loan defaults, subscription churn, or shipment delays), feature values must reflect **only information that was physically observed and available** at prediction cutoff $T$. 

TimeSafe enforces:
- **General-Purpose Transactional Support**: Easily maps arbitrary CSV headers (e.g. `account_id`, `posted_at`, `ledger_sync_time`) to core anti-leakage primitives.
- **Zero Target Leakage**: Dual-timestamp filtering (`event_time < T` and `available_at <= T`).
- **Parity by Design**: Identical feature formulas for batch training datasets and single-record real-time inference preview.
- **Watermark-Gated Labels**: Prevents false-negative label leakage on incomplete observation windows.
- **Rerun Safety & Idempotency**: Identical re-runs produce safe no-ops; conflicting IDs route to quarantine.
- **Auditable Reconciliation**: Mathematical verification that $\text{input} = \text{accepted} + \text{rejected}$.
- **Extremely Simple 3-Step UI**: Modern wizard interface (Upload $\rightarrow$ Configure $\rightarrow$ Results & Download) with an expandable Advanced Console for engineer telemetry and audits.

---

## 2. Architecture & Data Flow

```mermaid
flowchart TD
    subgraph Ingestion_Layer["1. Ingestion & Validation Layer"]
        CSV["Raw Source Files\n(customers, transactions, requests)"] --> IngestSvc["Ingestion Service\n(Chunked streaming)"]
        IngestSvc --> ValidSvc["Validation Service\n- Schema & Foreign Key Checks\n- Decimal Non-Negativity\n- Timeline Feasibility\n- Conflict Detection"]
        ValidSvc -->|"Invalid / Conflicting"| Quarantine[("Quarantine Store\n(rejected_records table)")]
        ValidSvc -->|"Valid / Safe No-Op"| CleanStore[("Operational Store (SQLite WAL)\n- customers\n- transactions\n- prediction_requests")]
    end

    subgraph Feature_Layer["2. Unified Point-in-Time Feature Engine"]
        CleanStore --> PITFilter["Dual-Timestamp Filter\nevent_time < T AND available_at <= T\nWindow: [T - 30d, T)"]
        PITFilter --> SharedEngine["Shared compute_features()\n(Training & Inference Parity)"]
        SharedEngine --> Snapshots[("feature_snapshots\nUnique (customer_id, as_of_time, version)")]
    end

    subgraph Label_Layer["3. Target Label Generation Engine"]
        CleanStore --> WatermarkGate{"Watermark Check:\nmax(available_at) >= T + 7d?"}
        WatermarkGate -->|"Yes: Complete Window"| LabelGen["Compute label_purchase_next_7d\nPurchase in [T, T + 7d)"]
        WatermarkGate -->|"No: Incomplete Window"| DiscardLabel["Omit / Mark Unobservable\n(Prevents Negative Label Leakage)"]
        LabelGen --> TrainingLabels[("training_labels\nUnique (customer_id, as_of_time, version)")]
    end

    subgraph Observability_Layer["4. Telemetry & Reconciliation"]
        PipelineRunner["Pipeline Runner\n(Transactional batch executor)"] --> RunLogs[("pipeline_runs table")]
        PipelineRunner --> ReconEngine["Reconciliation Engine\ninput = inserted + noop + rejected"]
        ReconEngine --> JSONReport["reports/validation_report.json"]
    end

    subgraph Serving_Layer["5. Serving & UI Layer"]
        CleanStore & Snapshots & TrainingLabels & RunLogs & Quarantine --> FastAPI["FastAPI Backend (/api)"]
        FastAPI --> Dashboard["React Dashboard (Vite + Tailwind + Recharts)"]
    end
```

---

## 3. Technology Stack

- **Backend**: Python 3.11, FastAPI, Pydantic v2, Pandas 2.2, SQLAlchemy (1.4 / 2.0 compatible)
- **Database**: SQLite (WAL mode, Foreign Keys ON, composite indexing), portable to PostgreSQL
- **Frontend**: React 18, Vite, Tailwind CSS, Recharts, Axios, Lucide React
- **Testing**: Pytest, temporary in-memory/file test databases, FastAPI TestClient
- **Telemetry**: Python logging, operational `pipeline_runs` table, JSON reconciliation reporting

---

## 4. Point-in-Time & Anti-Leakage Rules

### The Dual-Timestamp Rule
Every transaction has an `event_time` (occurrence) and `available_at` (arrival into the warehouse).
$$\text{Eligible}(tx, T) \iff tx.event\_time < T \quad \mathbf{AND} \quad tx.available\_at \le T$$

### Boundary Invariants
1. **Strictly Preceding**: $event\_time < T$. A transaction occurring exactly at $T$ is **excluded**.
2. **Availability Gate**: A transaction with $event\_time < T$ but $available\_at > T$ is **excluded** (late-arriving event not yet known at cutoff).
3. **Exact 30-Day Window**: $[T - 30\text{ days}, T)$. An event occurring at $T - 30\text{ days}$ is **included**.
4. **Exact 7-Day Window**: $[T - 7\text{ days}, T)$. An event occurring at $T - 7\text{ days}$ is **included**.
5. **Customer Timeline**: If $T < customer.created\_at$, the customer did not exist; extraction raises a validation rejection.
6. **Watermark Invariant**: Labels for $[T, T + 7\text{ days})$ are computed **only** when $\max(available\_at) \ge T + 7\text{ days}$. If the window is incomplete, the label is omitted (never imputed as 0).

---

## 5. Feature Definitions & Null Conventions

| Feature Name | Type | Lookback Window | Definition | Zero / Empty Convention |
|---|---|---|---|---|
| `txn_count_7d` | `INTEGER` | $[T - 7\text{d}, T)$ | Count of eligible purchases and refunds | `0` |
| `txn_count_30d` | `INTEGER` | $[T - 30\text{d}, T)$ | Count of eligible purchases and refunds | `0` |
| `total_purchase_amount_30d`| `NUMERIC(12, 2)`| $[T - 30\text{d}, T)$ | Sum of eligible purchase amounts | `0.00` |
| `avg_purchase_amount_30d` | `NUMERIC(12, 2)`| $[T - 30\text{d}, T)$ | Mean amount of eligible purchases | `0.00` |
| `days_since_last_txn` | `FLOAT` | Preceding $T$ | Elapsed days since most recent eligible transaction | `NULL` |
| `refund_count_30d` | `INTEGER` | $[T - 30\text{d}, T)$ | Count of eligible refunds | `0` |
| `refund_amount_30d` | `NUMERIC(12, 2)`| $[T - 30\text{d}, T)$ | Sum of eligible refund amounts | `0.00` |

---

## 6. Project Structure

```
timesafe-feature-pipeline/
|-- frontend/
|   |-- src/
|   |   |-- components/
|   |   |   |-- Sidebar.jsx
|   |   |   |-- MetricCard.jsx
|   |   |   |-- UploadForm.jsx
|   |   |   |-- FeatureTable.jsx
|   |   |   |-- RunsTable.jsx
|   |   |   |-- QualityChart.jsx
|   |   |-- pages/
|   |   |   |-- Dashboard.jsx
|   |   |   |-- DataIngestion.jsx
|   |   |   |-- FeatureExplorer.jsx
|   |   |   |-- DataQuality.jsx
|   |   |   |-- PipelineRuns.jsx
|   |   |-- services/
|   |   |   |-- api.js
|   |   |-- App.jsx
|   |   |-- main.jsx
|   |   |-- index.css
|   |-- package.json
|   |-- vite.config.js
|   |-- .env.example
|
|-- backend/
|   |-- __init__.py
|   |-- main.py
|   |-- config.py
|   |-- schemas.py
|   |-- api/
|   |   |-- __init__.py
|   |   |-- ingestion.py
|   |   |-- pipeline.py
|   |   |-- features.py
|   |   |-- reports.py
|   |-- services/
|   |   |-- __init__.py
|   |   |-- ingestion_service.py
|   |   |-- validation_service.py
|   |   |-- feature_engineering.py
|   |   |-- label_generation.py
|   |   |-- pipeline_runner.py
|   |   |-- reconciliation.py
|   |-- tests/
|   |   |-- test_ingestion.py
|   |   |-- test_validation.py
|   |   |-- test_leakage.py
|   |   |-- test_features.py
|   |   |-- test_idempotency.py
|   |   |-- test_recovery.py
|   |   |-- test_api.py
|   |-- requirements.txt
|
|-- database/
|   |-- __init__.py
|   |-- db.py
|   |-- models.py
|   |-- schema.sql
|   |-- seed.py
|
|-- data/
|   |-- raw/
|   |-- quarantine/
|   |-- output/
|
|-- scripts/
|   |-- generate_data.py
|   |-- run_pipeline.py
|   |-- benchmark.py
|
|-- docs/
|   |-- architecture.md
|   |-- data_dictionary.md
|   |-- tradeoffs.md
|
|-- reports/
|   |-- validation_report.json
|
|-- README.md
|-- .env.example
|-- .gitignore
|-- pyproject.toml
```

---

## 7. Windows Installation & Setup Instructions

### Prerequisites
- Python 3.11+
- Node.js 18+ & npm
- Git

### 1. Clone & Setup Python Environment
```powershell
cd C:\CandidateWorkspace\timesafe-feature-pipeline
pip install -r backend/requirements.txt
```

### 2. Generate Synthetic Seed Data
```powershell
python scripts/generate_data.py --customers 20 --transactions 100 --predictions 15
```

### 3. Run Automated Pytest Test Suite
```powershell
python -m pytest backend/tests
```
*(All 47 unit, integration, and generic-feature tests run in an isolated SQLite environment and pass.)*

---

## 8. Web Interface & Navigation

The application provides a modern, 3-step wizard workflow designed for intuitive use, keeping operational complexity abstracted until needed:

1. **Home**: Clean landing page with an overview of the anti-leakage guarantee and one-click actions: **Upload Dataset** or **Try Sample Dataset**.
2. **My Datasets (3-Step Feature Wizard)**:
   - **Step 1: Upload Data** — Drag-and-drop CSV upload, automatic column header detection, row counting, and data preview (or load domain-neutral sample data).
   - **Step 2: Configure Features** — Flexible column mapping (Entity ID, Event Timestamp, Availability Timestamp, Amount, Event Type), prediction cutoff $T$, availability warning toggle, and feature selection checkboxes with plain-language descriptions.
   - **Step 3: Results & Download** — Point-in-time calculation summary, feature snapshot preview table, and one-click CSV export.
3. **Results**: Dedicated feature snapshot explorer with real-time entity search, pagination, and download.
4. **Advanced Details Console (Drawer / Modal)**:
   - **Pipeline Runs & Telemetry**: Full execution history, duration, status, and batch triggers.
   - **Quarantine Store & Rejects**: Live inspector for invalid, conflicting, or non-referential raw records.
   - **Mathematical Reconciliation**: Verification of the data balance invariant ($\text{input} = \text{accepted} + \text{rejected}$).

---

## 9. Startup Commands

### Start Backend Server (FastAPI)
```powershell
# From C:\CandidateWorkspace\timesafe-feature-pipeline
python -m uvicorn backend.main:app --host 127.0.0.1 --port 8000 --reload
```
- API interactive Swagger documentation available at: `http://127.0.0.1:8000/docs`

### Start Frontend Server (React + Vite)
```powershell
# In a separate PowerShell terminal
cd C:\CandidateWorkspace\timesafe-feature-pipeline\frontend
npm run dev
```
- Web dashboard accessible at: `http://localhost:5173`

---

## 10. CLI Pipeline Execution

Run the complete pipeline directly from the command line:
```powershell
python scripts/run_pipeline.py --customers data/raw/customers.csv --transactions data/raw/transactions.csv --predictions data/raw/prediction_requests.csv
```

Outputs immediate telemetry:
```
=== PIPELINE EXECUTION SUCCESSFUL ===
Run ID:                 RUN_FULL_20261114_091217_4be9f8
Execution Duration:     0.30s
Feature Snapshots:      15
Training Labels:        15
Overall Audit Status:   PASSED
Validation Report written to: reports/validation_report.json
```

---

## 11. Measured Performance Benchmark (100,000 Rows)

Run the real-time benchmark suite:
```powershell
python scripts/benchmark.py --rows 100000 --customers 500 --predictions 100
```

### Actual Measured Results
```
============================================================
PERFORMANCE BENCHMARK SUMMARY
============================================================
Input Stream Volume:            99,998 rows
Database Ingestion Throughput:  5,739.7 rows/sec
Feature Calculation Throughput: 150.7 snapshots/sec
Total Pipeline Active Time:     18.09 seconds
Reconciliation Balance:         99,998 == 70,614 + 0 + 29,384 (MATCH)
============================================================
```

### Key Optimizations Implemented
1. **Bulk Batch Inserts**: Chunked insertion in 1,000-row transactions reduces database lock overhead.
2. **Composite Lookahead Indexing**: Index `ix_tx_cust_event_avail (customer_id, event_time, available_at)` narrows range scans to only eligible cutoff intervals.
3. **In-Memory Signature Cache**: Signature set comparisons avoid round-trip queries for duplicate detection.

---

## 12. Sample SQL Queries for Integrity Auditing

Verify counts and integrity in SQLite via Python or CLI:

```sql
-- 1. Verify Feature Uniqueness
SELECT customer_id, as_of_time, feature_version, COUNT(*)
FROM feature_snapshots
GROUP BY customer_id, as_of_time, feature_version
HAVING COUNT(*) > 1;
-- Expected Result: 0 rows

-- 2. Verify Referential Integrity (No Orphaned Records)
SELECT COUNT(*) 
FROM transactions t
LEFT JOIN customers c ON t.customer_id = c.customer_id
WHERE c.customer_id IS NULL;
-- Expected Result: 0

-- 3. Verify Non-Negative Amounts
SELECT COUNT(*) 
FROM transactions
WHERE amount < 0;
-- Expected Result: 0

-- 4. Verify Point-in-Time Cutoff Exclusion
-- Verify no transactions with event_time >= as_of_time were included in 7d count
SELECT s.customer_id, s.as_of_time, s.txn_count_7d, COUNT(t.transaction_id) as actual_eligible
FROM feature_snapshots s
JOIN transactions t ON s.customer_id = t.customer_id
  AND t.event_time < s.as_of_time
  AND t.available_at <= s.as_of_time
  AND t.event_time >= datetime(s.as_of_time, '-7 days')
GROUP BY s.snapshot_id;
-- Expected Result: txn_count_7d exactly equals actual_eligible
```

---

## 13. PostgreSQL & Supabase Migration Approach
1. Install PostgreSQL driver: `pip install psycopg2-binary`.
2. Update `.env`:
   ```bash
   DATABASE_URL="postgresql://postgres:[PASSWORD]@db.[PROJECT_REF].supabase.co:5432/postgres"
   ```
3. Run initialization: `python -m database.seed --reset`.
The SQLAlchemy models in `database/models.py` and DDL in `database/schema.sql` are 100% dialect-agnostic and tested.

---

## 14. GitHub Submission Instructions
1. Initialize repository and commit clean tracked files:
   ```powershell
   git add .
   git commit -m "feat: complete TimeSafe point-in-time feature pipeline"
   ```
2. Push to GitHub:
   ```powershell
   git remote add origin https://github.com/[USER]/timesafe-feature-pipeline.git
   git branch -M main
   git push -u origin main
   ```
3. Verify all secrets, `.db` files, and `node_modules` remain untracked per `.gitignore`.

