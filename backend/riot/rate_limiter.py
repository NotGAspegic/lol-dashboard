from __future__ import annotations

import time
from dataclasses import dataclass
from typing import Any

from redis.asyncio import Redis


DUAL_BUCKET_LUA = """
local short_key = KEYS[1]
local long_key = KEYS[2]

local now_ms = tonumber(ARGV[1])
local short_capacity = tonumber(ARGV[2])
local short_refill_per_ms = tonumber(ARGV[3])
local long_capacity = tonumber(ARGV[4])
local long_refill_per_ms = tonumber(ARGV[5])
local cost = tonumber(ARGV[6])

local function load_bucket(key, capacity)
    local data = redis.call('HMGET', key, 'tokens', 'ts')
    local tokens = tonumber(data[1])
    local ts = tonumber(data[2])

    if not tokens then
        tokens = capacity
    end
    if not ts then
        ts = now_ms
    end

    return tokens, ts
end

local function refill(tokens, ts, capacity, refill_per_ms)
    local elapsed = now_ms - ts
    if elapsed < 0 then
        elapsed = 0
    end
    local updated = math.min(capacity, tokens + (elapsed * refill_per_ms))
    return updated
end

local function wait_ms(tokens, cost_tokens, refill_per_ms)
    if tokens >= cost_tokens then
        return 0
    end
    if refill_per_ms <= 0 then
        return 2147483647
    end
    return math.ceil((cost_tokens - tokens) / refill_per_ms)
end

local short_tokens, short_ts = load_bucket(short_key, short_capacity)
local long_tokens, long_ts = load_bucket(long_key, long_capacity)

short_tokens = refill(short_tokens, short_ts, short_capacity, short_refill_per_ms)
long_tokens = refill(long_tokens, long_ts, long_capacity, long_refill_per_ms)

local allowed = (short_tokens >= cost) and (long_tokens >= cost)
if allowed then
    short_tokens = short_tokens - cost
    long_tokens = long_tokens - cost
end

redis.call('HSET', short_key, 'tokens', short_tokens, 'ts', now_ms)
redis.call('HSET', long_key, 'tokens', long_tokens, 'ts', now_ms)

local short_ttl = math.ceil((short_capacity / short_refill_per_ms) * 2)
local long_ttl = math.ceil((long_capacity / long_refill_per_ms) * 2)
redis.call('PEXPIRE', short_key, short_ttl)
redis.call('PEXPIRE', long_key, long_ttl)

if allowed then
    return {1, 0, math.floor(short_tokens), math.floor(long_tokens)}
end

local short_wait = wait_ms(short_tokens, cost, short_refill_per_ms)
local long_wait = wait_ms(long_tokens, cost, long_refill_per_ms)
local retry_ms = math.max(short_wait, long_wait)

return {0, retry_ms, math.floor(short_tokens), math.floor(long_tokens)}
"""


@dataclass(slots=True)
class RateLimitDecision:
    """Result from a dual-bucket rate-limit check."""

    allowed: bool
    retry_after_ms: int
    short_remaining: int
    long_remaining: int


class RiotDualBucketRateLimiter:
    """Redis-backed dual token-bucket limiter for Riot API quotas.

    Defaults model Riot's common production limits:
    - 20 requests / 1 second
    - 100 requests / 120 seconds
    """

    def __init__(
        self,
        redis_client: Redis,
        *,
        key_prefix: str = "riot:rate-limit",
        short_limit: int = 20,
        short_window_seconds: int = 1,
        long_limit: int = 100,
        long_window_seconds: int = 120,
    ) -> None:
        if short_limit <= 0 or long_limit <= 0:
            raise ValueError("Bucket limits must be positive integers.")
        if short_window_seconds <= 0 or long_window_seconds <= 0:
            raise ValueError("Bucket windows must be positive integers.")

        self.redis = redis_client
        self.key_prefix = key_prefix.rstrip(":")

        self.short_limit = short_limit
        self.short_window_ms = short_window_seconds * 1000
        self.short_refill_per_ms = short_limit / self.short_window_ms

        self.long_limit = long_limit
        self.long_window_ms = long_window_seconds * 1000
        self.long_refill_per_ms = long_limit / self.long_window_ms

        # Register script once on the shared Redis client.
        self._dual_bucket_script = self.redis.register_script(DUAL_BUCKET_LUA)

    def _keys_for_scope(self, scope: str) -> tuple[str, str]:
        normalized_scope = scope.strip().lower() or "global"
        short_key = f"{self.key_prefix}:{normalized_scope}:short"
        long_key = f"{self.key_prefix}:{normalized_scope}:long"
        return short_key, long_key

    async def acquire(self, scope: str = "global", tokens: int = 1) -> RateLimitDecision:
        """Attempt to consume tokens from both buckets for a request scope."""
        if tokens <= 0:
            raise ValueError("tokens must be a positive integer.")

        now_ms = int(time.time() * 1000)
        short_key, long_key = self._keys_for_scope(scope)

        result: Any = await self._dual_bucket_script(
            keys=[short_key, long_key],
            args=[
                now_ms,
                self.short_limit,
                self.short_refill_per_ms,
                self.long_limit,
                self.long_refill_per_ms,
                tokens,
            ],
        )

        return RateLimitDecision(
            allowed=bool(int(result[0])),
            retry_after_ms=int(result[1]),
            short_remaining=int(result[2]),
            long_remaining=int(result[3]),
        )
