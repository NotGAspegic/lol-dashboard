from __future__ import annotations

import argparse
import asyncio
import json
import logging
from typing import Tuple

from ingestion.pipeline import ingest_summoner


logger = logging.getLogger(__name__)


def _print_progress(current: int, total: int, match_id: str) -> None:
    """Print a simple real-time ingestion progress line."""
    print(f"[{current}/{total}] Ingesting {match_id}...", flush=True)


def _parse_summoner_arg(value: str) -> Tuple[str, str]:
    """Parse a Riot ID in the form Name#TAG into (game_name, tag_line)."""
    candidate = value.strip()
    if not candidate:
        raise argparse.ArgumentTypeError("--summoner cannot be empty.")

    if "#" not in candidate:
        raise argparse.ArgumentTypeError(
            "--summoner must be in the form Name#TAG (example: Faker#KR1)."
        )

    game_name, tag_line = candidate.rsplit("#", maxsplit=1)
    game_name = game_name.strip()
    tag_line = tag_line.strip()

    if not game_name or not tag_line:
        raise argparse.ArgumentTypeError(
            "--summoner must include both name and tag (example: Faker#KR1)."
        )

    return game_name, tag_line


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Ingest recent Riot matches for a summoner.",
    )
    parser.add_argument(
        "--summoner",
        required=True,
        type=_parse_summoner_arg,
        help="Summoner Riot ID in the form Name#TAG.",
    )
    parser.add_argument(
        "--region",
        default="na1",
        help="Riot routing region/platform (for example: na1, americas).",
    )
    parser.add_argument(
        "--count",
        type=int,
        default=50,
        help="Number of recent match IDs to request (1-100).",
    )
    parser.add_argument(
        "--queue",
        type=int,
        default=420,
        help="Queue filter for match history fetch (default: 420).",
    )
    return parser


async def _run() -> int:
    parser = _build_parser()
    args = parser.parse_args()

    game_name, tag_line = args.summoner

    try:
        result = await ingest_summoner(
            game_name=game_name,
            tag_line=tag_line,
            region=args.region,
            count=args.count,
            queue=args.queue,
            progress_callback=_print_progress,
        )
    except Exception:
        logger.exception(
            "Summoner ingestion failed (summoner=%s#%s, region=%s, count=%s, queue=%s)",
            game_name,
            tag_line,
            args.region,
            args.count,
            args.queue,
        )
        return 1

    logger.info(
        "Summoner ingestion finished (summoner=%s#%s, region=%s, queue=%s, "
        "fetched=%s, inserted=%s, skipped=%s, failed=%s)",
        game_name,
        tag_line,
        args.region,
        args.queue,
        result.get("fetched_match_count"),
        result.get("inserted_matches"),
        result.get("skipped_matches"),
        result.get("failed_matches"),
    )
    logger.info("Ingestion result payload: %s", json.dumps(result, sort_keys=True))
    return 0


def main() -> None:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s - %(message)s",
    )
    raise SystemExit(asyncio.run(_run()))


if __name__ == "__main__":
    main()