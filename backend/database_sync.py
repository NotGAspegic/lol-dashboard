from __future__ import annotations

from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session, sessionmaker

try:
    from .config import settings
except ImportError:
    from config import settings


def _ensure_sync_url(url: str) -> str:
    """Force SQLAlchemy sync PostgreSQL dialect for synchronous workers."""
    if url.startswith("postgresql://"):
        return url
    if url.startswith("postgresql+asyncpg://"):
        return url.replace("postgresql+asyncpg://", "postgresql://", 1)
    raise ValueError("DATABASE_URL must start with postgresql:// or postgresql+asyncpg://")


SYNC_DATABASE_URL = _ensure_sync_url(settings.database_url)

sync_engine = create_engine(
    SYNC_DATABASE_URL,
    pool_pre_ping=True,
)

SyncSessionFactory = sessionmaker(
    bind=sync_engine,
    class_=Session,
    expire_on_commit=False,
    autoflush=False,
)


def test_connection_sync() -> int:
    """Run a minimal connectivity check against Postgres with sync engine."""
    with sync_engine.connect() as connection:
        result = connection.execute(text("SELECT 1"))
        return int(result.scalar_one())
