import json
from typing import Set

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Group, Subscription


def parse_members(members):
    if members is None:
        return []
    if isinstance(members, list):
        return members
    if isinstance(members, str):
        try:
            return json.loads(members)
        except Exception:
            return []
    try:
        return json.loads(json.dumps(members))
    except Exception:
        return []


async def get_chat_recipient_ids(chat_id: str, db: AsyncSession, online_user_ids: Set[str]) -> Set[str]:
    """Return user IDs (as strings) that should receive a chat event."""
    if chat_id == "general":
        return set(online_user_ids)

    if chat_id.startswith("private_"):
        parts = chat_id.split("_")
        if len(parts) == 3:
            return {parts[1], parts[2]}
        return set()

    group = (
        await db.execute(
            select(Group).where(Group.id == chat_id, Group.is_active == True)
        )
    ).scalar_one_or_none()
    if not group:
        return set()

    return {str(member_id) for member_id in parse_members(group.members)}


async def can_read_private_chat(user_id: int, chat_id: str, db: AsyncSession) -> bool:
    if not chat_id.startswith("private_"):
        return True
    parts = chat_id.split("_")
    if len(parts) != 3:
        return False
    other_id = int(parts[2]) if int(parts[1]) == user_id else int(parts[1])
    return await can_send_private_message(user_id, other_id, db)


async def user_has_chat_access(user_id: int, chat_id: str, db: AsyncSession) -> bool:
    if chat_id == "general":
        return True

    if chat_id.startswith("private_"):
        parts = chat_id.split("_")
        if len(parts) != 3:
            return False
        if user_id not in [int(parts[1]), int(parts[2])]:
            return False
        return await can_read_private_chat(user_id, chat_id, db)

    group = (
        await db.execute(
            select(Group).where(Group.id == chat_id, Group.is_active == True)
        )
    ).scalar_one_or_none()
    if not group:
        return False
    return user_id in parse_members(group.members)


async def can_send_private_message(sender_id: int, recipient_id: int, db: AsyncSession) -> bool:
    if sender_id == recipient_id:
        return False

    subscriptions = (
        await db.execute(
            select(Subscription).where(
                Subscription.follower_id.in_([sender_id, recipient_id]),
                Subscription.following_id.in_([sender_id, recipient_id]),
                Subscription.status == "approved",
            )
        )
    ).scalars().all()

    sent_exists = any(
        s.follower_id == sender_id and s.following_id == recipient_id for s in subscriptions
    )
    recv_exists = any(
        s.follower_id == recipient_id and s.following_id == sender_id for s in subscriptions
    )
    return sent_exists and recv_exists
