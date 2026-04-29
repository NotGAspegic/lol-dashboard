"""add_riot_identity_to_summoners

Revision ID: 4a9b7a8c1d2e
Revises: f25d4c68d2ab
Create Date: 2026-04-29 16:10:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "4a9b7a8c1d2e"
down_revision: Union[str, Sequence[str], None] = "f25d4c68d2ab"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("summoners", sa.Column("game_name", sa.String(length=64), nullable=True))
    op.add_column("summoners", sa.Column("tag_line", sa.String(length=32), nullable=True))
    op.add_column("summoners", sa.Column("riot_id_slug", sa.String(length=128), nullable=True))
    op.create_index(op.f("ix_summoners_riot_id_slug"), "summoners", ["riot_id_slug"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_summoners_riot_id_slug"), table_name="summoners")
    op.drop_column("summoners", "riot_id_slug")
    op.drop_column("summoners", "tag_line")
    op.drop_column("summoners", "game_name")
