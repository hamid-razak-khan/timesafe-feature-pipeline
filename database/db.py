"""Database Connection and Session Management for TimeSafe Feature Pipeline."""
import os
from contextlib import contextmanager
from typing import Generator
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker, Session
from sqlalchemy.engine import Engine
from database.models import Base

DEFAULT_DB_PATH = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "..", "timesafe.db")
)
DEFAULT_SQLITE_URL = f"sqlite:///{DEFAULT_DB_PATH}"

_engine: Engine | None = None
_SessionFactory: sessionmaker | None = None


def get_database_url() -> str:
    """Return database URL from environment or default to local SQLite."""
    return os.getenv("DATABASE_URL", DEFAULT_SQLITE_URL)


def setup_engine(database_url: str | None = None) -> Engine:
    """Create and configure SQLAlchemy Engine with optimal SQLite/Postgres settings."""
    url = database_url or get_database_url()
    connect_args = {}

    if url.startswith("sqlite"):
        connect_args["check_same_thread"] = False

    engine = create_engine(
        url,
        connect_args=connect_args,
        echo=False,
        future=True,
    )

    # Enable foreign keys and WAL mode for SQLite
    if url.startswith("sqlite"):
        @event.listens_for(engine, "connect")
        def set_sqlite_pragma(dbapi_connection, connection_record):
            cursor = dbapi_connection.cursor()
            cursor.execute("PRAGMA foreign_keys=ON;")
            cursor.execute("PRAGMA journal_mode=WAL;")
            cursor.close()

    return engine


def get_engine() -> Engine:
    """Get or initialize singleton engine."""
    global _engine
    if _engine is None:
        _engine = setup_engine()
    return _engine


def get_session_factory(engine: Engine | None = None) -> sessionmaker:
    """Get or initialize sessionmaker factory."""
    global _SessionFactory
    if engine is not None:
        return sessionmaker(autocommit=False, autoflush=False, bind=engine, future=True)
    if _SessionFactory is None:
        _SessionFactory = sessionmaker(
            autocommit=False, autoflush=False, bind=get_engine(), future=True
        )
    return _SessionFactory


def init_db(engine: Engine | None = None) -> None:
    """Create all database tables and apply safe schema migrations."""
    eng = engine or get_engine()
    Base.metadata.create_all(bind=eng)
    migrate_and_sync_db(eng)


def migrate_and_sync_db(engine: Engine | None = None) -> None:
    """Safely apply schema additions and backfill source record history."""
    import json
    eng = engine or get_engine()
    Base.metadata.create_all(bind=eng)

    with eng.connect() as conn:
        # Check and add columns to rejected_records if missing
        result = conn.exec_driver_sql("PRAGMA table_info(rejected_records)").fetchall()
        col_names = [r[1] for r in result]
        if "resolution_status" not in col_names:
            conn.exec_driver_sql("ALTER TABLE rejected_records ADD COLUMN resolution_status VARCHAR(32) DEFAULT 'unresolved'")
        if "resolved_at" not in col_names:
            conn.exec_driver_sql("ALTER TABLE rejected_records ADD COLUMN resolved_at DATETIME")
        conn.commit()

    # Backfill source_record_history if empty
    from database.models import Transaction, RejectedRecord, SourceRecordHistory, utc_now
    with get_session(eng) as session:
        hist_count = session.query(SourceRecordHistory).count()
        if hist_count == 0:
            # 1. Backfill accepted transactions
            txs = session.query(Transaction).all()
            for tx in txs:
                hist = SourceRecordHistory(
                    history_id=f"HIST_TX_{tx.transaction_id}",
                    record_id=tx.transaction_id,
                    entity_id=tx.customer_id,
                    source_file=tx.source_file,
                    source_row_number=1,
                    event_time=tx.event_time,
                    available_at=tx.available_at,
                    amount=tx.amount,
                    event_type=tx.transaction_type,
                    processing_status="accepted",
                    original_payload=json.dumps({
                        "transaction_id": tx.transaction_id,
                        "customer_id": tx.customer_id,
                        "event_time": tx.event_time.isoformat() if tx.event_time else None,
                        "available_at": tx.available_at.isoformat() if tx.available_at else None,
                        "amount": str(tx.amount),
                        "transaction_type": tx.transaction_type,
                    }),
                    initial_run_id="HISTORICAL_INGEST",
                    first_seen_at=tx.ingested_at or utc_now(),
                    last_processed_at=tx.ingested_at or utc_now(),
                )
                session.add(hist)

            # 2. Backfill rejected records
            rejs = session.query(RejectedRecord).all()
            for r in rejs:
                entity = None
                tx_id = None
                amt = None
                ev_type = None
                try:
                    payload = json.loads(r.raw_record) if r.raw_record.strip().startswith("{") else {}
                    entity = payload.get("customer_id") or payload.get("entity_id") or payload.get("account_id")
                    tx_id = payload.get("transaction_id") or payload.get("event_id") or payload.get("record_id")
                    amt = payload.get("amount") or payload.get("transfer_amount")
                    ev_type = payload.get("transaction_type") or payload.get("event_type")
                except Exception:
                    pass

                hist = SourceRecordHistory(
                    history_id=f"HIST_{r.reject_id}",
                    record_id=tx_id or r.reject_id,
                    entity_id=str(entity) if entity else None,
                    source_file=r.source_file,
                    source_row_number=r.source_row_number,
                    event_time=None,
                    available_at=None,
                    amount=amt if amt is not None else None,
                    event_type=str(ev_type) if ev_type else None,
                    processing_status="rejected",
                    rejection_reason=r.rejection_reason,
                    original_payload=r.raw_record,
                    initial_run_id=r.run_id,
                    first_seen_at=r.rejected_at or utc_now(),
                    last_processed_at=r.rejected_at or utc_now(),
                )
                session.add(hist)
            session.commit()


def reset_db(engine: Engine | None = None) -> None:
    """Drop and recreate all database tables (useful for test setup)."""
    eng = engine or get_engine()
    Base.metadata.drop_all(bind=eng)
    Base.metadata.create_all(bind=eng)


@contextmanager
def get_session(engine: Engine | None = None) -> Generator[Session, None, None]:
    """Transactional session context manager.
    
    Automatically commits on normal completion and rolls back on exception.
    """
    factory = get_session_factory(engine)
    session: Session = factory()
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()


def BaseSession() -> Session:
    """Raw session provider for dependency injection (e.g. FastAPI get_db)."""
    factory = get_session_factory()
    return factory()

