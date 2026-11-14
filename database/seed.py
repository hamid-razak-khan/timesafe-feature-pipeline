"""Database Seed Script for TimeSafe Feature Pipeline.

Initializes the database schema and seeds initial data from data/raw CSVs.
"""
import os
import sys
from database.db import get_engine, init_db, reset_db
from scripts.generate_data import generate_datasets


def seed(reset: bool = False, raw_dir: str = "data/raw"):
    """Initialize schema and seed initial data files."""
    engine = get_engine()
    if reset:
        print("Resetting database tables...")
        reset_db(engine)
    else:
        print("Initializing database tables...")
        init_db(engine)

    customers_csv = os.path.join(raw_dir, "customers.csv")
    transactions_csv = os.path.join(raw_dir, "transactions.csv")
    predictions_csv = os.path.join(raw_dir, "prediction_requests.csv")

    if not (os.path.exists(customers_csv) and os.path.exists(transactions_csv) and os.path.exists(predictions_csv)):
        print(f"Data files not found in {raw_dir}. Generating synthetic dataset...")
        generate_datasets(output_dir=raw_dir)
    else:
        print(f"Verified source CSV files in {raw_dir}.")

    print("Database initialization and seed setup completed.")


if __name__ == "__main__":
    reset_flag = "--reset" in sys.argv
    seed(reset=reset_flag)

