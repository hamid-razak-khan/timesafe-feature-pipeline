"""Unit Tests for Validation Service in TimeSafe Feature Pipeline."""
import pytest
from datetime import datetime, timezone
from decimal import Decimal
from backend.services.validation_service import ValidationService


def test_validate_transaction_schema_valid():
    cols = ["transaction_id", "customer_id", "event_time", "available_at", "amount", "transaction_type", "source_file"]
    is_valid, err = ValidationService.validate_transaction_schema(cols)
    assert is_valid is True
    assert err is None


def test_validate_transaction_schema_missing_columns():
    cols = ["transaction_id", "customer_id", "amount"]
    is_valid, err = ValidationService.validate_transaction_schema(cols)
    assert is_valid is False
    assert "MISSING_REQUIRED_COLUMNS" in err
    assert "event_time" in err


def test_timestamp_parsing_utc():
    # Valid ISO with Z
    dt = ValidationService.parse_utc_timestamp("2026-05-31T12:00:00Z")
    assert dt is not None
    assert dt.year == 2026
    assert dt.month == 5
    assert dt.day == 31
    assert dt.tzinfo is not None

    # Valid with offset
    dt_offset = ValidationService.parse_utc_timestamp("2026-05-31T17:30:00+05:30")
    assert dt_offset is not None
    assert dt_offset.hour == 12  # 17:30 - 05:30 = 12:00 UTC

    # Invalid string
    dt_invalid = ValidationService.parse_utc_timestamp("invalid_timestamp_str")
    assert dt_invalid is None


def test_validate_transaction_row_valid():
    known_customers = {"CUST_0001": datetime(2026, 1, 1, 0, 0, 0, tzinfo=timezone.utc)}
    seen_tx_ids = set()
    row = {
        "transaction_id": "TX_001",
        "customer_id": "CUST_0001",
        "event_time": "2026-02-01T10:00:00Z",
        "available_at": "2026-02-01T10:05:00Z",
        "amount": "149.99",
        "transaction_type": "purchase",
    }
    res = ValidationService.validate_transaction_row(row, known_customers, seen_tx_ids, "test.csv")
    assert res.is_valid is True
    assert res.cleaned_data["amount"] == Decimal("149.99")
    assert res.cleaned_data["transaction_type"] == "purchase"


def test_validate_transaction_row_negative_amount():
    known_customers = {"CUST_0001": datetime(2026, 1, 1, 0, 0, 0, tzinfo=timezone.utc)}
    seen_tx_ids = set()
    row = {
        "transaction_id": "TX_002",
        "customer_id": "CUST_0001",
        "event_time": "2026-02-01T10:00:00Z",
        "available_at": "2026-02-01T10:05:00Z",
        "amount": "-50.00",
        "transaction_type": "purchase",
    }
    res = ValidationService.validate_transaction_row(row, known_customers, seen_tx_ids, "test.csv")
    assert res.is_valid is False
    assert "NEGATIVE_AMOUNT_NOT_PERMITTED" in res.rejection_reason


def test_validate_transaction_row_invalid_type():
    known_customers = {"CUST_0001": datetime(2026, 1, 1, 0, 0, 0, tzinfo=timezone.utc)}
    seen_tx_ids = set()
    row = {
        "transaction_id": "TX_003",
        "customer_id": "CUST_0001",
        "event_time": "2026-02-01T10:00:00Z",
        "available_at": "2026-02-01T10:05:00Z",
        "amount": "50.00",
        "transaction_type": "crypto_transfer",
    }
    res = ValidationService.validate_transaction_row(row, known_customers, seen_tx_ids, "test.csv")
    assert res.is_valid is False
    assert "INVALID_TRANSACTION_TYPE" in res.rejection_reason


def test_validate_transaction_row_foreign_key_violation():
    known_customers = {"CUST_0001": datetime(2026, 1, 1, 0, 0, 0, tzinfo=timezone.utc)}
    seen_tx_ids = set()
    row = {
        "transaction_id": "TX_004",
        "customer_id": "CUST_9999",
        "event_time": "2026-02-01T10:00:00Z",
        "available_at": "2026-02-01T10:05:00Z",
        "amount": "50.00",
        "transaction_type": "purchase",
    }
    res = ValidationService.validate_transaction_row(row, known_customers, seen_tx_ids, "test.csv")
    assert res.is_valid is False
    assert "FOREIGN_KEY_VIOLATION" in res.rejection_reason


def test_validate_transaction_row_available_predates_event():
    known_customers = {"CUST_0001": datetime(2026, 1, 1, 0, 0, 0, tzinfo=timezone.utc)}
    seen_tx_ids = set()
    row = {
        "transaction_id": "TX_005",
        "customer_id": "CUST_0001",
        "event_time": "2026-02-01T10:00:00Z",
        "available_at": "2026-02-01T09:00:00Z",  # 1 hour before event!
        "amount": "50.00",
        "transaction_type": "purchase",
    }
    res = ValidationService.validate_transaction_row(row, known_customers, seen_tx_ids, "test.csv")
    assert res.is_valid is False
    assert "AVAILABLE_TIME_PREDATES_EVENT_TIME" in res.rejection_reason


def test_validate_transaction_row_predates_customer_creation():
    known_customers = {"CUST_0001": datetime(2026, 3, 1, 0, 0, 0, tzinfo=timezone.utc)}
    seen_tx_ids = set()
    row = {
        "transaction_id": "TX_006",
        "customer_id": "CUST_0001",
        "event_time": "2026-02-01T10:00:00Z",  # Before customer creation
        "available_at": "2026-02-01T10:05:00Z",
        "amount": "50.00",
        "transaction_type": "purchase",
    }
    res = ValidationService.validate_transaction_row(row, known_customers, seen_tx_ids, "test.csv")
    assert res.is_valid is False
    assert "TRANSACTION_PREDATES_CUSTOMER_CREATION" in res.rejection_reason


def test_validate_transaction_row_duplicate_in_file():
    known_customers = {"CUST_0001": datetime(2026, 1, 1, 0, 0, 0, tzinfo=timezone.utc)}
    seen_tx_ids = {"TX_001"}
    row = {
        "transaction_id": "TX_001",
        "customer_id": "CUST_0001",
        "event_time": "2026-02-01T10:00:00Z",
        "available_at": "2026-02-01T10:05:00Z",
        "amount": "100.00",
        "transaction_type": "purchase",
    }
    res = ValidationService.validate_transaction_row(row, known_customers, seen_tx_ids, "test.csv")
    assert res.is_valid is False
    assert "DUPLICATE_TRANSACTION_ID_IN_FILE" in res.rejection_reason

