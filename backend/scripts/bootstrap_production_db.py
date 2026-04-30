from __future__ import annotations

import argparse
import os
from pathlib import Path

from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, text


ROOT = Path(__file__).resolve().parents[1]
ALEMBIC_INI = ROOT / "alembic.ini"


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Bootstrap a production PostgreSQL database with Alembic and optional TimescaleDB setup.",
    )
    parser.add_argument(
        "--database-url",
        default=os.environ.get("DATABASE_URL"),
        help="PostgreSQL connection string. Defaults to DATABASE_URL from the environment.",
    )
    parser.add_argument(
        "--skip-migrations",
        action="store_true",
        help="Skip alembic upgrade head.",
    )
    parser.add_argument(
        "--skip-timescale",
        action="store_true",
        help="Do not attempt to enable TimescaleDB or create the hypertable.",
    )
    parser.add_argument(
        "--check-only",
        action="store_true",
        help="Only print database and TimescaleDB status without making changes.",
    )
    return parser


def require_database_url(url: str | None) -> str:
    if not url:
        raise SystemExit("DATABASE_URL is required. Pass --database-url or export DATABASE_URL.")
    return url


def run_alembic_upgrade(database_url: str) -> None:
    os.environ["DATABASE_URL"] = database_url
    alembic_cfg = Config(str(ALEMBIC_INI))
    command.upgrade(alembic_cfg, "head")


def create_sync_engine(database_url: str):
    sync_url = database_url.replace("+asyncpg", "")
    return create_engine(sync_url, future=True)


def fetch_scalar(connection, query: str):
    return connection.execute(text(query)).scalar()


def fetch_row(connection, query: str):
    return connection.execute(text(query)).mappings().first()


def timescale_available(connection) -> dict[str, str | None] | None:
    row = fetch_row(
        connection,
        """
        SELECT name, default_version, installed_version
        FROM pg_available_extensions
        WHERE name = 'timescaledb'
        """,
    )
    return dict(row) if row else None


def ensure_timescaledb(connection) -> bool:
    extension = timescale_available(connection)
    if not extension:
        print("TimescaleDB extension is not available on this PostgreSQL service.")
        return False

    print(
        "TimescaleDB extension available:",
        f"default={extension['default_version']}, installed={extension['installed_version']}",
    )
    connection.execute(text("CREATE EXTENSION IF NOT EXISTS timescaledb"))
    installed_version = fetch_scalar(
        connection,
        "SELECT installed_version FROM pg_available_extensions WHERE name = 'timescaledb'",
    )
    print(f"TimescaleDB installed version: {installed_version}")
    return True


def ensure_timeline_hypertable(connection) -> None:
    is_hypertable = fetch_scalar(
        connection,
        """
        SELECT EXISTS (
            SELECT 1
            FROM timescaledb_information.hypertables
            WHERE hypertable_schema = 'public'
              AND hypertable_name = 'match_timeline_frames'
        )
        """,
    )
    if is_hypertable:
        print("match_timeline_frames is already a hypertable.")
        return

    statements = [
        """
        SELECT create_hypertable(
            'match_timeline_frames',
            by_range('frame_timestamp'),
            if_not_exists => TRUE,
            migrate_data => TRUE
        )
        """,
        """
        SELECT create_hypertable(
            'match_timeline_frames',
            'frame_timestamp',
            if_not_exists => TRUE,
            migrate_data => TRUE
        )
        """,
    ]

    last_error: Exception | None = None
    for statement in statements:
        try:
            connection.execute(text(statement))
            print("Created hypertable for match_timeline_frames.")
            return
        except Exception as exc:  # pragma: no cover - fallback path depends on extension version
            last_error = exc

    if last_error is not None:
        raise last_error


def main() -> None:
    parser = build_parser()
    args = parser.parse_args()

    database_url = require_database_url(args.database_url)

    if not args.check_only and not args.skip_migrations:
        print("Running alembic upgrade head...")
        run_alembic_upgrade(database_url)
        print("Alembic migrations complete.")

    engine = create_sync_engine(database_url)

    with engine.begin() as connection:
        version = fetch_scalar(connection, "SELECT version()")
        print(f"Connected to: {version}")

        extension = timescale_available(connection)
        if extension:
            print(
                "TimescaleDB extension visibility:",
                f"default={extension['default_version']}, installed={extension['installed_version']}",
            )
        else:
            print("TimescaleDB extension visibility: not available on this database service.")

        if args.check_only or args.skip_timescale:
            return

        if ensure_timescaledb(connection):
            ensure_timeline_hypertable(connection)


if __name__ == "__main__":
    main()
