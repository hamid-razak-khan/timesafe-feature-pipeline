"""Deterministic Synthetic Data Generator for TimeSafe Feature Pipeline.

Generates realistic e-commerce source datasets:
- customers.csv
- transactions.csv
- prediction_requests.csv

Includes controlled valid and intentionally invalid/edge-case records with
deterministic random seed 42.
"""
import os
import csv
import random
import hashlib
import argparse
from datetime import datetime, timedelta, timezone

SEED = 42

BASE_ANCHOR = datetime(2026, 1, 1, 0, 0, 0, tzinfo=timezone.utc)


def format_iso(dt: datetime) -> str:
    """Format datetime as UTC ISO-8601 string."""
    return dt.strftime("%Y-%m-%dT%H:%M:%SZ")


def generate_datasets(
    num_customers: int = 20,
    num_transactions: int = 100,
    num_predictions: int = 15,
    output_dir: str = "data/raw",
    include_invalid: bool = True,
    seed: int = SEED,
) -> dict:
    """Generate deterministic synthetic datasets."""
    random.seed(seed)
    os.makedirs(output_dir, exist_ok=True)

    customers_path = os.path.join(output_dir, "customers.csv")
    transactions_path = os.path.join(output_dir, "transactions.csv")
    predictions_path = os.path.join(output_dir, "prediction_requests.csv")

    segments = ["regular", "vip", "new", "dormant"]

    # 1. Generate Customers
    customers = []
    for i in range(1, num_customers + 1):
        cust_id = f"CUST_{i:04d}"
        created_delta_days = random.randint(35, 120)
        cust_created_at = BASE_ANCHOR + timedelta(days=created_delta_days)
        segment = random.choice(segments)
        customers.append({
            "customer_id": cust_id,
            "created_at": format_iso(cust_created_at),
            "customer_segment": segment,
        })

    with open(customers_path, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=["customer_id", "created_at", "customer_segment"])
        writer.writeheader()
        writer.writerows(customers)

    # 2. Generate Prediction Requests (as-of cutoffs)
    # Pick cutoffs occurring after customer creation
    prediction_requests = []
    # Fixed reference cutoffs for edge-case boundary testing
    fixed_cutoff = BASE_ANCHOR + timedelta(days=150)  # 2026-05-31T00:00:00Z
    
    for i in range(1, min(num_predictions + 1, num_customers + 1)):
        cust_id = f"CUST_{i:04d}"
        req_id = f"REQ_{i:04d}"
        # Cutoff between day 140 and 160
        as_of = fixed_cutoff if i == 1 else (BASE_ANCHOR + timedelta(days=random.randint(130, 160), hours=random.randint(0, 23)))
        prediction_requests.append({
            "request_id": req_id,
            "customer_id": cust_id,
            "as_of_time": format_iso(as_of),
        })

    # Add an edge case prediction request: Customer created AFTER cutoff
    if include_invalid and num_customers > 0:
        prediction_requests.append({
            "request_id": f"REQ_EARLY_{num_predictions+1:04d}",
            "customer_id": customers[-1]["customer_id"],
            "as_of_time": format_iso(BASE_ANCHOR + timedelta(days=1)),  # earlier than customer created_at
        })

    with open(predictions_path, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=["request_id", "customer_id", "as_of_time"])
        writer.writeheader()
        writer.writerows(prediction_requests)

    # 3. Generate Transactions
    transactions = []
    tx_counter = 1
    source_filename = "transactions.csv"

    # Specific deterministic transactions for CUST_0001 around fixed_cutoff (Day 150)
    # Day 150 is 2026-05-31T00:00:00Z
    # 1. Exactly at cutoff T (must be excluded from features)
    t_exact = fixed_cutoff
    transactions.append({
        "transaction_id": f"TX_{tx_counter:06d}",
        "customer_id": "CUST_0001",
        "event_time": format_iso(t_exact),
        "available_at": format_iso(t_exact + timedelta(minutes=5)),
        "amount": "100.00",
        "transaction_type": "purchase",
        "source_file": source_filename,
    })
    tx_counter += 1

    # 2. Exactly at T - 7 days (must be included in 7d and 30d)
    t_7d_boundary = fixed_cutoff - timedelta(days=7)
    transactions.append({
        "transaction_id": f"TX_{tx_counter:06d}",
        "customer_id": "CUST_0001",
        "event_time": format_iso(t_7d_boundary),
        "available_at": format_iso(t_7d_boundary + timedelta(minutes=10)),
        "amount": "50.00",
        "transaction_type": "purchase",
        "source_file": source_filename,
    })
    tx_counter += 1

    # 3. Exactly at T - 30 days (must be included in 30d, excluded from 7d)
    t_30d_boundary = fixed_cutoff - timedelta(days=30)
    transactions.append({
        "transaction_id": f"TX_{tx_counter:06d}",
        "customer_id": "CUST_0001",
        "event_time": format_iso(t_30d_boundary),
        "available_at": format_iso(t_30d_boundary + timedelta(minutes=10)),
        "amount": "75.00",
        "transaction_type": "purchase",
        "source_file": source_filename,
    })
    tx_counter += 1

    # 4. Late-arriving event: event_time < T, but available_at > T (must be EXCLUDED at T)
    transactions.append({
        "transaction_id": f"TX_{tx_counter:06d}",
        "customer_id": "CUST_0001",
        "event_time": format_iso(fixed_cutoff - timedelta(days=2)),
        "available_at": format_iso(fixed_cutoff + timedelta(hours=3)),
        "amount": "120.00",
        "transaction_type": "purchase",
        "source_file": source_filename,
    })
    tx_counter += 1

    # 5. Future purchase in [T, T + 7d) for training label verification
    transactions.append({
        "transaction_id": f"TX_{tx_counter:06d}",
        "customer_id": "CUST_0001",
        "event_time": format_iso(fixed_cutoff + timedelta(days=3)),
        "available_at": format_iso(fixed_cutoff + timedelta(days=3, hours=1)),
        "amount": "200.00",
        "transaction_type": "purchase",
        "source_file": source_filename,
    })
    tx_counter += 1

    # 6. Refund within 30d window
    transactions.append({
        "transaction_id": f"TX_{tx_counter:06d}",
        "customer_id": "CUST_0001",
        "event_time": format_iso(fixed_cutoff - timedelta(days=12)),
        "available_at": format_iso(fixed_cutoff - timedelta(days=12, hours=-1)),
        "amount": "25.00",
        "transaction_type": "refund",
        "source_file": source_filename,
    })
    tx_counter += 1

    # Now generate the bulk of standard valid transactions across customers
    remaining_valid = num_transactions - len(transactions) - (10 if include_invalid else 0)
    if remaining_valid < 0:
        remaining_valid = 10

    for _ in range(remaining_valid):
        cust = random.choice(customers)
        cust_id = cust["customer_id"]
        # event_time between day 40 and 170
        ev_day = random.randint(40, 170)
        ev_time = BASE_ANCHOR + timedelta(days=ev_day, hours=random.randint(0, 23), minutes=random.randint(0, 59))
        # available_at usually 1 to 120 minutes later (sometimes next day)
        lag_minutes = random.choice([5, 15, 30, 60, 240, 1440])
        avail_time = ev_time + timedelta(minutes=lag_minutes)
        tx_type = random.choices(["purchase", "refund"], weights=[0.88, 0.12])[0]
        amt = round(random.uniform(5.0, 500.0), 2)

        transactions.append({
            "transaction_id": f"TX_{tx_counter:06d}",
            "customer_id": cust_id,
            "event_time": format_iso(ev_time),
            "available_at": format_iso(avail_time),
            "amount": f"{amt:.2f}",
            "transaction_type": tx_type,
            "source_file": source_filename,
        })
        tx_counter += 1

    # Deliberate Invalid & Quarantine Test Records
    if include_invalid:
        # Invalid Case 1: Missing Customer ID
        transactions.append({
            "transaction_id": f"TX_{tx_counter:06d}",
            "customer_id": "",
            "event_time": format_iso(BASE_ANCHOR + timedelta(days=50)),
            "available_at": format_iso(BASE_ANCHOR + timedelta(days=50, minutes=10)),
            "amount": "49.99",
            "transaction_type": "purchase",
            "source_file": source_filename,
        })
        tx_counter += 1

        # Invalid Case 2: Foreign Key Violation (Non-existent customer)
        transactions.append({
            "transaction_id": f"TX_{tx_counter:06d}",
            "customer_id": "CUST_9999_DOES_NOT_EXIST",
            "event_time": format_iso(BASE_ANCHOR + timedelta(days=51)),
            "available_at": format_iso(BASE_ANCHOR + timedelta(days=51, minutes=10)),
            "amount": "89.00",
            "transaction_type": "purchase",
            "source_file": source_filename,
        })
        tx_counter += 1

        # Invalid Case 3: Negative Amount
        transactions.append({
            "transaction_id": f"TX_{tx_counter:06d}",
            "customer_id": "CUST_0001",
            "event_time": format_iso(BASE_ANCHOR + timedelta(days=52)),
            "available_at": format_iso(BASE_ANCHOR + timedelta(days=52, minutes=10)),
            "amount": "-45.50",
            "transaction_type": "purchase",
            "source_file": source_filename,
        })
        tx_counter += 1

        # Invalid Case 4: Invalid Transaction Type
        transactions.append({
            "transaction_id": f"TX_{tx_counter:06d}",
            "customer_id": "CUST_0001",
            "event_time": format_iso(BASE_ANCHOR + timedelta(days=53)),
            "available_at": format_iso(BASE_ANCHOR + timedelta(days=53, minutes=10)),
            "amount": "110.00",
            "transaction_type": "chargeback_unsupported",
            "source_file": source_filename,
        })
        tx_counter += 1

        # Invalid Case 5: Corrupt Timestamp format
        transactions.append({
            "transaction_id": f"TX_{tx_counter:06d}",
            "customer_id": "CUST_0001",
            "event_time": "invalid_date_format_2026",
            "available_at": format_iso(BASE_ANCHOR + timedelta(days=54, minutes=10)),
            "amount": "34.00",
            "transaction_type": "purchase",
            "source_file": source_filename,
        })
        tx_counter += 1

        # Invalid Case 6: Missing event_time
        transactions.append({
            "transaction_id": f"TX_{tx_counter:06d}",
            "customer_id": "CUST_0001",
            "event_time": "",
            "available_at": format_iso(BASE_ANCHOR + timedelta(days=55, minutes=10)),
            "amount": "15.00",
            "transaction_type": "purchase",
            "source_file": source_filename,
        })
        tx_counter += 1

        # Invalid Case 7: Available time earlier than event time (chronological anomaly)
        transactions.append({
            "transaction_id": f"TX_{tx_counter:06d}",
            "customer_id": "CUST_0001",
            "event_time": format_iso(BASE_ANCHOR + timedelta(days=56, hours=5)),
            "available_at": format_iso(BASE_ANCHOR + timedelta(days=56, hours=1)),  # 4 hours earlier!
            "amount": "60.00",
            "transaction_type": "purchase",
            "source_file": source_filename,
        })
        tx_counter += 1

        # Invalid Case 8: Duplicate Transaction ID in same file (Conflicting data)
        # Duplicate of TX_000001 with different amount
        transactions.append({
            "transaction_id": "TX_000001",
            "customer_id": "CUST_0001",
            "event_time": format_iso(fixed_cutoff),
            "available_at": format_iso(fixed_cutoff + timedelta(minutes=5)),
            "amount": "999.99",
            "transaction_type": "purchase",
            "source_file": source_filename,
        })
        tx_counter += 1

    # Shuffle transactions to simulate out-of-order arrival in real world logs
    random.shuffle(transactions)

    with open(transactions_path, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(
            f,
            fieldnames=["transaction_id", "customer_id", "event_time", "available_at", "amount", "transaction_type", "source_file"]
        )
        writer.writeheader()
        writer.writerows(transactions)

    # Compute deterministic file hashes for fingerprinting
    def compute_sha256(filepath: str) -> str:
        h = hashlib.sha256()
        with open(filepath, "rb") as f:
            while chunk := f.read(8192):
                h.update(chunk)
        return h.hexdigest()

    summary = {
        "seed": seed,
        "customers_count": len(customers),
        "prediction_requests_count": len(prediction_requests),
        "transactions_count": len(transactions),
        "output_dir": output_dir,
        "hashes": {
            "customers": compute_sha256(customers_path),
            "prediction_requests": compute_sha256(predictions_path),
            "transactions": compute_sha256(transactions_path),
        }
    }
    return summary


def generate_generic_sample_dataset(
    output_path: str = "data/raw/generic_sample_transactions.csv",
    num_entities: int = 25,
    num_events: int = 150,
    seed: int = SEED,
) -> dict:
    """Generate a domain-neutral generic transactional dataset.
    
    Fields:
    - entity_id (user, account, merchant, vehicle, device)
    - event_id
    - event_time
    - available_at (latency delay modeling)
    - amount (numerical magnitude)
    - event_type (order, transfer, payment, refund, audit, login)
    """
    random.seed(seed)
    os.makedirs(os.path.dirname(os.path.abspath(output_path)), exist_ok=True)

    event_types = ["payment", "transfer", "order", "fee", "refund"]
    entities = [f"ENT_{i:04d}" for i in range(1, num_entities + 1)]
    records = []

    # Fixed base timestamp
    base = datetime(2026, 4, 1, 0, 0, 0, tzinfo=timezone.utc)

    for i in range(1, num_events + 1):
        entity = random.choice(entities)
        # Event time spread over 60 days
        day_offset = random.randint(1, 60)
        hour_offset = random.randint(0, 23)
        min_offset = random.randint(0, 59)
        ev_time = base + timedelta(days=day_offset, hours=hour_offset, minutes=min_offset)

        # Ingestion lag: 5 mins to 6 hours
        lag_minutes = random.choice([5, 15, 30, 60, 180, 360])
        avail_time = ev_time + timedelta(minutes=lag_minutes)

        ev_type = random.choices(event_types, weights=[0.45, 0.25, 0.15, 0.10, 0.05])[0]
        amt = round(random.uniform(10.0, 850.0), 2)

        records.append({
            "entity_id": entity,
            "event_id": f"EVT_{i:06d}",
            "event_time": format_iso(ev_time),
            "available_at": format_iso(avail_time),
            "amount": f"{amt:.2f}",
            "event_type": ev_type,
        })

    # Shuffle to simulate out-of-order event streams
    random.shuffle(records)

    with open(output_path, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(
            f,
            fieldnames=["entity_id", "event_id", "event_time", "available_at", "amount", "event_type"]
        )
        writer.writeheader()
        writer.writerows(records)

    return {
        "file_path": output_path,
        "total_records": len(records),
        "total_entities": len(entities),
        "earliest_time": min(r["event_time"] for r in records),
        "latest_time": max(r["event_time"] for r in records),
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Deterministic Synthetic Data Generator for TimeSafe")
    parser.add_argument("--customers", type=int, default=20, help="Number of customers")
    parser.add_argument("--transactions", type=int, default=100, help="Number of transactions")
    parser.add_argument("--predictions", type=int, default=15, help="Number of prediction requests")
    parser.add_argument("--output-dir", type=str, default="data/raw", help="Output directory")
    parser.add_argument("--no-invalid", action="store_true", help="Exclude intentional invalid records")
    parser.add_argument("--seed", type=int, default=SEED, help="Random seed")

    args = parser.parse_args()
    result = generate_datasets(
        num_customers=args.customers,
        num_transactions=args.transactions,
        num_predictions=args.predictions,
        output_dir=args.output_dir,
        include_invalid=not args.no_invalid,
        seed=args.seed,
    )
    print("=== TimeSafe Synthetic Data Generation Complete ===")
    print(f"Directory: {result['output_dir']}")
    print(f"Customers: {result['customers_count']}")
    print(f"Predictions: {result['prediction_requests_count']}")
    print(f"Transactions: {result['transactions_count']}")
    print("File SHA256 fingerprints:")
    for k, v in result["hashes"].items():
        print(f"  - {k}: {v}")

