"""Point-in-Time Anti-Leakage Test Suite for TimeSafe Feature Pipeline.

Verifies:
1. Future event leakage (event_time >= T excluded)
2. Late-available event leakage (available_at > T excluded)
3. Boundary at T (event_time == T strictly excluded)
4. Label independence (features never consume future labels)
5. Incomplete future window watermark gating (prevents negative label bias)
"""
import pytest
from datetime import datetime, timedelta, timezone
from backend.services.feature_engineering import compute_features, FeatureEngineeringService
from backend.services.label_generation import LabelGenerationService
from database.models import Transaction, Customer, PredictionRequest


def test_leakage_future_event_excluded():
    """Transaction occurring after cutoff T must NEVER affect features."""
    cutoff = datetime(2026, 5, 31, 12, 0, 0, tzinfo=timezone.utc)
    customer_id = "CUST_TEST_01"

    txs = [
        # Past eligible transaction
        {
            "transaction_id": "TX_PAST",
            "customer_id": customer_id,
            "event_time": cutoff - timedelta(days=2),
            "available_at": cutoff - timedelta(days=2, minutes=-5),
            "amount": "100.00",
            "transaction_type": "purchase",
        },
        # Future transaction (event_time > T)
        {
            "transaction_id": "TX_FUTURE",
            "customer_id": customer_id,
            "event_time": cutoff + timedelta(seconds=1),
            "available_at": cutoff + timedelta(seconds=10),
            "amount": "500.00",
            "transaction_type": "purchase",
        },
    ]

    features = compute_features(txs, customer_id, cutoff)
    assert features["txn_count_7d"] == 1
    assert features["txn_count_30d"] == 1
    assert features["total_purchase_amount_30d"] == 100.0
    assert features["avg_purchase_amount_30d"] == 100.0


def test_leakage_late_available_event_excluded():
    """Event occurred before T, but was only available AFTER T: MUST BE EXCLUDED at T."""
    cutoff = datetime(2026, 5, 31, 12, 0, 0, tzinfo=timezone.utc)
    customer_id = "CUST_TEST_02"

    txs = [
        # Event occurred 2 hours before cutoff, but ingestion/availability was delayed until 1 hour after cutoff
        {
            "transaction_id": "TX_LATE_ARRIVING",
            "customer_id": customer_id,
            "event_time": cutoff - timedelta(hours=2),
            "available_at": cutoff + timedelta(hours=1),  # available_at > T !
            "amount": "250.00",
            "transaction_type": "purchase",
        },
    ]

    features = compute_features(txs, customer_id, cutoff)
    # Must be completely excluded!
    assert features["txn_count_7d"] == 0
    assert features["txn_count_30d"] == 0
    assert features["total_purchase_amount_30d"] == 0.0
    assert features["days_since_last_txn"] is None


def test_leakage_transaction_exactly_at_cutoff():
    """Transaction with event_time == cutoff T must be strictly EXCLUDED."""
    cutoff = datetime(2026, 5, 31, 12, 0, 0, tzinfo=timezone.utc)
    customer_id = "CUST_TEST_03"

    txs = [
        {
            "transaction_id": "TX_EXACT_T",
            "customer_id": customer_id,
            "event_time": cutoff,  # Exactly at T
            "available_at": cutoff,
            "amount": "75.00",
            "transaction_type": "purchase",
        },
    ]

    features = compute_features(txs, customer_id, cutoff)
    assert features["txn_count_7d"] == 0
    assert features["txn_count_30d"] == 0
    assert features["total_purchase_amount_30d"] == 0.0


def test_label_watermark_gating_prevents_false_negative(populated_test_db):
    """If watermark < cutoff + 7 days, label must NOT be 0 (must be unobservable)."""
    session, engine, _ = populated_test_db
    customer_id = "CUST_0001"
    cutoff = datetime(2026, 5, 31, 0, 0, 0, tzinfo=timezone.utc)
    # Required observation window is [2026-05-31, 2026-06-07)

    # Insert a transaction with available_at only up to 2026-06-02 (incomplete future window)
    tx = Transaction(
        transaction_id="TX_EARLY",
        customer_id=customer_id,
        event_time=cutoff - timedelta(days=1),
        available_at=datetime(2026, 6, 2, 0, 0, 0, tzinfo=timezone.utc),
        amount=50.00,
        transaction_type="purchase",
        source_file="tx.csv",
    )
    session.add(tx)
    session.commit()

    label_service = LabelGenerationService(session)
    res = label_service.compute_label_for_cutoff(customer_id, cutoff, publish=False)

    assert res["is_observable"] is False
    assert res["label_purchase_next_7d"] is None
    assert "INCOMPLETE_FUTURE_WINDOW" in res["reason"]


def test_label_generation_when_window_complete(populated_test_db):
    """When watermark >= cutoff + 7 days, compute accurate binary label."""
    session, engine, _ = populated_test_db
    customer_id = "CUST_0001"
    cutoff = datetime(2026, 5, 31, 0, 0, 0, tzinfo=timezone.utc)
    watermark = datetime(2026, 6, 15, 0, 0, 0, tzinfo=timezone.utc)  # complete window

    # Add a future purchase on day 3
    future_tx = Transaction(
        transaction_id="TX_FUTURE_PURCHASE",
        customer_id=customer_id,
        event_time=cutoff + timedelta(days=3),
        available_at=cutoff + timedelta(days=3, hours=1),
        amount=150.00,
        transaction_type="purchase",
        source_file="tx.csv",
    )
    session.add(future_tx)
    session.commit()

    label_service = LabelGenerationService(session, watermark_override=watermark)
    res = label_service.compute_label_for_cutoff(customer_id, cutoff, publish=True)

    assert res["is_observable"] is True
    assert res["label_purchase_next_7d"] == 1


def test_future_or_late_arriving_event_does_not_alter_historical_feature(populated_test_db):
    """
    Deterministic proof that inserting future or late-arriving events
    does not alter previously computed historical features for cutoff T.
    """
    from database.models import FeatureSnapshot

    session, engine, _ = populated_test_db
    customer_id = "CUST_0001"
    cutoff = datetime(2026, 5, 31, 12, 0, 0, tzinfo=timezone.utc)

    # 1. Seed historical baseline transaction (5 days before T)
    baseline_tx = Transaction(
        transaction_id="TX_BASELINE_PAST",
        customer_id=customer_id,
        event_time=cutoff - timedelta(days=5),
        available_at=cutoff - timedelta(days=5, minutes=-10),
        amount=100.00,
        transaction_type="purchase",
        source_file="initial_batch.csv",
    )
    session.add(baseline_tx)
    session.commit()

    service = FeatureEngineeringService(session)

    # 2. Compute and publish baseline feature snapshot as of cutoff T
    initial_features = service.generate_features_for_request(
        customer_id=customer_id,
        as_of_time=cutoff,
        feature_version="v1",
        publish=True,
    )
    assert initial_features["txn_count_7d"] == 1
    assert initial_features["txn_count_30d"] == 1
    assert initial_features["total_purchase_amount_30d"] == 100.0
    assert initial_features["avg_purchase_amount_30d"] == 100.0

    # 3. Insert future event (event_time > T)
    future_tx = Transaction(
        transaction_id="TX_LEAKAGE_FUTURE",
        customer_id=customer_id,
        event_time=cutoff + timedelta(hours=3),
        available_at=cutoff + timedelta(hours=3, minutes=10),
        amount=999.00,
        transaction_type="purchase",
        source_file="future_stream.csv",
    )

    # 4. Insert late-arriving event (event_time < T, but available_at > T)
    late_tx = Transaction(
        transaction_id="TX_LEAKAGE_LATE_ARRIVING",
        customer_id=customer_id,
        event_time=cutoff - timedelta(hours=2),
        available_at=cutoff + timedelta(hours=6),  # Available ONLY after T!
        amount=777.00,
        transaction_type="purchase",
        source_file="late_stream.csv",
    )
    session.add_all([future_tx, late_tx])
    session.commit()

    # 5. Re-evaluate features at cutoff T
    recalculated_features = service.generate_features_for_request(
        customer_id=customer_id,
        as_of_time=cutoff,
        feature_version="v1",
        publish=False,
    )

    # 6. Mathematical Invariant Verification: All features at cutoff T MUST REMAIN IDENTICAL
    assert recalculated_features["txn_count_7d"] == initial_features["txn_count_7d"] == 1
    assert recalculated_features["txn_count_30d"] == initial_features["txn_count_30d"] == 1
    assert recalculated_features["total_purchase_amount_30d"] == initial_features["total_purchase_amount_30d"] == 100.0
    assert recalculated_features["avg_purchase_amount_30d"] == initial_features["avg_purchase_amount_30d"] == 100.0
    assert recalculated_features["days_since_last_txn"] == initial_features["days_since_last_txn"]

    # Verify published snapshot in database was not mutated
    snapshot = (
        session.query(FeatureSnapshot)
        .filter(
            FeatureSnapshot.customer_id == customer_id,
            FeatureSnapshot.as_of_time == cutoff,
            FeatureSnapshot.feature_version == "v1",
        )
        .first()
    )
    assert snapshot is not None
    assert snapshot.txn_count_7d == 1
    assert float(snapshot.total_purchase_amount_30d) == 100.0

