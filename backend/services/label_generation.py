"""Target Label Generation Engine for TimeSafe.

Computes ground-truth binary outcome labels for training datasets:
    label_purchase_next_7d = 1 if >=1 purchase in [T, T + 7d) else 0.

Strictly enforces watermark completeness checks to prevent false negative
labels on incomplete observation windows.
"""
from datetime import datetime, timedelta, timezone
from typing import Dict, Any, List, Optional
from sqlalchemy.orm import Session
from sqlalchemy import func

from database.models import Transaction, TrainingLabel, PredictionRequest, Customer, utc_now


class LabelGenerationService:
    """Computes training labels with strict future-window completeness gating."""

    def __init__(self, session: Session, watermark_override: Optional[datetime] = None):
        self.session = session
        self.watermark_override = watermark_override

    def get_data_watermark(self) -> Optional[datetime]:
        """Compute the maximum available_at timestamp in the transactions table."""
        if self.watermark_override:
            wm = self.watermark_override
        else:
            max_avail = self.session.query(func.max(Transaction.available_at)).scalar()
            wm = max_avail

        if wm and wm.tzinfo is None:
            wm = wm.replace(tzinfo=timezone.utc)
        elif wm:
            wm = wm.astimezone(timezone.utc)
        return wm

    def compute_label_for_cutoff(
        self,
        customer_id: str,
        as_of_time: datetime,
        label_version: str = "v1",
        publish: bool = True,
    ) -> Dict[str, Any]:
        """Generate label_purchase_next_7d for a customer at cutoff T.
        
        Label window: [T, T + 7 days)
        Watermark gate: max_available_at >= T + 7 days.
        If watermark < T + 7 days, the window is incomplete and the label is unobservable.
        """
        if as_of_time.tzinfo is None:
            as_of_time = as_of_time.replace(tzinfo=timezone.utc)
        else:
            as_of_time = as_of_time.astimezone(timezone.utc)

        target_window_end = as_of_time + timedelta(days=7)
        watermark = self.get_data_watermark()

        # Completeness Check
        if watermark is None or watermark < target_window_end:
            return {
                "customer_id": customer_id,
                "as_of_time": as_of_time.isoformat(),
                "label_version": label_version,
                "is_observable": False,
                "reason": f"INCOMPLETE_FUTURE_WINDOW: Watermark {watermark.isoformat() if watermark else 'None'} < Required {target_window_end.isoformat()}",
                "label_purchase_next_7d": None,
            }

        # Query purchase transactions in [T, T + 7 days)
        purchases = (
            self.session.query(Transaction)
            .filter(
                Transaction.customer_id == customer_id,
                Transaction.transaction_type == "purchase",
                Transaction.event_time >= as_of_time,
                Transaction.event_time < target_window_end,
                Transaction.available_at <= watermark,
            )
            .all()
        )

        label_val = 1 if len(purchases) > 0 else 0

        if publish:
            label_id = f"LBL_{customer_id}_{as_of_time.strftime('%Y%m%d%H%M%S')}_{label_version}"
            existing = (
                self.session.query(TrainingLabel)
                .filter(
                    TrainingLabel.customer_id == customer_id,
                    TrainingLabel.as_of_time == as_of_time,
                    TrainingLabel.label_version == label_version,
                )
                .first()
            )

            if existing:
                existing.label_purchase_next_7d = label_val
                existing.generated_at = utc_now()
            else:
                lbl_obj = TrainingLabel(
                    label_id=label_id,
                    customer_id=customer_id,
                    as_of_time=as_of_time,
                    label_version=label_version,
                    label_purchase_next_7d=label_val,
                    generated_at=utc_now(),
                )
                self.session.add(lbl_obj)
            self.session.flush()

        return {
            "customer_id": customer_id,
            "as_of_time": as_of_time.isoformat(),
            "label_version": label_version,
            "is_observable": True,
            "label_purchase_next_7d": label_val,
        }

    def generate_all_labels(self, label_version: str = "v1") -> List[Dict[str, Any]]:
        """Compute labels for all prediction requests where future window is complete."""
        requests = self.session.query(PredictionRequest).all()
        results = []
        for req in requests:
            res = self.compute_label_for_cutoff(
                customer_id=req.customer_id,
                as_of_time=req.as_of_time,
                label_version=label_version,
                publish=True,
            )
            results.append(res)
        self.session.commit()
        return results
