"""Add index for chat message history queries.

Revision ID: 20260915_0004
Revises: 20260911_0003
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "20260915_0004"
down_revision: Union[str, None] = "20260911_0003"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        op.execute(
            sa.text(
                "CREATE INDEX IF NOT EXISTS ix_messages_chat_history "
                "ON messages (chat_id, timestamp DESC, id DESC) "
                "WHERE is_deleted = false"
            )
        )


def downgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        op.execute(sa.text("DROP INDEX IF EXISTS ix_messages_chat_history"))
