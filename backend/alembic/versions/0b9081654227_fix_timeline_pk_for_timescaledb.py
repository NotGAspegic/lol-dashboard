"""fix_timeline_pk_for_timescaledb

Revision ID: 0b9081654227
Revises: ca48c9ef4b5d
Create Date: 2026-04-24 00:23:13.963440

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '0b9081654227'
down_revision: Union[str, Sequence[str], None] = 'ca48c9ef4b5d'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # drop existing single-column PK
    op.drop_constraint('match_timeline_frames_pkey', 'match_timeline_frames', type_='primary')
    
    # recreate as composite PK including the partition column
    op.create_primary_key(
        'match_timeline_frames_pkey',
        'match_timeline_frames',
        ['id', 'frame_timestamp']
    )


def downgrade() -> None:
    op.drop_constraint('match_timeline_frames_pkey', 'match_timeline_frames', type_='primary')
    op.create_primary_key(
        'match_timeline_frames_pkey',
        'match_timeline_frames',
        ['id']
    )
