from __future__ import annotations

import httpx
import pytest

import main


class _FakeRedisClient:
    async def ping(self) -> bool:
        return True

    async def aclose(self) -> None:
        return None


@pytest.mark.anyio
async def test_health_endpoint_returns_200(monkeypatch) -> None:
    async def fake_test_connection() -> None:
        return None

    monkeypatch.setattr(main, "test_connection", fake_test_connection)
    monkeypatch.setattr(main.app.state, "redis", _FakeRedisClient(), raising=False)
    monkeypatch.setattr(main.app.state, "redis_ready", True, raising=False)

    transport = httpx.ASGITransport(app=main.app)
    async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as client:
        response = await client.get("/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok", "db": "connected", "redis": "connected"}
