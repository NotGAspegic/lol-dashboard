from __future__ import annotations

import os


os.environ.setdefault("RIOT_API_KEY", "test-riot-key")
os.environ.setdefault("DATABASE_URL", "postgresql+asyncpg://test:test@localhost:5432/testdb")
os.environ.setdefault("REDIS_URL", "redis://localhost:6379/0")
