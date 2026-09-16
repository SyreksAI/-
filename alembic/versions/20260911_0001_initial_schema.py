"""Initial schema baseline.

Revision ID: 20260911_0001
Revises:
Create Date: 2026-09-11

Existing deployments may already have tables from create_all().
This revision is a baseline marker; use `alembic revision --autogenerate`
for subsequent schema changes.
"""
from typing import Sequence, Union

revision: str = "20260911_0001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
