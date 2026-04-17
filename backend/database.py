from __future__ import annotations

import asyncio
from collections.abc import AsyncGenerator

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

try:
    from .config import settings
except ImportError:
    from config import settings


def _ensure_asyncpg_url(url: str) -> str:
    """Force SQLAlchemy asyncpg dialect when a plain PostgreSQL URL is provided."""
    if url.startswith("postgresql+asyncpg://"):
        return url
    if url.startswith("postgresql://"):
        return url.replace("postgresql://", "postgresql+asyncpg://", 1)
    raise ValueError("DATABASE_URL must start with postgresql:// or postgresql+asyncpg://")


DATABASE_URL = _ensure_asyncpg_url(settings.database_url)

engine = create_async_engine(
    DATABASE_URL,
    pool_pre_ping=True,
)

AsyncSessionFactory = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autoflush=False,
)


async def get_db_session() -> AsyncGenerator[AsyncSession, None]:
    """Yield an async SQLAlchemy session for request-scoped usage."""
    async with AsyncSessionFactory() as session:
        yield session


async def test_connection() -> int:
    """Run a minimal connectivity check against Postgres."""
    async with engine.connect() as connection:
        result = await connection.execute(text("SELECT 1"))
        return int(result.scalar_one())


if __name__ == "__main__":
    value = asyncio.run(test_connection())
    print(f"DB connectivity check passed: SELECT {value}")
