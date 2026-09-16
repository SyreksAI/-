"""Add totp_secret and normalize user role default.

Revision ID: 20260911_0002
Revises: 20260911_0001
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "20260911_0002"
down_revision: Union[str, None] = "20260911_0001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        op.execute(sa.text("ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_secret VARCHAR"))
        op.execute(sa.text("UPDATE users SET role = 'user' WHERE role = 'student' OR role IS NULL"))
    else:
        with op.batch_alter_table("users") as batch_op:
            batch_op.add_column(sa.Column("totp_secret", sa.String(), nullable=True))


def downgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        op.execute(sa.text("ALTER TABLE users DROP COLUMN IF EXISTS totp_secret"))
    else:
        with op.batch_alter_table("users") as batch_op:
            batch_op.drop_column("totp_secret")
