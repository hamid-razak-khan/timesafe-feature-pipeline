"""CLI Execution Entrypoint for TimeSafe Feature Pipeline."""
import os
import sys
import argparse

# Ensure project root in python path
PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

from database.db import get_engine, init_db, get_session
from backend.services.pipeline_runner import PipelineRunner
from scripts.generate_data import generate_datasets


def main():
    parser = argparse.ArgumentParser(description="Run TimeSafe Point-in-Time ML Feature Pipeline")
    parser.add_argument("--customers", type=str, default="data/raw/customers.csv", help="Path to customers.csv")
    parser.add_argument("--transactions", type=str, default="data/raw/transactions.csv", help="Path to transactions.csv")
    parser.add_argument("--predictions", type=str, default="data/raw/prediction_requests.csv", help="Path to prediction_requests.csv")
    parser.add_argument("--feature-version", type=str, default="v1", help="Feature schema version")
    parser.add_argument("--label-version", type=str, default="v1", help="Label schema version")
    parser.add_argument("--report", type=str, default="reports/validation_report.json", help="Path to validation report JSON")
    parser.add_argument("--generate-if-missing", action="store_true", help="Generate synthetic data if files do not exist")

    args = parser.parse_args()

    # Initialize tables
    engine = get_engine()
    init_db(engine)

    # Check files
    if not (os.path.exists(args.customers) and os.path.exists(args.transactions) and os.path.exists(args.predictions)):
        if args.generate_if_missing or True:
            print("Source CSV files not found or missing. Generating deterministic seed data...")
            generate_datasets(output_dir="data/raw")
        else:
            print("Error: Source data files not found and --generate-if-missing not specified.")
            sys.exit(1)

    print("==================================================")
    print("Starting TimeSafe Point-in-Time Pipeline Execution")
    print(f"Customers Source:    {args.customers}")
    print(f"Transactions Source: {args.transactions}")
    print(f"Predictions Source:  {args.predictions}")
    print(f"Feature Version:     {args.feature_version}")
    print(f"Report Output:       {args.report}")
    print("==================================================")

    with get_session() as session:
        runner = PipelineRunner(session)
        summary = runner.run_full_pipeline(
            customers_path=args.customers,
            transactions_path=args.transactions,
            predictions_path=args.predictions,
            feature_version=args.feature_version,
            label_version=args.label_version,
            report_path=args.report,
        )

    print("\n=== PIPELINE EXECUTION SUCCESSFUL ===")
    print(f"Run ID:                 {summary['run_id']}")
    print(f"Execution Duration:     {summary['duration_seconds']:.2f}s")
    print(f"Feature Snapshots:      {summary['feature_snapshots_count']}")
    print(f"Training Labels:        {summary['training_labels_count']}")
    print(f"Overall Audit Status:   {summary['reconciliation_report']['overall_status']}")
    print(f"Validation Report written to: {args.report}")


if __name__ == "__main__":
    main()

