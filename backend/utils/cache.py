from __future__ import annotations

import json
import logging
import time
from typing import Any

from redis.asyncio import Redis

logger = logging.getLogger(__name__)


async def cache_get(redis: Redis, key: str) -> Any | None:
    """Return deserialized cached value or None on miss."""
    t0 = time.perf_counter()
    raw = await redis.get(key)
    if raw is not None:
        logger.debug("CACHE HIT  key=%s elapsed=%.1fms", key, (time.perf_counter() - t0) * 1000)
        return json.loads(raw)
    logger.debug("CACHE MISS key=%s", key)
    return None


async def cache_set(redis: Redis, key: str, value: Any, ttl: int) -> None:
    """Serialize and store a value with TTL."""
    await redis.setex(key, ttl, json.dumps(value, default=str))


async def cache_invalidate_summoner(redis: Redis, puuid: str) -> None:
    """Wipe all cached keys for a summoner after refresh."""
    await redis.delete(f"summoner:{puuid}")

    # scan and delete all match list pages for this summoner
    cursor = 0
    while True:
        cursor, keys = await redis.scan(cursor, match=f"matches:{puuid}:*", count=100)
        if keys:
            await redis.delete(*keys)
        if cursor == 0:
            break

    logger.debug("Cache invalidated for puuid=%s", puuid)