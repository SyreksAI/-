"""Build chat message API/WS payloads with attachments."""
from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.attachment_service import (
    attachments_to_legacy_files,
    load_attachments_for_messages,
    load_message_attachments,
)
from app.models import Message, User
from app.time_utils import iso_utc


async def build_message_payload(
    msg: Message,
    db: AsyncSession,
    users_map: dict[int, User] | None = None,
    attachments_map: dict[int, list] | None = None,
) -> dict:
    sender = users_map.get(msg.user_id) if users_map else None
    if sender is None:
        sender = (
            await db.execute(select(User).where(User.id == msg.user_id))
        ).scalar_one_or_none()

    reply_to_data = None
    if msg.reply_to:
        reply_sender = users_map.get(msg.reply_to.user_id) if users_map else None
        if reply_sender is None and msg.reply_to:
            reply_sender = (
                await db.execute(select(User).where(User.id == msg.reply_to.user_id))
            ).scalar_one_or_none()
        reply_to_data = {
            "message_id": msg.reply_to.id,
            "text": msg.reply_to.text,
            "username": reply_sender.username if reply_sender else "unknown",
            "user_id": msg.reply_to.user_id,
        }

    if attachments_map is not None:
        attachments = attachments_map.get(msg.id, [])
    else:
        attachments = await load_message_attachments(db, msg.id)
    att_payload = attachments_to_legacy_files(attachments)
    legacy_files = [f for f in (msg.files or []) if f.get("_type") != "forward_metadata"]
    forward_meta = next((f for f in (msg.files or []) if f.get("_type") == "forward_metadata"), None)
    files = att_payload + legacy_files
    if forward_meta:
        files.append(forward_meta)

    return {
        "id": msg.id,
        "user_id": msg.user_id,
        "username": sender.username if sender else "unknown",
        "user_name": sender.name if sender else "Unknown",
        "text": msg.text,
        "chat_id": msg.chat_id,
        "recipient_id": msg.recipient_id,
        "is_admin": msg.is_admin,
        "is_system": msg.is_system,
        "read": msg.read,
        "timestamp": iso_utc(msg.timestamp),
        "files": files,
        "attachments": att_payload,
        "reply_to": reply_to_data,
        "is_deleted": msg.is_deleted,
        "edited_at": iso_utc(msg.edited_at),
        "order": msg.order,
    }


async def build_messages_payload(
    messages: list[Message],
    db: AsyncSession,
    users_map: dict[int, User] | None = None,
) -> list[dict]:
    if not messages:
        return []

    if users_map is None:
        user_ids: set[int] = set()
        for msg in messages:
            user_ids.add(msg.user_id)
            if msg.reply_to:
                user_ids.add(msg.reply_to.user_id)
        users = (
            await db.execute(select(User).where(User.id.in_(user_ids)))
        ).scalars().all()
        users_map = {u.id: u for u in users}

    attachments_map = await load_attachments_for_messages(
        db, [msg.id for msg in messages]
    )
    return [
        await build_message_payload(msg, db, users_map, attachments_map)
        for msg in messages
    ]
