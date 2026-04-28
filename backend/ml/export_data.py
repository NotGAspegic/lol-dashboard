from __future__ import annotations

from pathlib import Path
from urllib.parse import urlparse, urlunparse

import pandas as pd
from sqlalchemy import create_engine
from sqlalchemy.exc import OperationalError

from config import settings


BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = BASE_DIR / "data"


def _candidate_database_urls() -> list[str]:
    urls: list[str] = []

    parsed = urlparse(settings.sync_database_url)
    if parsed.hostname == "postgres":
        fallback_netloc = parsed.netloc.replace("postgres", "localhost", 1)
        fallback = urlunparse(parsed._replace(netloc=fallback_netloc))
        urls.append(fallback)
    if parsed.hostname == "postgres":
        urls.append(settings.sync_database_url)
    else:
        urls.append(settings.sync_database_url)

    return urls


def main() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)

    last_error: Exception | None = None
    for database_url in _candidate_database_urls():
        engine = create_engine(database_url, connect_args={"connect_timeout": 5})
        try:
            match_participants = pd.read_sql("SELECT * FROM match_participants", engine)
            matches = pd.read_sql("SELECT * FROM matches", engine)
            break
        except OperationalError as exc:
            last_error = exc
    else:
        raise RuntimeError("Unable to connect to the database using any known URL") from last_error

    match_participants.to_csv(DATA_DIR / "match_participants.csv", index=False)
    matches.to_csv(DATA_DIR / "matches.csv", index=False)

    print(
        f"Exported {len(match_participants)} participants from {len(matches)} matches"
    )


if __name__ == "__main__":
    main()