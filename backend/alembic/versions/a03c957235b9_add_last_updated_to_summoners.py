"""add_last_updated_to_summoners

Revision ID: a03c957235b9
Revises: d1b7c3a9f2e4
Create Date: 2026-04-22 16:26:37.234889

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a03c957235b9'
down_revision: Union[str, Sequence[str], None] = 'd1b7c3a9f2e4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Step 1: add the column as nullable first
    op.add_column('summoners', sa.Column(
        'last_updated',
        sa.DateTime(timezone=True),
        nullable=True
    ))

    # Step 2: backfill existing rows with the current time
    op.execute("UPDATE summoners SET last_updated = NOW() WHERE last_updated IS NULL")

    # Step 3: now safe to enforce NOT NULL
    op.alter_column('summoners', 'last_updated', nullable=False)


def downgrade() -> None:
    op.drop_column('summoners', 'last_updated')
