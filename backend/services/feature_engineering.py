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
    column_mapping: Optional[Dict[str, str]] = None,
    feature_options: Optional[List[str]] = None,
    assume_available_at_event_time: bool = False,
) -> Dict[str, Any]:
    """Compute point-in-time correct features for an entity as of cutoff T.
    
    Supports configurable column mappings for domain-neutral datasets:
        column_mapping: {
            "entity_id": "customer_id" | "account_id" | "entity_id",
            "event_time": "event_time" | "timestamp",
            "available_at": "available_at" | "ingested_at" | None,
            "amount": "amount" | "value" | None,
            "event_type": "transaction_type" | "event_type" | None
        }

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
    # Active column mapping with sensible defaults
    mapping = {
        "entity_id": "customer_id",
        "event_time": "event_time",
        "available_at": "available_at",
        "amount": "amount",
        "event_type": "transaction_type",
    }
    if column_mapping:
        mapping.update(column_mapping)

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

    # Filter strictly for target entity and point-in-time availability
    eligible_txs = []
    entity_key = mapping["entity_id"]
    event_time_key = mapping["event_time"]
    avail_key = mapping.get("available_at")
    amount_key = mapping.get("amount")
    type_key = mapping.get("event_type")

    for r in records:
        # Check entity match (fallback to customer_id or entity_id)
        r_entity = r.get(entity_key)
        if r_entity is None:
            r_entity = r.get("customer_id") if "customer_id" in r else r.get("entity_id")

        if str(r_entity) != str(customer_id):
            continue

        ev = r.get(event_time_key) or r.get("event_time")
        if ev is None:
            continue

        av = None
        if avail_key and avail_key in r and r.get(avail_key):
            av = r.get(avail_key)
        elif "available_at" in r and r.get("available_at"):
            av = r.get("available_at")
        elif assume_available_at_event_time:
            av = ev

        if av is None:
            # Without availability timestamp, cannot verify leakage gate
            continue

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
            amt_val = 0.0
            if amount_key and amount_key in r and r.get(amount_key) is not None:
                amt_val = r.get(amount_key)
            elif "amount" in r and r.get("amount") is not None:
                amt_val = r.get("amount")

            try:
                amt = Decimal(str(amt_val))
            except Exception:
                amt = Decimal("0.00")

            ev_type = "event"
            if type_key and type_key in r and r.get(type_key):
                ev_type = str(r.get(type_key)).lower()
            elif "transaction_type" in r and r.get("transaction_type"):
                ev_type = str(r.get("transaction_type")).lower()
            elif "event_type" in r and r.get("event_type"):
                ev_type = str(r.get("event_type")).lower()

            eligible_txs.append({
                "event_time": ev,
                "available_at": av,
                "amount": amt,
                "event_type": ev_type,
            })

    # Defaults for zero eligible transactions
    txn_count_7d = 0
    txn_count_30d = 0
    total_purchase_amount_30d = Decimal("0.00")
    total_amount_30d = Decimal("0.00")
    avg_purchase_amount_30d = Decimal("0.00")
    avg_amount_30d = Decimal("0.00")
    days_since_last_txn: Optional[float] = None
    refund_count_30d = 0
    refund_amount_30d = Decimal("0.00")

    if eligible_txs:
        # Find latest eligible transaction before cutoff
        latest_event_time = max(t["event_time"] for t in eligible_txs)
        time_diff = as_of_time - latest_event_time
        days_since_last_txn = round(time_diff.total_seconds() / 86400.0, 4)

        purchase_30d_amounts = []
        all_30d_amounts = []
        refund_30d_amounts = []

        for t in eligible_txs:
            ev = t["event_time"]
            amt = t["amount"]
            ev_type = t["event_type"]

            # 7-day window: [T - 7d, T)
            if window_7d_start <= ev < as_of_time:
                txn_count_7d += 1

            # 30-day window: [T - 30d, T)
            if window_30d_start <= ev < as_of_time:
                txn_count_30d += 1
                all_30d_amounts.append(amt)
                if ev_type in ("purchase", "order", "payment", "transfer"):
                    purchase_30d_amounts.append(amt)
                elif ev_type in ("refund", "chargeback"):
                    refund_30d_amounts.append(amt)

        if all_30d_amounts:
            total_amount_30d = sum(all_30d_amounts)
            avg_amount_30d = round(total_amount_30d / len(all_30d_amounts), 2)

        if purchase_30d_amounts:
            total_purchase_amount_30d = sum(purchase_30d_amounts)
            avg_purchase_amount_30d = round(total_purchase_amount_30d / len(purchase_30d_amounts), 2)
        elif all_30d_amounts:
            # Fallback for generic datasets without purchase/refund distinction
            total_purchase_amount_30d = total_amount_30d
            avg_purchase_amount_30d = avg_amount_30d

        if refund_30d_amounts:
            refund_count_30d = len(refund_30d_amounts)
            refund_amount_30d = sum(refund_30d_amounts)

    res = {
        "customer_id": customer_id,
        "entity_id": customer_id,
        "as_of_time": as_of_time.isoformat(),
        "feature_version": feature_version,
        # Backward-compatible e-commerce keys
        "txn_count_7d": txn_count_7d,
        "txn_count_30d": txn_count_30d,
        "total_purchase_amount_30d": float(total_purchase_amount_30d),
        "avg_purchase_amount_30d": float(avg_purchase_amount_30d),
        "days_since_last_txn": days_since_last_txn,
        "refund_count_30d": refund_count_30d,
        "refund_amount_30d": float(refund_amount_30d),
        # Domain-neutral generic aliases
        "event_count_7d": txn_count_7d,
        "event_count_30d": txn_count_30d,
        "total_amount_30d": float(total_amount_30d),
        "avg_amount_30d": float(avg_amount_30d),
        "days_since_last_event": days_since_last_txn,
    }

    # Filter specific options if user explicitly requested a subset
    if feature_options:
        filtered_res = {
            "entity_id": customer_id,
            "customer_id": customer_id,
            "as_of_time": as_of_time.isoformat(),
            "feature_version": feature_version,
        }
        if "count_7d" in feature_options:
            filtered_res["event_count_7d"] = txn_count_7d
            filtered_res["txn_count_7d"] = txn_count_7d
        if "count_30d" in feature_options:
            filtered_res["event_count_30d"] = txn_count_30d
            filtered_res["txn_count_30d"] = txn_count_30d
        if "total_amount_30d" in feature_options:
            filtered_res["total_amount_30d"] = float(total_amount_30d)
            filtered_res["total_purchase_amount_30d"] = float(total_purchase_amount_30d)
        if "avg_amount_30d" in feature_options:
            filtered_res["avg_amount_30d"] = float(avg_amount_30d)
            filtered_res["avg_purchase_amount_30d"] = float(avg_purchase_amount_30d)
        if "days_since_last" in feature_options:
            filtered_res["days_since_last_event"] = days_since_last_txn
            filtered_res["days_since_last_txn"] = days_since_last_txn
        if "type_counts" in feature_options:
            filtered_res["refund_count_30d"] = refund_count_30d
            filtered_res["refund_amount_30d"] = float(refund_amount_30d)
        return filtered_res

    return res


def compute_generic_dataset_features(
    records: List[Dict[str, Any]],
    column_mapping: Dict[str, str],
    cutoff_time: datetime,
    feature_options: Optional[List[str]] = None,
    assume_available_at_event_time: bool = False,
    feature_version: str = "v1",
) -> List[Dict[str, Any]]:
    """Compute point-in-time features for all unique entities in a generic dataset."""
    entity_col = column_mapping.get("entity_id", "entity_id")
    unique_entities = sorted(list(set(
        str(r.get(entity_col) or r.get("customer_id") or r.get("entity_id"))
        for r in records
        if (r.get(entity_col) or r.get("customer_id") or r.get("entity_id")) is not None
    )))

    results = []
    for ent in unique_entities:
        feat = compute_features(
            transactions=records,
            customer_id=ent,
            as_of_time=cutoff_time,
            feature_version=feature_version,
            column_mapping=column_mapping,
            feature_options=feature_options,
            assume_available_at_event_time=assume_available_at_event_time,
        )
        results.append(feat)
    return results


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

