"""Pytest Fixtures and Test Setup for TimeSafe Feature Pipeline."""
import os
import sys
import tempfile
import pytest
from datetime import datetime, timezone
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker

# Ensure project root is in sys.path
PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

from database.models import Base, Customer, Transaction, PredictionRequest
from database.db import setup_engine


@pytest.fixture(scope="function")
def test_db():
    """Create an isolated, temporary SQLite database for each test function."""
    with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as tmp:
        db_path = tmp.name

    db_url = f"sqlite:///{db_path}"
    engine = setup_engine(db_url)
    Base.metadata.create_all(bind=engine)
    TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine, future=True)

    session = TestingSessionLocal()
    try:
        yield session, engine, db_path
    finally:
        session.close()
        engine.dispose()
        if os.path.exists(db_path):
            try:
                os.remove(db_path)
            except PermissionError:
                pass


@pytest.fixture(scope="function")
def populated_test_db(test_db):
    """Database pre-populated with baseline customer records."""
    session, engine, db_path = test_db
    c1 = Customer(
        customer_id="CUST_0001",
        created_at=datetime(2026, 1, 10, 0, 0, 0, tzinfo=timezone.utc),
        customer_segment="vip",
    )
    c2 = Customer(
        customer_id="CUST_0002",
        created_at=datetime(2026, 2, 1, 0, 0, 0, tzinfo=timezone.utc),
        customer_segment="regular",
    )
    session.add_all([c1, c2])
    session.commit()
    return session, engine, db_path
