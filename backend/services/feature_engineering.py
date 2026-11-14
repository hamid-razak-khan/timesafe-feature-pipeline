"""Point-in-Time Feature Engineering Engine for TimeSafe.

This module is the single source of truth for feature calculation.
It enforces strict anti-leakage dual-timestamp filtering:
    event_time < T AND available_at <= T
and window boundary invariants:
    [T - 7d, T) for 7-day window
    [T - 30d, T) for 30-day window

The single function `compute_features(...)` is used identically across both
offline training dataset generation and online/batch inference.
"""
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from typing import Dict, Any, List, Optional, Union
import pandas as pd
from sqlalchemy.orm import Session
from sqlalchemy import select, and_

from database.models import Transaction, FeatureSnapshot, Customer, utc_now


def compute_features(
    transactions: Union[pd.DataFrame, List[Dict[str, Any]], List[Transaction]],
    customer_id: str,
    as_of_time: datetime,
    feature_version: str = "v1",
) -> Dict[str, Any]:
    """Compute point-in-time correct features for a customer as of cutoff T.
    
    Invariants:
    1. Only consider transactions where:
         event_time < as_of_time
         AND available_at <= as_of_time
    2. 7-day lookback window:
         as_of_time - 7 days <= event_time < as_of_time
    3. 30-day lookback window:
         as_of_time - 30 days <= event_time < as_of_time
    4. Exact boundaries:
         event_time == as_of_time is EXCLUDED.
         event_time == as_of_time - 30 days is INCLUDED in 30d window.
         event_time == as_of_time - 7 days is INCLUDED in 7d window.
    5. Zero eligible transactions convention:
         counts = 0, sums = 0.00, avg = 0.00, days_since_last_txn = None.
    """
    # Ensure as_of_time has timezone (assume UTC if naive)
    if as_of_time.tzinfo is None:
        as_of_time = as_of_time.replace(tzinfo=timezone.utc)
    else:
        as_of_time = as_of_time.astimezone(timezone.utc)

    window_7d_start = as_of_time - timedelta(days=7)
    window_30d_start = as_of_time - timedelta(days=30)

    # Standardize input to list of dicts
    records = []
    if isinstance(transactions, pd.DataFrame):
        if not transactions.empty:
            records = transactions.to_dict(orient="records")
    elif isinstance(transactions, list):
        for item in transactions:
            if isinstance(item, dict):
                records.append(item)
            elif hasattr(item, "to_dict"):
                records.append(item.to_dict())
            else:
                records.append({
                    "transaction_id": getattr(item, "transaction_id", None),
                    "customer_id": getattr(item, "customer_id", None),
                    "event_time": getattr(item, "event_time", None),
                    "available_at": getattr(item, "available_at", None),
                    "amount": getattr(item, "amount", None),
                    "transaction_type": getattr(item, "transaction_type", None),
                })

    # Filter strictly for target customer and point-in-time availability
    eligible_txs = []
    for r in records:
        if str(r.get("customer_id")) != str(customer_id):
            continue

        ev = r.get("event_time")
        av = r.get("available_at")

        # Parse if string
        if isinstance(ev, str):
            ev = datetime.fromisoformat(ev.replace("Z", "+00:00"))
        if isinstance(av, str):
            av = datetime.fromisoformat(av.replace("Z", "+00:00"))

        if ev.tzinfo is None:
            ev = ev.replace(tzinfo=timezone.utc)
        else:
            ev = ev.astimezone(timezone.utc)

        if av.tzinfo is None:
            av = av.replace(tzinfo=timezone.utc)
        else:
            av = av.astimezone(timezone.utc)

        # STRICT POINT-IN-TIME DUAL CHECK
        # 1. Event must have occurred BEFORE cutoff T (strictly < T)
        # 2. Event must be AVAILABLE by cutoff T (<= T)
        if (ev < as_of_time) and (av <= as_of_time):
            amt = Decimal(str(r.get("amount", 0.0)))
            tx_type = str(r.get("transaction_type", "")).lower()
            eligible_txs.append({
                "transaction_id": r.get("transaction_id"),
                "event_time": ev,
                "available_at": av,
                "amount": amt,
                "transaction_type": tx_type,
            })

    # Defaults for zero eligible transactions
    txn_count_7d = 0
    txn_count_30d = 0
    total_purchase_amount_30d = Decimal("0.00")
    avg_purchase_amount_30d = Decimal("0.00")
    days_since_last_txn: Optional[float] = None
    refund_count_30d = 0
    refund_amount_30d = Decimal("0.00")

    if eligible_txs:
        # Find latest eligible transaction before cutoff
        latest_event_time = max(t["event_time"] for t in eligible_txs)
        time_diff = as_of_time - latest_event_time
        days_since_last_txn = round(time_diff.total_seconds() / 86400.0, 4)

        purchase_30d_amounts = []
        refund_30d_amounts = []

        for t in eligible_txs:
            ev = t["event_time"]
            amt = t["amount"]
            tx_type = t["transaction_type"]

            # 7-day window: [T - 7d, T)
            if window_7d_start <= ev < as_of_time:
                txn_count_7d += 1

            # 30-day window: [T - 30d, T)
            if window_30d_start <= ev < as_of_time:
                txn_count_30d += 1
                if tx_type == "purchase":
                    purchase_30d_amounts.append(amt)
                elif tx_type == "refund":
                    refund_30d_amounts.append(amt)

        if purchase_30d_amounts:
            total_purchase_amount_30d = sum(purchase_30d_amounts)
            avg_purchase_amount_30d = round(total_purchase_amount_30d / len(purchase_30d_amounts), 2)

        if refund_30d_amounts:
            refund_count_30d = len(refund_30d_amounts)
            refund_amount_30d = sum(refund_30d_amounts)

    return {
        "customer_id": customer_id,
        "as_of_time": as_of_time.isoformat(),
        "feature_version": feature_version,
        "txn_count_7d": txn_count_7d,
        "txn_count_30d": txn_count_30d,
        "total_purchase_amount_30d": float(total_purchase_amount_30d),
        "avg_purchase_amount_30d": float(avg_purchase_amount_30d),
        "days_since_last_txn": days_since_last_txn,
        "refund_count_30d": refund_count_30d,
        "refund_amount_30d": float(refund_amount_30d),
    }


class FeatureEngineeringService:
    """Service to compute and publish feature snapshots to the database."""

    def __init__(self, session: Session):
        self.session = session

    def generate_features_for_request(
        self,
        customer_id: str,
        as_of_time: datetime,
        feature_version: str = "v1",
        publish: bool = True,
    ) -> Dict[str, Any]:
        """Fetch eligible transactions from DB and compute feature snapshot."""
        # Check customer existence and verify cutoff does not predate customer
        customer = self.session.query(Customer).filter(Customer.customer_id == customer_id).first()
        if not customer:
            raise ValueError(f"Customer '{customer_id}' does not exist.")

        if as_of_time.tzinfo is None:
            as_of_time = as_of_time.replace(tzinfo=timezone.utc)
        else:
            as_of_time = as_of_time.astimezone(timezone.utc)

        cust_created = customer.created_at
        if cust_created.tzinfo is None:
            cust_created = cust_created.replace(tzinfo=timezone.utc)

        if as_of_time < cust_created:
            raise ValueError(
                f"Prediction cutoff {as_of_time.isoformat()} predates customer creation {cust_created.isoformat()}"
            )

        # Query all transactions for customer up to cutoff
        transactions = (
            self.session.query(Transaction)
            .filter(
                Transaction.customer_id == customer_id,
                Transaction.event_time < as_of_time,
                Transaction.available_at <= as_of_time,
            )
            .all()
        )

        features = compute_features(
            transactions=transactions,
            customer_id=customer_id,
            as_of_time=as_of_time,
            feature_version=feature_version,
        )

        if publish:
            # Idempotent upsert into feature_snapshots
            snapshot_id = f"SNAP_{customer_id}_{as_of_time.strftime('%Y%m%d%H%M%S')}_{feature_version}"
            existing = (
                self.session.query(FeatureSnapshot)
                .filter(
                    FeatureSnapshot.customer_id == customer_id,
                    FeatureSnapshot.as_of_time == as_of_time,
                    FeatureSnapshot.feature_version == feature_version,
                )
                .first()
            )

            if existing:
                # Update existing record idempotently
                existing.txn_count_7d = features["txn_count_7d"]
                existing.txn_count_30d = features["txn_count_30d"]
                existing.total_purchase_amount_30d = Decimal(str(features["total_purchase_amount_30d"]))
                existing.avg_purchase_amount_30d = Decimal(str(features["avg_purchase_amount_30d"]))
                existing.days_since_last_txn = features["days_since_last_txn"]
                existing.refund_count_30d = features["refund_count_30d"]
                existing.refund_amount_30d = Decimal(str(features["refund_amount_30d"]))
                existing.generated_at = utc_now()
            else:
                snapshot = FeatureSnapshot(
                    snapshot_id=snapshot_id,
                    customer_id=customer_id,
                    as_of_time=as_of_time,
                    feature_version=feature_version,
                    txn_count_7d=features["txn_count_7d"],
                    txn_count_30d=features["txn_count_30d"],
                    total_purchase_amount_30d=Decimal(str(features["total_purchase_amount_30d"])),
                    avg_purchase_amount_30d=Decimal(str(features["avg_purchase_amount_30d"])),
                    days_since_last_txn=features["days_since_last_txn"],
                    refund_count_30d=features["refund_count_30d"],
                    refund_amount_30d=Decimal(str(features["refund_amount_30d"])),
                    generated_at=utc_now(),
                )
                self.session.add(snapshot)
            self.session.flush()

        return features

    def compute_all_prediction_features(
        self,
        feature_version: str = "v1",
    ) -> List[Dict[str, Any]]:
        """Compute and publish feature snapshots for all prediction requests in DB."""
        from database.models import PredictionRequest
        requests = self.session.query(PredictionRequest).all()
        results = []
        for req in requests:
            try:
                feat = self.generate_features_for_request(
                    customer_id=req.customer_id,
                    as_of_time=req.as_of_time,
                    feature_version=feature_version,
                    publish=True,
                )
                results.append(feat)
            except ValueError as ve:
                logger.warning(f"Skipping prediction request {req.request_id}: {ve}")
                continue
        self.session.commit()
        return results

