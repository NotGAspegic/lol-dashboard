"""add_team_position_and_summoner_spells

Revision ID: f25d4c68d2ab
Revises: 0b9081654227
Create Date: 2026-04-29 03:55:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "f25d4c68d2ab"
down_revision: Union[str, Sequence[str], None] = "0b9081654227"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column("match_participants", sa.Column("teamPosition", sa.String(length=32), nullable=True))
    op.add_column("match_participants", sa.Column("summoner1Id", sa.Integer(), nullable=True))
    op.add_column("match_participants", sa.Column("summoner2Id", sa.Integer(), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column("match_participants", "summoner2Id")
    op.drop_column("match_participants", "summoner1Id")
    op.drop_column("match_participants", "teamPosition")
