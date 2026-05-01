from __future__ import annotations

from typing import Any, cast

from riot import rate_limiter as rate_limiter_module
from riot.rate_limiter import RiotDualBucketRateLimiter


class _FakeRedis:
    def __init__(self) -> None:
        self._buckets: dict[str, dict[str, float]] = {}

    def register_script(self, _script: str):
        async def runner(*, keys: list[str], args: list[Any]) -> list[int]:
            now_ms = int(args[0])
            short_capacity = float(args[1])
            short_refill_per_ms = float(args[2])
            long_capacity = float(args[3])
            long_refill_per_ms = float(args[4])
            cost = float(args[5])

            def load_bucket(key: str, capacity: float) -> tuple[float, int]:
                bucket = self._buckets.get(key)
                if bucket is None:
                    return capacity, now_ms
                return float(bucket["tokens"]), int(bucket["ts"])

            def refill(tokens: float, ts: int, capacity: float, refill_per_ms: float) -> float:
                elapsed = max(0, now_ms - ts)
                return min(capacity, tokens + (elapsed * refill_per_ms))

            def wait_ms(tokens: float, refill_per_ms: float) -> int:
                if tokens >= cost:
                    return 0
                if refill_per_ms <= 0:
                    return 2_147_483_647
                return int(-(-(cost - tokens) // refill_per_ms))

            short_key, long_key = keys
            short_tokens, short_ts = load_bucket(short_key, short_capacity)
            long_tokens, long_ts = load_bucket(long_key, long_capacity)

            short_tokens = refill(short_tokens, short_ts, short_capacity, short_refill_per_ms)
            long_tokens = refill(long_tokens, long_ts, long_capacity, long_refill_per_ms)

            allowed = short_tokens >= cost and long_tokens >= cost
            if allowed:
                short_tokens -= cost
                long_tokens -= cost

            self._buckets[short_key] = {"tokens": short_tokens, "ts": now_ms}
            self._buckets[long_key] = {"tokens": long_tokens, "ts": now_ms}

            if allowed:
                return [1, 0, int(short_tokens), int(long_tokens)]

            retry_ms = max(
                wait_ms(short_tokens, short_refill_per_ms),
                wait_ms(long_tokens, long_refill_per_ms),
            )
            return [0, retry_ms, int(short_tokens), int(long_tokens)]

        return runner


def test_dual_bucket_limiter_enforces_short_and_long_windows(monkeypatch) -> None:
    fake_redis = _FakeRedis()
    limiter = RiotDualBucketRateLimiter(
        cast(Any, fake_redis),
        short_limit=2,
        short_window_seconds=1,
        long_limit=3,
        long_window_seconds=60,
    )

    current_time = {"value": 0.0}
    monkeypatch.setattr(rate_limiter_module.time, "time", lambda: current_time["value"])

    first = limiter.acquire("euw1")
    second = limiter.acquire("euw1")

    import asyncio

    first_result = asyncio.run(first)
    second_result = asyncio.run(second)

    assert first_result.allowed is True
    assert first_result.short_remaining == 1
    assert first_result.long_remaining == 2
    assert second_result.allowed is True
    assert second_result.short_remaining == 0
    assert second_result.long_remaining == 1

    third_result = asyncio.run(limiter.acquire("euw1"))
    assert third_result.allowed is False
    assert third_result.retry_after_ms > 0

    current_time["value"] = 1.0
    fourth_result = asyncio.run(limiter.acquire("euw1"))
    assert fourth_result.allowed is True
    assert fourth_result.long_remaining == 0

    fifth_result = asyncio.run(limiter.acquire("euw1"))
    assert fifth_result.allowed is False
    assert fifth_result.retry_after_ms > 0
