from __future__ import annotations

import argparse
import asyncio
import json
import os
from typing import Any
from urllib.parse import quote

import httpx
from redis.asyncio import Redis

from models import SummonerDTO
from riot.rate_limiter import RiotDualBucketRateLimiter


PLATFORM_TO_REGIONAL_CLUSTER = {
    # Americas
    "na1": "americas",
    "br1": "americas",
    "la1": "americas",
    "la2": "americas",
    # Asia
    "kr": "asia",
    "jp1": "asia",
    # Europe
    "eun1": "europe",
    "euw1": "europe",
    "tr1": "europe",
    "ru": "europe",
    "me1": "europe",
    # SEA
    "oc1": "sea",
    "sg2": "sea",
    "tw2": "sea",
    "vn2": "sea",
    "ph2": "sea",
    "th2": "sea",
}

REGIONAL_CLUSTERS = {"americas", "asia", "europe", "sea"}


class RiotAPIError(Exception):
    """Base exception for Riot API client errors."""


class RiotMatchNotFoundError(RiotAPIError):
    """Raised when a requested match or timeline cannot be found (404)."""


class RiotRateLimitedError(RiotAPIError):
    """Raised when Riot API rate limits a request (429)."""

    def __init__(self, message: str, retry_after_seconds: int | None = None) -> None:
        super().__init__(message)
        self.retry_after_seconds = retry_after_seconds


def platform_to_regional_cluster(platform: str) -> str:
    """Map a platform routing value (for example, na1) to Riot's regional cluster."""
    normalized = platform.strip().lower()
    cluster = PLATFORM_TO_REGIONAL_CLUSTER.get(normalized)
    if cluster is None:
        supported = ", ".join(sorted(PLATFORM_TO_REGIONAL_CLUSTER))
        raise ValueError(f"Unsupported Riot platform '{platform}'. Supported values: {supported}")
    return cluster


def platform_base_url(platform: str) -> str:
    """Build platform-routed base URL (used by summoner/ranked endpoints)."""
    normalized = platform.strip().lower()
    return f"https://{normalized}.api.riotgames.com"


def normalize_regional_cluster(region: str) -> str:
    """Accept either regional cluster or platform value and return a regional cluster."""
    normalized = region.strip().lower()
    if normalized in REGIONAL_CLUSTERS:
        return normalized
    return platform_to_regional_cluster(normalized)


def regional_base_url(region: str) -> str:
    """Build regional-routed base URL (used by match-v5 endpoints)."""
    cluster = normalize_regional_cluster(region)
    return f"https://{cluster}.api.riotgames.com"


class RiotClient:
    """Async Riot API HTTP client with auth header and default timeout."""

    def __init__(
        self,
        api_key: str,
        *,
        rate_limiter: RiotDualBucketRateLimiter | None = None,
        redis_url: str | None = None,
    ) -> None:
        self.client = httpx.AsyncClient(
            headers={"X-Riot-Token": api_key},
            timeout=10.0,
        )

        self._owned_redis: Redis | None = None
        if rate_limiter is None:
            limiter_redis_url = redis_url or os.getenv("REDIS_URL", "redis://redis:6379/0")
            self._owned_redis = Redis.from_url(limiter_redis_url, decode_responses=True)
            self.rate_limiter = RiotDualBucketRateLimiter(self._owned_redis)
        else:
            self.rate_limiter = rate_limiter

    async def aclose(self) -> None:
        """Close the underlying HTTP client and release resources."""
        await self.client.aclose()
        if self._owned_redis is not None:
            await self._owned_redis.aclose()

    @staticmethod
    def _retry_after_seconds(response: httpx.Response) -> float:
        """Parse Retry-After header, returning a safe fallback on invalid values."""
        retry_after_value = response.headers.get("Retry-After")
        if retry_after_value is None:
            return 1.0

        try:
            retry_after_seconds = float(retry_after_value)
        except ValueError:
            return 1.0

        return max(retry_after_seconds, 0.0)

    @staticmethod
    def _parse_rate_limit_header(header_value: str | None) -> dict[int, int]:
        """Parse Riot rate-limit header values like '20:1,100:120' into window->value."""
        if not header_value:
            return {}

        parsed: dict[int, int] = {}
        for pair in header_value.split(","):
            candidate = pair.strip()
            if not candidate:
                continue

            value_and_window = candidate.split(":", maxsplit=1)
            if len(value_and_window) != 2:
                continue

            try:
                value = int(value_and_window[0])
                window_seconds = int(value_and_window[1])
            except ValueError:
                continue

            if value < 0 or window_seconds <= 0:
                continue
            parsed[window_seconds] = value

        return parsed

    async def _maybe_sleep_near_server_limit(self, response: httpx.Response) -> None:
        """Proactively pause when server-side app limit counts are within 5 of the limit."""
        limit_by_window = self._parse_rate_limit_header(response.headers.get("X-App-Rate-Limit"))
        count_by_window = self._parse_rate_limit_header(response.headers.get("X-App-Rate-Limit-Count"))

        if not limit_by_window or not count_by_window:
            return

        for window_seconds, current_count in count_by_window.items():
            limit = limit_by_window.get(window_seconds)
            if limit is None:
                continue

            remaining = limit - current_count
            if remaining <= 5:
                await asyncio.sleep(1.0)
                return

    async def _acquire_rate_limit_slot(self, region: str) -> None:
        """Block until the configured limiter allows a request for this region scope."""
        scope = region.strip().lower()
        while True:
            decision = await self.rate_limiter.acquire(scope)
            if decision.allowed:
                return

            wait_seconds = max(decision.retry_after_ms, 1) / 1000
            await asyncio.sleep(wait_seconds)

    async def _get_with_rate_limit(
        self,
        *,
        url: str,
        region: str,
        params: dict[str, Any] | None = None,
    ) -> httpx.Response:
        """Rate-limit all outbound Riot GET calls and transparently retry on 429."""
        while True:
            await self._acquire_rate_limit_slot(region)
            response = await self.client.get(url, params=params)

            if response.status_code != 429:
                await self._maybe_sleep_near_server_limit(response)
                return response

            await asyncio.sleep(self._retry_after_seconds(response))

    async def get_summoner_by_riot_id(
        self,
        game_name: str,
        tag_line: str,
        region: str,
    ) -> SummonerDTO:
        """Resolve Riot ID to PUUID on regional routing, then fetch summoner data on platform routing."""
        platform = region.strip().lower()

        account_url = (
            f"{regional_base_url(platform)}"
            f"/riot/account/v1/accounts/by-riot-id/{quote(game_name, safe='')}/{quote(tag_line, safe='')}"
        )
        account_response = await self._get_with_rate_limit(url=account_url, region=platform)
        account_response.raise_for_status()

        account_payload = account_response.json()
        puuid = account_payload.get("puuid")
        if not puuid:
            raise ValueError("Riot account response did not include 'puuid'.")

        summoner_url = (
            f"{platform_base_url(platform)}"
            f"/lol/summoner/v4/summoners/by-puuid/{quote(puuid, safe='')}"
        )
        summoner_response = await self._get_with_rate_limit(url=summoner_url, region=platform)
        summoner_response.raise_for_status()

        return SummonerDTO.model_validate(summoner_response.json())

    async def get_summoner_by_puuid(self, puuid: str, region: str) -> SummonerDTO:
        """Fetch summoner-v4 profile data for a known puuid on a platform route."""
        normalized_puuid = puuid.strip()
        if not normalized_puuid:
            raise ValueError("puuid cannot be empty")

        platform = region.strip().lower()
        if not platform:
            raise ValueError("region cannot be empty")

        summoner_url = (
            f"{platform_base_url(platform)}"
            f"/lol/summoner/v4/summoners/by-puuid/{quote(normalized_puuid, safe='')}"
        )
        response = await self._get_with_rate_limit(url=summoner_url, region=platform)
        response.raise_for_status()

        return SummonerDTO.model_validate(response.json())

    async def get_match_ids(
        self,
        puuid: str,
        region: str,
        count: int = 20,
        queue: int = 420,
    ) -> list[str]:
        """Return match IDs for a player from the regional match-v5 endpoint."""
        if count < 1 or count > 100:
            raise ValueError("count must be between 1 and 100")

        match_ids_url = (
            f"{regional_base_url(region)}"
            f"/lol/match/v5/matches/by-puuid/{quote(puuid, safe='')}/ids"
        )
        response = await self._get_with_rate_limit(
            url=match_ids_url,
            region=region,
            params={
                "start": 0,
                "count": count,
                "queue": queue,
            },
        )
        response.raise_for_status()

        payload = response.json()
        if not isinstance(payload, list) or not all(isinstance(match_id, str) for match_id in payload):
            raise ValueError("Riot match IDs response was not a list of strings.")
        return payload

    @staticmethod
    def _handle_match_endpoint_errors(response: httpx.Response, resource_name: str) -> None:
        """Translate key Riot status codes into domain exceptions for match endpoints."""
        if response.status_code == 404:
            raise RiotMatchNotFoundError(f"{resource_name} was not found.")

        if response.status_code == 429:
            retry_after_header = response.headers.get("Retry-After")
            retry_after_seconds: int | None = None
            if retry_after_header and retry_after_header.isdigit():
                retry_after_seconds = int(retry_after_header)

            message = "Riot API rate limit exceeded."
            if retry_after_seconds is not None:
                message = f"{message} Retry after {retry_after_seconds} seconds."
            raise RiotRateLimitedError(message, retry_after_seconds=retry_after_seconds)

        response.raise_for_status()

    async def get_match(self, match_id: str, region: str) -> dict[str, Any]:
        """Fetch raw match payload from match-v5; caller performs DTO validation."""
        match_url = f"{regional_base_url(region)}/lol/match/v5/matches/{quote(match_id, safe='')}"
        response = await self._get_with_rate_limit(url=match_url, region=region)
        self._handle_match_endpoint_errors(response, resource_name=f"Match '{match_id}'")

        payload = response.json()
        if not isinstance(payload, dict):
            raise ValueError("Riot match response was not a JSON object.")
        return payload

    async def get_timeline(self, match_id: str, region: str) -> dict[str, Any]:
        """Fetch raw timeline payload from match-v5; caller performs DTO validation."""
        timeline_url = (
            f"{regional_base_url(region)}"
            f"/lol/match/v5/matches/{quote(match_id, safe='')}/timeline"
        )
        response = await self._get_with_rate_limit(url=timeline_url, region=region)
        self._handle_match_endpoint_errors(response, resource_name=f"Timeline for match '{match_id}'")

        payload = response.json()
        if not isinstance(payload, dict):
            raise ValueError("Riot timeline response was not a JSON object.")
        return payload

    async def __aenter__(self) -> "RiotClient":
        return self

    async def __aexit__(self, exc_type, exc, tb) -> None:
        await self.aclose()


async def _run_main(game_name: str, tag_line: str, region: str) -> None:
    """Fetch and print summoner data for a Riot ID using configured API key."""
    from config import settings

    async with RiotClient(settings.riot_api_key.get_secret_value()) as riot_client:
        summoner = await riot_client.get_summoner_by_riot_id(
            game_name=game_name,
            tag_line=tag_line,
            region=region,
        )
        print(json.dumps(summoner.model_dump(), indent=2, sort_keys=True))


def _parse_main_args() -> argparse.Namespace:
    """Parse CLI args for module-level quick test command."""
    parser = argparse.ArgumentParser(description="Fetch and print Riot summoner data")
    parser.add_argument("--game-name", default=os.getenv("RIOT_GAME_NAME", ""))
    parser.add_argument("--tag-line", default=os.getenv("RIOT_TAG_LINE", ""))
    parser.add_argument("--region", default=os.getenv("RIOT_PLATFORM", "na1"))
    return parser.parse_args()


if __name__ == "__main__":
    args = _parse_main_args()

    game_name = args.game_name.strip()
    tag_line = args.tag_line.strip()
    region = args.region.strip().lower()

    if not game_name or not tag_line:
        raise SystemExit(
            "Missing Riot ID. Set RIOT_GAME_NAME and RIOT_TAG_LINE or pass --game-name/--tag-line."
        )

    try:
        asyncio.run(_run_main(game_name=game_name, tag_line=tag_line, region=region))
    except RiotRateLimitedError as exc:
        raise SystemExit(str(exc)) from exc
    except httpx.HTTPStatusError as exc:
        raise SystemExit(f"Riot API request failed: {exc.response.status_code}") from exc
