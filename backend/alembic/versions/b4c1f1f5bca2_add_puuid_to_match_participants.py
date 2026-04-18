"""add_puuid_to_match_participants

Revision ID: b4c1f1f5bca2
Revises: a06cd575f79c
Create Date: 2026-04-18 22:57:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "b4c1f1f5bca2"
down_revision: Union[str, Sequence[str], None] = "a06cd575f79c"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column("match_participants", sa.Column("puuid", sa.String(length=78), nullable=True))
    op.create_index(
        op.f("ix_match_participants_puuid"),
        "match_participants",
        ["puuid"],
        unique=False,
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(op.f("ix_match_participants_puuid"), table_name="match_participants")
    op.drop_column("match_participants", "puuid")
