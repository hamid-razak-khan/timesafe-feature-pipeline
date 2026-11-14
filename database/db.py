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
    """Create all database tables."""
    eng = engine or get_engine()
    Base.metadata.create_all(bind=eng)


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
