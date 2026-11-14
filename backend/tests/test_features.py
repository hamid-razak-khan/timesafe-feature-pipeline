"""Point-in-Time Feature Engine Correctness and Parity Tests."""
import pytest
import pandas as pd
from datetime import datetime, timedelta, timezone
from backend.services.feature_engineering import compute_features, FeatureEngineeringService
from database.models import Customer, Transaction


def test_feature_exact_boundary_inclusions():
    """Verify transactions exactly at T - 7d and T - 30d are properly included."""
    cutoff = datetime(2026, 5, 31, 0, 0, 0, tzinfo=timezone.utc)
    cust_id = "CUST_BOUND"

    txs = [
        # Exactly at T - 7 days (must be in 7d and 30d)
        {
            "transaction_id": "TX_7D_EXACT",
            "customer_id": cust_id,
            "event_time": cutoff - timedelta(days=7),
            "available_at": cutoff - timedelta(days=7),
            "amount": "100.00",
            "transaction_type": "purchase",
        },
        # Exactly at T - 30 days (must be in 30d, but NOT 7d)
        {
            "transaction_id": "TX_30D_EXACT",
            "customer_id": cust_id,
            "event_time": cutoff - timedelta(days=30),
            "available_at": cutoff - timedelta(days=30),
            "amount": "50.00",
            "transaction_type": "purchase",
        },
        # Just outside 30 days (T - 30 days - 1 second) -> must be EXCLUDED
        {
            "transaction_id": "TX_OUTSIDE_30D",
            "customer_id": cust_id,
            "event_time": cutoff - timedelta(days=30, seconds=1),
            "available_at": cutoff - timedelta(days=30, seconds=1),
            "amount": "999.00",
            "transaction_type": "purchase",
        },
    ]

    features = compute_features(txs, cust_id, cutoff)
    assert features["txn_count_7d"] == 1
    assert features["txn_count_30d"] == 2
    assert features["total_purchase_amount_30d"] == 150.0
    assert features["avg_purchase_amount_30d"] == 75.0
    assert features["days_since_last_txn"] == 7.0


def test_feature_out_of_order_invariance():
    """Features computed must be identical regardless of input list order."""
    cutoff = datetime(2026, 5, 31, 0, 0, 0, tzinfo=timezone.utc)
    cust_id = "CUST_ORDER"

    tx1 = {
        "transaction_id": "TX_1",
        "customer_id": cust_id,
        "event_time": cutoff - timedelta(days=3),
        "available_at": cutoff - timedelta(days=3),
        "amount": "20.00",
        "transaction_type": "purchase",
    }
    tx2 = {
        "transaction_id": "TX_2",
        "customer_id": cust_id,
        "event_time": cutoff - timedelta(days=10),
        "available_at": cutoff - timedelta(days=10),
        "amount": "80.00",
        "transaction_type": "purchase",
    }
    tx3 = {
        "transaction_id": "TX_3",
        "customer_id": cust_id,
        "event_time": cutoff - timedelta(days=5),
        "available_at": cutoff - timedelta(days=5),
        "amount": "10.00",
        "transaction_type": "refund",
    }

    order_a = [tx1, tx2, tx3]
    order_b = [tx3, tx1, tx2]
    order_c = [tx2, tx3, tx1]

    res_a = compute_features(order_a, cust_id, cutoff)
    res_b = compute_features(order_b, cust_id, cutoff)
    res_c = compute_features(order_c, cust_id, cutoff)

    assert res_a == res_b == res_c
    assert res_a["refund_count_30d"] == 1
    assert res_a["refund_amount_30d"] == 10.0


def test_training_inference_feature_parity():
    """Passing a Pandas DataFrame vs list of dicts to compute_features produces exact parity."""
    cutoff = datetime(2026, 5, 31, 0, 0, 0, tzinfo=timezone.utc)
    cust_id = "CUST_PARITY"

    raw_data = [
        {
            "transaction_id": "TX_A",
            "customer_id": cust_id,
            "event_time": cutoff - timedelta(days=2),
            "available_at": cutoff - timedelta(days=2),
            "amount": "150.00",
            "transaction_type": "purchase",
        },
        {
            "transaction_id": "TX_B",
            "customer_id": cust_id,
            "event_time": cutoff - timedelta(days=15),
            "available_at": cutoff - timedelta(days=15),
            "amount": "50.00",
            "transaction_type": "refund",
        },
    ]

    # Offline / Batch input format (Pandas DataFrame)
    df = pd.DataFrame(raw_data)
    batch_features = compute_features(df, cust_id, cutoff)

    # Online / Real-time inference format (List of dicts)
    online_features = compute_features(raw_data, cust_id, cutoff)

    assert batch_features == online_features
    assert batch_features["txn_count_7d"] == 1
    assert batch_features["txn_count_30d"] == 2
    assert batch_features["total_purchase_amount_30d"] == 150.0
    assert batch_features["refund_count_30d"] == 1


def test_feature_generation_rejects_cutoff_predating_customer(populated_test_db):
    """Attempting feature extraction before customer was created raises ValueError."""
    session, engine, _ = populated_test_db
    # CUST_0001 was created on 2026-01-10
    svc = FeatureEngineeringService(session)

    # Attempt cutoff on 2026-01-01 (before customer creation)
    with pytest.raises(ValueError, match="predates customer creation"):
        svc.generate_features_for_request(
            customer_id="CUST_0001",
            as_of_time=datetime(2026, 1, 1, 0, 0, 0, tzinfo=timezone.utc),
            publish=False,
        )

