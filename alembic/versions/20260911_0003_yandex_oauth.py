"""Add yandex_id column to users.

Revision ID: 20260911_0003
Revises: 20260911_0002
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "20260911_0003"
down_revision: Union[str, None] = "20260911_0002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        op.execute(sa.text("ALTER TABLE users ADD COLUMN IF NOT EXISTS yandex_id VARCHAR"))
        op.execute(
            sa.text(
                "CREATE UNIQUE INDEX IF NOT EXISTS ix_users_yandex_id ON users (yandex_id)"
            )
        )
    else:
        with op.batch_alter_table("users") as batch_op:
            batch_op.add_column(sa.Column("yandex_id", sa.String(), nullable=True))
            batch_op.create_index("ix_users_yandex_id", ["yandex_id"], unique=True)


def downgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        op.execute(sa.text("DROP INDEX IF EXISTS ix_users_yandex_id"))
        op.execute(sa.text("ALTER TABLE users DROP COLUMN IF EXISTS yandex_id"))
    else:
        with op.batch_alter_table("users") as batch_op:
            batch_op.drop_index("ix_users_yandex_id")
            batch_op.drop_column("yandex_id")
