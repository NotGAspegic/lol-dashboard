"""add_rank_snapshots_table

Revision ID: 8b7d5af9c4e1
Revises: 4a9b7a8c1d2e
Create Date: 2026-04-29 18:05:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "8b7d5af9c4e1"
down_revision: Union[str, Sequence[str], None] = "4a9b7a8c1d2e"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "rank_snapshots",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("puuid", sa.String(length=78), nullable=False),
        sa.Column("queue_type", sa.String(length=32), nullable=False),
        sa.Column("tier", sa.String(length=32), nullable=False),
        sa.Column("rank", sa.String(length=8), nullable=True),
        sa.Column("league_points", sa.Integer(), nullable=False),
        sa.Column("wins", sa.Integer(), nullable=False),
        sa.Column("losses", sa.Integer(), nullable=False),
        sa.Column("snapshot_date", sa.Date(), nullable=False),
        sa.Column("captured_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["puuid"], ["summoners.puuid"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("puuid", "queue_type", "snapshot_date", name="uq_rank_snapshots_puuid_queue_date"),
    )
    op.create_index(op.f("ix_rank_snapshots_puuid"), "rank_snapshots", ["puuid"], unique=False)
    op.create_index(
        "ix_rank_snapshots_puuid_queue_captured_at",
        "rank_snapshots",
        ["puuid", "queue_type", "captured_at"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_rank_snapshots_puuid_queue_captured_at", table_name="rank_snapshots")
    op.drop_index(op.f("ix_rank_snapshots_puuid"), table_name="rank_snapshots")
    op.drop_table("rank_snapshots")
