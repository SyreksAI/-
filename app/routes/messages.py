# app/routes/messages.py
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import and_, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.chat_utils import can_send_private_message, user_has_chat_access
from app.database import get_db
from app.dependencies import get_current_user
from app.models import Message, User
from app.schemas import MessageCreate
from app.message_payload import build_messages_payload
from app.time_utils import iso_utc

router = APIRouter()

HISTORY_MAX_LIMIT = 200


async def next_chat_order(chat_id: str, db: AsyncSession) -> int:
    """Sequential per-chat order; kept for backward compatibility with old rows."""
    result = await db.execute(
        select(func.coalesce(func.max(Message.order), 0)).where(Message.chat_id == chat_id)
    )
    return int(result.scalar() or 0) + 1


async def _serialize_messages(messages: list[Message], db: AsyncSession) -> list[dict]:
    payloads = await build_messages_payload(messages, db)
    for payload, msg in zip(payloads, messages):
        payload["edited_at"] = iso_utc(msg.edited_at)
    return payloads


async def _load_recent_page(
    chat_id: str,
    db: AsyncSession,
    limit: int,
    before_id: int | None,
) -> list[Message]:
    """Newest `limit` messages (optionally older than `before_id`), returned oldest-first."""
    stmt = (
        select(Message)
        .options(selectinload(Message.reply_to))
        .where(Message.chat_id == chat_id, Message.is_deleted == False)
    )

    if before_id:
        anchor = (
            await db.execute(
                select(Message.timestamp, Message.id).where(Message.id == before_id)
            )
        ).one_or_none()
        if anchor:
            anchor_ts, anchor_id = anchor
            stmt = stmt.where(
                or_(
                    Message.timestamp < anchor_ts,
                    and_(Message.timestamp == anchor_ts, Message.id < anchor_id),
                )
            )

    rows = (
        await db.execute(
            stmt.order_by(Message.timestamp.desc(), Message.id.desc()).limit(limit)
        )
    ).scalars().all()

    return list(reversed(rows))


@router.get("/history/{chat_id}")
async def get_chat_history(
    chat_id: str,
    limit: int = 100,
    before_id: int | None = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if not await user_has_chat_access(current_user.id, chat_id, db):
        raise HTTPException(status_code=403, detail="Доступ запрещен")

    limit = max(1, min(limit, HISTORY_MAX_LIMIT))
    messages = await _load_recent_page(chat_id, db, limit, before_id)
    return await _serialize_messages(messages, db)


@router.get("/chat/{chat_id}")
async def get_messages_by_chat(
    chat_id: str,
    limit: int = 50,
    before_id: int | None = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if not await user_has_chat_access(current_user.id, chat_id, db):
        raise HTTPException(status_code=403, detail="Доступ запрещен")

    limit = max(1, min(limit, HISTORY_MAX_LIMIT))
    messages = await _load_recent_page(chat_id, db, limit, before_id)
    return await _serialize_messages(messages, db)


@router.post("/")
async def create_message(
    message: MessageCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if not await user_has_chat_access(current_user.id, message.chat_id, db):
        raise HTTPException(status_code=403, detail="Доступ запрещен")

    recipient_id = message.recipient_id
    if message.chat_id.startswith("private_"):
        parts = message.chat_id.split("_")
        if len(parts) != 3:
            raise HTTPException(status_code=400, detail="Некорректный chat_id")
        user1, user2 = int(parts[1]), int(parts[2])
        recipient_id = user2 if user1 == current_user.id else user1
        if not await can_send_private_message(current_user.id, recipient_id, db):
            raise HTTPException(status_code=403, detail="Требуется взаимная подписка")

    reply_to_id = message.reply_to.get("message_id") if message.reply_to else None
    new_message = Message(
        user_id=current_user.id,
        text=message.text,
        chat_id=message.chat_id,
        recipient_id=recipient_id,
        is_admin=current_user.role in ["admin", "moderator"],
        is_system=False,
        files=message.files or [],
        reply_to_id=reply_to_id,
        order=await next_chat_order(message.chat_id, db),
    )
    db.add(new_message)
    await db.commit()
    await db.refresh(new_message)
    return await _serialize_message(new_message, db)
