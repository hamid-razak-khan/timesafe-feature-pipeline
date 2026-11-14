"""Validation Service for TimeSafe Feature Pipeline.

Enforces schema contracts, business logic, referential integrity, and
chronological rules across customers, transactions, and prediction requests.
"""
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation
from typing import Dict, Any, List, Optional, Tuple, Set
from dataclasses import dataclass


@dataclass
class ValidationResult:
    is_valid: bool
    is_noop: bool = False
    cleaned_data: Optional[Dict[str, Any]] = None
    rejection_reason: Optional[str] = None
    raw_record: Optional[str] = None


class ValidationService:
    """Deterministic validation engine for source data."""

    REQUIRED_TRANSACTION_COLUMNS = {
        "transaction_id",
        "customer_id",
        "event_time",
        "available_at",
        "amount",
        "transaction_type",
    }

    REQUIRED_CUSTOMER_COLUMNS = {
        "customer_id",
        "created_at",
    }

    REQUIRED_PREDICTION_COLUMNS = {
        "request_id",
        "customer_id",
        "as_of_time",
    }

    VALID_TRANSACTION_TYPES = {"purchase", "refund"}

    @staticmethod
    def parse_utc_timestamp(val: Any) -> Optional[datetime]:
        """Parse various ISO-8601 string representations into UTC-aware datetime.
        
        Returns None if parsing fails or input is empty.
        """
        if not val or not isinstance(val, str):
            return None
        val_clean = val.strip()
        if not val_clean:
            return None

        # Standard ISO-8601 parsing
        try:
            # Replace 'Z' with '+00:00' for fromisoformat compatibility
            if val_clean.endswith("Z"):
                val_clean = val_clean[:-1] + "+00:00"
            dt = datetime.fromisoformat(val_clean)
            if dt.tzinfo is None:
                # Assume UTC if naive
                dt = dt.replace(tzinfo=timezone.utc)
            else:
                # Convert to UTC
                dt = dt.astimezone(timezone.utc)
            return dt
        except (ValueError, TypeError):
            # Fallback patterns
            for fmt in (
                "%Y-%m-%d %H:%M:%S",
                "%Y-%m-%d %H:%M:%S%z",
                "%Y-%m-%dT%H:%M:%S",
                "%Y-%m-%dT%H:%M:%S.%f",
                "%Y-%m-%dT%H:%M:%S.%f%z",
            ):
                try:
                    dt = datetime.strptime(val.strip(), fmt)
                    if dt.tzinfo is None:
                        dt = dt.replace(tzinfo=timezone.utc)
                    else:
                        dt = dt.astimezone(timezone.utc)
                    return dt
                except ValueError:
                    continue
        return None

    @classmethod
    def validate_transaction_schema(cls, columns: List[str]) -> Tuple[bool, Optional[str]]:
        """Verify presence of required transaction columns."""
        col_set = set(columns)
        missing = cls.REQUIRED_TRANSACTION_COLUMNS - col_set
        if missing:
            return False, f"MISSING_REQUIRED_COLUMNS: {sorted(list(missing))}"
        return True, None

    @classmethod
    def validate_customer_schema(cls, columns: List[str]) -> Tuple[bool, Optional[str]]:
        """Verify presence of required customer columns."""
        col_set = set(columns)
        missing = cls.REQUIRED_CUSTOMER_COLUMNS - col_set
        if missing:
            return False, f"MISSING_REQUIRED_COLUMNS: {sorted(list(missing))}"
        return True, None

    @classmethod
    def validate_prediction_schema(cls, columns: List[str]) -> Tuple[bool, Optional[str]]:
        """Verify presence of required prediction request columns."""
        col_set = set(columns)
        missing = cls.REQUIRED_PREDICTION_COLUMNS - col_set
        if missing:
            return False, f"MISSING_REQUIRED_COLUMNS: {sorted(list(missing))}"
        return True, None

    @classmethod
    def validate_customer_row(
        cls,
        row: Dict[str, Any],
        seen_ids: Set[str],
    ) -> ValidationResult:
        """Validate a single customer record."""
        cust_id = str(row.get("customer_id", "") or "").strip()
        if not cust_id:
            return ValidationResult(
                is_valid=False,
                rejection_reason="NULL_OR_EMPTY_CUSTOMER_ID",
                raw_record=str(row),
            )

        if cust_id in seen_ids:
            return ValidationResult(
                is_valid=False,
                rejection_reason="DUPLICATE_CUSTOMER_ID_IN_FILE",
                raw_record=str(row),
            )

        created_at_raw = row.get("created_at")
        created_at = cls.parse_utc_timestamp(created_at_raw)
        if created_at is None:
            return ValidationResult(
                is_valid=False,
                rejection_reason="INVALID_OR_MISSING_CREATED_AT_TIMESTAMP",
                raw_record=str(row),
            )

        segment = str(row.get("customer_segment", "") or "").strip() or None

        return ValidationResult(
            is_valid=True,
            cleaned_data={
                "customer_id": cust_id,
                "created_at": created_at,
                "customer_segment": segment,
            },
        )

    @classmethod
    def validate_transaction_row(
        cls,
        row: Dict[str, Any],
        known_customers: Dict[str, datetime],  # customer_id -> created_at
        seen_tx_ids: Set[str],
        source_file: str = "unknown",
    ) -> ValidationResult:
        """Validate a single transaction record against business and referential rules."""
        raw_str = str(row)

        # 1. Primary Key check
        tx_id = str(row.get("transaction_id", "") or "").strip()
        if not tx_id:
            return ValidationResult(
                is_valid=False,
                rejection_reason="NULL_OR_EMPTY_TRANSACTION_ID",
                raw_record=raw_str,
            )

        # Check duplicate within same file batch
        if tx_id in seen_tx_ids:
            return ValidationResult(
                is_valid=False,
                rejection_reason="DUPLICATE_TRANSACTION_ID_IN_FILE",
                raw_record=raw_str,
            )

        # 2. Foreign Key check (Customer exists)
        cust_id = str(row.get("customer_id", "") or "").strip()
        if not cust_id:
            return ValidationResult(
                is_valid=False,
                rejection_reason="NULL_OR_EMPTY_CUSTOMER_ID",
                raw_record=raw_str,
            )

        if cust_id not in known_customers:
            return ValidationResult(
                is_valid=False,
                rejection_reason=f"FOREIGN_KEY_VIOLATION: customer '{cust_id}' does not exist",
                raw_record=raw_str,
            )

        # 3. Timestamps check
        event_time_raw = row.get("event_time")
        event_time = cls.parse_utc_timestamp(event_time_raw)
        if event_time is None:
            return ValidationResult(
                is_valid=False,
                rejection_reason="INVALID_OR_MISSING_EVENT_TIME",
                raw_record=raw_str,
            )

        available_at_raw = row.get("available_at")
        available_at = cls.parse_utc_timestamp(available_at_raw)
        if available_at is None:
            return ValidationResult(
                is_valid=False,
                rejection_reason="INVALID_OR_MISSING_AVAILABLE_AT",
                raw_record=raw_str,
            )

        # 4. Chronological order checks
        if event_time.tzinfo is None:
            event_time = event_time.replace(tzinfo=timezone.utc)
        if available_at.tzinfo is None:
            available_at = available_at.replace(tzinfo=timezone.utc)

        # available_at must not be before event_time
        if available_at < event_time:
            return ValidationResult(
                is_valid=False,
                rejection_reason="AVAILABLE_TIME_PREDATES_EVENT_TIME",
                raw_record=raw_str,
            )

        # Customer must exist before or at event_time
        cust_created_at = known_customers[cust_id]
        if cust_created_at.tzinfo is None:
            cust_created_at = cust_created_at.replace(tzinfo=timezone.utc)

        if event_time < cust_created_at:
            return ValidationResult(
                is_valid=False,
                rejection_reason=f"TRANSACTION_PREDATES_CUSTOMER_CREATION ({event_time.isoformat()} < {cust_created_at.isoformat()})",
                raw_record=raw_str,
            )

        # 5. Amount check
        amount_raw = row.get("amount")
        if amount_raw is None or str(amount_raw).strip() == "":
            return ValidationResult(
                is_valid=False,
                rejection_reason="NULL_REQUIRED_FIELD_AMOUNT",
                raw_record=raw_str,
            )

        try:
            amount = Decimal(str(amount_raw).strip())
        except (InvalidOperation, TypeError, ValueError):
            return ValidationResult(
                is_valid=False,
                rejection_reason=f"INVALID_AMOUNT_FORMAT: '{amount_raw}'",
                raw_record=raw_str,
            )

        if amount < 0:
            return ValidationResult(
                is_valid=False,
                rejection_reason=f"NEGATIVE_AMOUNT_NOT_PERMITTED: {amount}",
                raw_record=raw_str,
            )

        # 6. Transaction Type check
        tx_type = str(row.get("transaction_type", "") or "").strip().lower()
        if tx_type not in cls.VALID_TRANSACTION_TYPES:
            return ValidationResult(
                is_valid=False,
                rejection_reason=f"INVALID_TRANSACTION_TYPE: '{tx_type}' (expected 'purchase' or 'refund')",
                raw_record=raw_str,
            )

        # Valid Record
        return ValidationResult(
            is_valid=True,
            cleaned_data={
                "transaction_id": tx_id,
                "customer_id": cust_id,
                "event_time": event_time,
                "available_at": available_at,
                "amount": amount,
                "transaction_type": tx_type,
                "source_file": source_file,
            },
        )

    @classmethod
    def validate_prediction_row(
        cls,
        row: Dict[str, Any],
        known_customers: Dict[str, datetime],
        seen_req_ids: Set[str],
    ) -> ValidationResult:
        """Validate a prediction request record."""
        raw_str = str(row)
        req_id = str(row.get("request_id", "") or "").strip()
        if not req_id:
            return ValidationResult(
                is_valid=False,
                rejection_reason="NULL_OR_EMPTY_REQUEST_ID",
                raw_record=raw_str,
            )

        if req_id in seen_req_ids:
            return ValidationResult(
                is_valid=False,
                rejection_reason="DUPLICATE_REQUEST_ID_IN_FILE",
                raw_record=raw_str,
            )

        cust_id = str(row.get("customer_id", "") or "").strip()
        if not cust_id:
            return ValidationResult(
                is_valid=False,
                rejection_reason="NULL_OR_EMPTY_CUSTOMER_ID",
                raw_record=raw_str,
            )

        if cust_id not in known_customers:
            return ValidationResult(
                is_valid=False,
                rejection_reason=f"FOREIGN_KEY_VIOLATION: customer '{cust_id}' does not exist",
                raw_record=raw_str,
            )

        as_of_raw = row.get("as_of_time")
        as_of_time = cls.parse_utc_timestamp(as_of_raw)
        if as_of_time is None:
            return ValidationResult(
                is_valid=False,
                rejection_reason="INVALID_OR_MISSING_AS_OF_TIME",
                raw_record=raw_str,
            )

        cust_created_at = known_customers[cust_id]
        if cust_created_at.tzinfo is None:
            cust_created_at = cust_created_at.replace(tzinfo=timezone.utc)
        if as_of_time.tzinfo is None:
            as_of_time = as_of_time.replace(tzinfo=timezone.utc)

        if as_of_time < cust_created_at:
            return ValidationResult(
                is_valid=False,
                rejection_reason=f"PREDICTION_CUTOFF_PREDATES_CUSTOMER_CREATION ({as_of_time.isoformat()} < {cust_created_at.isoformat()})",
                raw_record=raw_str,
            )

        return ValidationResult(
            is_valid=True,
            cleaned_data={
                "request_id": req_id,
                "customer_id": cust_id,
                "as_of_time": as_of_time,
            },
        )
