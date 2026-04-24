"""add_frame_timestamp_to_timeline_frames

Revision ID: ca48c9ef4b5d
Revises: 289dca6fb1d5
Create Date: 2026-04-24 00:17:45.603019

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'ca48c9ef4b5d'
down_revision: Union[str, Sequence[str], None] = '289dca6fb1d5'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('match_timeline_frames', sa.Column(
        'frame_timestamp',
        sa.DateTime(timezone=True),
        nullable=True  # nullable first to avoid NOT NULL violation on existing rows
    ))
    op.execute("UPDATE match_timeline_frames SET frame_timestamp = NOW() WHERE frame_timestamp IS NULL")
    op.alter_column('match_timeline_frames', 'frame_timestamp', nullable=False)


def downgrade() -> None:
    op.drop_column('match_timeline_frames', 'frame_timestamp')
