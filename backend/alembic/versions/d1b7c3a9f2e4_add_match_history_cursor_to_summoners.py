"""add_match_history_cursor_to_summoners

Revision ID: d1b7c3a9f2e4
Revises: b4c1f1f5bca2
Create Date: 2026-04-20 01:20:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "d1b7c3a9f2e4"
down_revision: Union[str, Sequence[str], None] = "b4c1f1f5bca2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column("summoners", sa.Column("match_history_cursor", sa.String(length=32), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column("summoners", "match_history_cursor")
