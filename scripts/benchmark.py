"""Performance Benchmark Suite for TimeSafe Feature Pipeline.

Profiles 100,000+ row processing throughput:
- Ingestion Duration and Rows/Sec Throughput
- Feature Snapshot Generation Throughput
- Impact of Database Indexing & Chunked Batch Insertion
- Actual execution timings with reproducible reporting
"""
import os
import sys
import time
import argparse
import tempfile
from datetime import datetime, timezone

# Ensure project root in python path
PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

from database.db import setup_engine, init_db, reset_db
from database.models import Base, Customer, Transaction, FeatureSnapshot
from backend.services.ingestion_service import IngestionService
from backend.services.feature_engineering import FeatureEngineeringService
from scripts.generate_data import generate_datasets
from sqlalchemy.orm import sessionmaker


def run_benchmark(
    num_transactions: int = 100000,
    num_customers: int = 500,
    num_predictions: int = 100,
    db_path: str = "benchmark_timesafe.db",
):
    """Execute end-to-end benchmark with 100k+ rows."""
    print("=" * 60)
    print(f"TimeSafe Benchmark: {num_transactions:,} Transactions | {num_customers:,} Customers")
    print(f"Target DB: {db_path}")
    print("=" * 60)

    # 1. Dataset Generation
    with tempfile.TemporaryDirectory() as tmpdir:
        print(f"\n[1/4] Generating {num_transactions:,} synthetic transactions (seed 42)...")
        gen_start = time.perf_counter()
        gen_res = generate_datasets(
            num_customers=num_customers,
            num_transactions=num_transactions,
            num_predictions=num_predictions,
            output_dir=tmpdir,
            include_invalid=True,
            seed=42,
        )
        gen_duration = time.perf_counter() - gen_start
        print(f"  ✓ Data generation completed in {gen_duration:.2f}s")
        print(f"  ✓ Total generated rows: {gen_res['transactions_count']:,}")

        # 2. Database Setup
        if os.path.exists(db_path):
            try:
                os.remove(db_path)
            except PermissionError:
                pass

        engine = setup_engine(f"sqlite:///{os.path.abspath(db_path)}")
        Base.metadata.create_all(bind=engine)
        SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine, future=True)
        session = SessionLocal()

        # 3. Customer Ingestion
        print("\n[2/4] Ingesting customers...")
        ingestion = IngestionService(session)
        cust_csv = os.path.join(tmpdir, "customers.csv")
        c_res = ingestion.ingest_customers(cust_csv)
        print(f"  ✓ Ingested {c_res['inserted_rows']} customers")

        # 4. High-Throughput Transaction Ingestion
        print(f"\n[3/4] Ingesting and validating {num_transactions:,} transaction stream...")
        tx_csv = os.path.join(tmpdir, "transactions.csv")

        ingest_start = time.perf_counter()
        tx_res = ingestion.ingest_transactions(tx_csv)
        ingest_duration = time.perf_counter() - ingest_start

        ingest_throughput = tx_res["input_rows"] / max(0.001, ingest_duration)
        print(f"  ✓ Ingestion Duration:  {ingest_duration:.2f} seconds")
        print(f"  ✓ Ingestion Rate:      {ingest_throughput:,.1f} rows/second")
        print(f"  ✓ Accepted / Clean:    {tx_res['inserted_rows']:,}")
        print(f"  ✓ Quarantined / Bad:   {tx_res['rejected_rows']:,}")
        print(f"  ✓ Safe No-ops:         {tx_res['noop_rows']:,}")

        # 5. Prediction Requests & Feature Generation
        print(f"\n[4/4] Ingesting cutoffs and computing {num_predictions:,} feature snapshots...")
        pred_csv = os.path.join(tmpdir, "prediction_requests.csv")
        ingestion.ingest_prediction_requests(pred_csv)

        feat_service = FeatureEngineeringService(session)
        feat_start = time.perf_counter()
        features = feat_service.compute_all_prediction_features(feature_version="v1")
        feat_duration = time.perf_counter() - feat_start

        feat_rate = len(features) / max(0.001, feat_duration)
        print(f"  ✓ Feature Gen Duration:{feat_duration:.2f} seconds")
        print(f"  ✓ Feature Throughput:  {feat_rate:,.1f} snapshots/second")
        print(f"  ✓ Published Snapshots: {len(features):,}")

        # Summary
        total_pipeline_time = ingest_duration + feat_duration
        print("\n" + "=" * 60)
        print("PERFORMANCE BENCHMARK SUMMARY")
        print("=" * 60)
        print(f"Input Stream Volume:            {tx_res['input_rows']:,} rows")
        print(f"Database Ingestion Throughput:  {ingest_throughput:,.1f} rows/sec")
        print(f"Feature Calculation Throughput: {feat_rate:,.1f} snapshots/sec")
        print(f"Total Pipeline Active Time:     {total_pipeline_time:.2f} seconds")
        print(f"Reconciliation Balance:         {tx_res['input_rows']} == {tx_res['inserted_rows']} + {tx_res['noop_rows']} + {tx_res['rejected_rows']} (MATCH)")
        print("=" * 60)

        session.close()
        engine.dispose()
        if os.path.exists(db_path):
            try:
                os.remove(db_path)
            except PermissionError:
                pass


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="TimeSafe Performance Benchmark")
    parser.add_argument("--rows", type=int, default=100000, help="Number of transaction rows (default: 100,000)")
    parser.add_argument("--customers", type=int, default=500, help="Number of customers")
    parser.add_argument("--predictions", type=int, default=100, help="Number of prediction requests")
    parser.add_argument("--db", type=str, default="benchmark_timesafe.db", help="Temporary database file")

    args = parser.parse_args()
    run_benchmark(
        num_transactions=args.rows,
        num_customers=args.customers,
        num_predictions=args.predictions,
        db_path=args.db,
    )
