"""Async WebSocket chat handler."""
from __future__ import annotations

import json
import logging
import traceback

from fastapi import HTTPException, Query, WebSocket, WebSocketDisconnect
from sqlalchemy import and_, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.chat_utils import (
    can_send_private_message,
    get_chat_recipient_ids,
    parse_members,
    user_has_chat_access,
)
from app.database import AsyncSessionLocal
from app.dependencies import get_ws_current_user
from app.models import Group, Message, Subscription, User
from app.attachment_service import link_attachments
from app.message_payload import build_message_payload, build_messages_payload
from app.time_utils import iso_utc
from app.websocket_manager import (
    active_connections,
    broadcast_online_users,
    broadcast_user_status,
    register_connection,
    send_to_users,
    unregister_connection,
)

logger = logging.getLogger(__name__)

# Messages are ordered by (timestamp, id); `order` is kept only for older clients.
HISTORY_LIMIT_PER_CHAT = 100


async def get_next_order(chat_id: str, db: AsyncSession) -> int:
    result = await db.execute(
        select(func.coalesce(func.max(Message.order), 0)).where(Message.chat_id == chat_id)
    )
    return int(result.scalar() or 0) + 1


async def _send_history_batch(
    websocket: WebSocket, messages: list, users_map: dict, chat_id: str, db: AsyncSession
) -> None:
    payload = await build_messages_payload(messages, db, users_map)
    await websocket.send_text(
        json.dumps(
            {
                "type": "history_batch",
                "messages": payload,
                "chat_id": chat_id,
                "count": len(payload),
            },
            default=str,
        )
    )


async def _load_recent_messages(
    db: AsyncSession,
    chat_id: str,
    limit: int,
    before_id: int | None = None,
) -> list[Message]:
    """Newest `limit` messages for a chat (optionally older than `before_id`), oldest-first."""
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


def _sort_messages(messages: list[Message]) -> list[Message]:
    return sorted(messages, key=lambda m: (m.timestamp, m.id))


async def _load_users_map(db: AsyncSession, user_ids: set[int]) -> dict:
    if not user_ids:
        return {}
    users = (
        await db.execute(select(User).where(User.id.in_(user_ids)))
    ).scalars().all()
    return {u.id: u for u in users}


async def _collect_user_chat_ids(db: AsyncSession, user_id: int) -> list[str]:
    chat_ids = ["general"]

    subs = (
        await db.execute(
            select(Subscription).where(
                Subscription.follower_id == user_id,
                Subscription.status == "approved",
            )
        )
    ).scalars().all()
    for sub in subs:
        chat_ids.append(
            f"private_{min(user_id, sub.following_id)}_{max(user_id, sub.following_id)}"
        )

    groups = (
        await db.execute(select(Group).where(Group.is_active == True))
    ).scalars().all()
    for group in groups:
        if user_id in parse_members(group.members):
            chat_ids.append(group.id)

    return chat_ids


async def websocket_endpoint(
    websocket: WebSocket, user_id: int, token: str = Query(...)
) -> None:
    async with AsyncSessionLocal() as db:
        user = await get_ws_current_user(token, db)
        if not user or user.id != user_id:
            await websocket.close(code=1008, reason="Ошибка авторизации")
            return

        await websocket.accept()
        register_connection(user_id, user.role, websocket)
        logger.info(
            "✅ Пользователь %s (%s) подключен. Всего: %s",
            user_id,
            user.username,
            len(active_connections),
        )

        await broadcast_online_users()

        try:
            user.is_online = True
            await db.commit()
            await broadcast_user_status(user_id, True)

            await websocket.send_text(
                json.dumps({"type": "connection_ready", "user_id": user_id})
            )

            while True:
                data = await websocket.receive_text()
                message_data = json.loads(data)
                logger.info("📥 Получено от %s: %s", user_id, message_data.get("type"))

                if message_data.get("type") == "get_history":
                    chat_id = message_data.get("chat_id", "general")
                    limit = max(1, min(int(message_data.get("limit") or 100), 200))
                    before_id = message_data.get("before_id")

                    if not await user_has_chat_access(user_id, chat_id, db):
                        await websocket.send_text(
                            json.dumps({"type": "error", "message": "Доступ запрещен"})
                        )
                        continue

                    messages_history = await _load_recent_messages(
                        db, chat_id, limit, before_id
                    )

                    if not messages_history:
                        await websocket.send_text(
                            json.dumps(
                                {
                                    "type": "history_complete",
                                    "chat_id": chat_id,
                                    "count": 0,
                                    "has_more": False,
                                }
                            )
                        )
                        continue

                    msg_user_ids: set[int] = set()
                    for msg in messages_history:
                        msg_user_ids.add(msg.user_id)
                        if msg.reply_to:
                            msg_user_ids.add(msg.reply_to.user_id)

                    msg_users_map = await _load_users_map(db, msg_user_ids)
                    await _send_history_batch(
                        websocket, messages_history, msg_users_map, chat_id, db
                    )
                    await websocket.send_text(
                        json.dumps(
                            {
                                "type": "history_complete",
                                "chat_id": chat_id,
                                "count": len(messages_history),
                                "has_more": len(messages_history) >= limit,
                                "oldest_id": messages_history[0].id,
                            }
                        )
                    )
                    continue

                if message_data.get("type") == "message":
                    text = message_data.get("text", "")
                    chat_id = message_data.get("chat_id", "general")
                    recipient_id = message_data.get("recipient_id")
                    is_system = message_data.get("is_system", False)
                    files = message_data.get("files", [])
                    attachment_ids = message_data.get("attachment_ids") or []
                    if message_data.get("is_shared"):
                        files = list(files)
                        files.append(
                            {
                                "_type": "forward_metadata",
                                "original_sender": message_data.get("original_sender"),
                                "original_text": text,
                                "original_chat": message_data.get("original_chat"),
                            }
                        )

                    if chat_id.startswith("private_"):
                        parts = chat_id.split("_")
                        if len(parts) == 3:
                            user1 = int(parts[1])
                            user2 = int(parts[2])
                            recipient_id = user2 if user1 == user_id else user1

                            if not await can_send_private_message(user_id, recipient_id, db):
                                await websocket.send_text(
                                    json.dumps(
                                        {
                                            "type": "error",
                                            "message": "Требуется взаимная подписка для отправки личных сообщений",
                                        }
                                    )
                                )
                                continue

                    elif chat_id != "general":
                        group = (
                            await db.execute(
                                select(Group).where(
                                    Group.id == chat_id, Group.is_active == True
                                )
                            )
                        ).scalar_one_or_none()

                        if not group:
                            await websocket.send_text(
                                json.dumps({"type": "error", "message": "Группа не найдена"})
                            )
                            continue

                        members = parse_members(group.members)
                        if user_id not in members:
                            await websocket.send_text(
                                json.dumps(
                                    {"type": "error", "message": "Вы не состоите в этой группе"}
                                )
                            )
                            continue

                        recipient_id = None

                    reply_to = None
                    reply_to_data = message_data.get("reply_to")
                    if reply_to_data:
                        reply_to_id = reply_to_data.get("message_id")
                        if reply_to_id:
                            reply_to = (
                                await db.execute(
                                    select(Message).where(Message.id == reply_to_id)
                                )
                            ).scalar_one_or_none()

                    next_order = await get_next_order(chat_id, db)
                    new_message = Message(
                        user_id=user_id,
                        text=text,
                        chat_id=chat_id,
                        recipient_id=recipient_id,
                        is_admin=user.role in ["admin", "moderator"],
                        is_system=is_system,
                        files=files,
                        reply_to_id=reply_to.id if reply_to else None,
                        order=next_order,
                    )

                    try:
                        db.add(new_message)
                        await db.commit()
                        await db.refresh(new_message)
                        if reply_to:
                            await db.refresh(new_message, ["reply_to"])
                        if attachment_ids:
                            await link_attachments(
                                db,
                                new_message.id,
                                chat_id,
                                user_id,
                                attachment_ids,
                            )
                            await db.refresh(new_message)
                    except HTTPException as exc:
                        await db.rollback()
                        await websocket.send_text(
                            json.dumps({"type": "error", "message": exc.detail})
                        )
                        continue
                    except Exception as exc:
                        await db.rollback()
                        logger.error("❌ Ошибка сохранения сообщения: %s", exc)
                        await websocket.send_text(
                            json.dumps(
                                {"type": "error", "message": f"Ошибка сохранения: {exc}"}
                            )
                        )
                        continue

                    logger.info(
                        "💾 Сохранено сообщение #%s в чат %s (order=%s)",
                        new_message.id,
                        chat_id,
                        new_message.order,
                    )

                    sender = (
                        await db.execute(select(User).where(User.id == new_message.user_id))
                    ).scalar_one_or_none()
                    users_map = {user_id: sender} if sender else {}
                    if new_message.reply_to:
                        reply_sender = (
                            await db.execute(
                                select(User).where(User.id == new_message.reply_to.user_id)
                            )
                        ).scalar_one_or_none()
                        if reply_sender:
                            users_map[new_message.reply_to.user_id] = reply_sender

                    message_payload = await build_message_payload(new_message, db, users_map)
                    client_temp_id = message_data.get("client_temp_id")
                    if client_temp_id:
                        message_payload["client_temp_id"] = client_temp_id

                    response = {
                        "type": "new_message",
                        "message": message_payload,
                    }

                    recipients = await get_chat_recipient_ids(
                        chat_id, db, set(active_connections.keys())
                    )
                    await send_to_users(recipients, response)
                    continue

                if message_data.get("type") == "edit_message":
                    message_id = message_data.get("message_id")
                    chat_id = message_data.get("chat_id")
                    new_text = message_data.get("text")

                    if message_id and chat_id and new_text:
                        msg_to_edit = (
                            await db.execute(
                                select(Message).where(
                                    Message.id == message_id,
                                    Message.chat_id == chat_id,
                                    Message.is_deleted == False,
                                )
                            )
                        ).scalar_one_or_none()

                        if msg_to_edit and msg_to_edit.user_id == user_id:
                            msg_to_edit.text = new_text
                            msg_to_edit.edited_at = func.now()
                            await db.commit()

                            edit_response = {
                                "type": "message_edited",
                                "message": {
                                    "id": msg_to_edit.id,
                                    "chat_id": msg_to_edit.chat_id,
                                    "text": msg_to_edit.text,
                                    "edited": True,
                                    "edited_at": iso_utc(msg_to_edit.edited_at),
                                    "order": msg_to_edit.order,
                                },
                            }
                            recipients = await get_chat_recipient_ids(
                                chat_id, db, set(active_connections.keys())
                            )
                            await send_to_users(recipients, edit_response)
                    continue

                if message_data.get("type") == "delete_message":
                    message_id = message_data.get("message_id")
                    chat_id = message_data.get("chat_id")

                    if message_id and chat_id:
                        msg_to_delete = (
                            await db.execute(
                                select(Message).where(
                                    Message.id == message_id,
                                    Message.chat_id == chat_id,
                                )
                            )
                        ).scalar_one_or_none()

                        if msg_to_delete and msg_to_delete.user_id == user_id:
                            msg_to_delete.is_deleted = True
                            msg_to_delete.deleted_at = func.now()
                            await db.commit()

                            delete_response = {
                                "type": "message_deleted",
                                "message_id": message_id,
                                "chat_id": chat_id,
                            }
                            recipients = await get_chat_recipient_ids(
                                chat_id, db, set(active_connections.keys())
                            )
                            await send_to_users(recipients, delete_response)
                    continue

                if message_data.get("type") == "typing":
                    chat_id = message_data.get("chat_id", "general")
                    typing_response = {
                        "type": "typing",
                        "user_id": user_id,
                        "username": user.username if user else "unknown",
                        "chat_id": chat_id,
                    }
                    recipients = await get_chat_recipient_ids(
                        chat_id, db, set(active_connections.keys())
                    )
                    recipients.discard(str(user_id))
                    await send_to_users(recipients, typing_response)

        except WebSocketDisconnect:
            logger.info("❌ Пользователь %s отключен.", user_id)
        except Exception as exc:
            logger.error("❌ Ошибка WebSocket: %s", exc)
            traceback.print_exc()
        finally:
            unregister_connection(user_id)
            try:
                offline_user = (
                    await db.execute(select(User).where(User.id == user_id))
                ).scalar_one_or_none()
                if offline_user:
                    offline_user.is_online = False
                    offline_user.last_seen = func.now()
                    await db.commit()
                    await broadcast_user_status(user_id, False)
                    logger.info("🔴 Пользователь %s офлайн", user_id)
            except Exception as exc:
                logger.error("❌ Ошибка обновления статуса: %s", exc)

            await broadcast_online_users()
