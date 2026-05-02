"""add_perf_indexes

Revision ID: c0d7e1a5f2ab
Revises: 8b7d5af9c4e1
Create Date: 2026-05-02 11:30:00.000000

"""
from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = "c0d7e1a5f2ab"
down_revision: Union[str, Sequence[str], None] = "8b7d5af9c4e1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_index(
        "ix_matches_game_start_timestamp",
        "matches",
        ["gameStartTimestamp"],
        unique=False,
    )
    op.create_index(
        "ix_match_participants_puuid_gameid",
        "match_participants",
        ["puuid", "gameId"],
        unique=False,
    )
    op.create_index(
        "ix_match_participants_puuid_champion_gameid",
        "match_participants",
        ["puuid", "championId", "gameId"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_match_participants_puuid_champion_gameid", table_name="match_participants")
    op.drop_index("ix_match_participants_puuid_gameid", table_name="match_participants")
    op.drop_index("ix_matches_game_start_timestamp", table_name="matches")
