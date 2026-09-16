import json
from typing import Dict, Set

from fastapi import WebSocket
from datetime import datetime

active_connections: Dict[str, WebSocket] = {}
connection_roles: Dict[str, str] = {}


def register_connection(user_id: int, role: str, websocket: WebSocket) -> None:
    key = str(user_id)
    active_connections[key] = websocket
    connection_roles[key] = role


def unregister_connection(user_id: int) -> None:
    key = str(user_id)
    active_connections.pop(key, None)
    connection_roles.pop(key, None)


async def send_to_users(user_ids: Set[str], message: dict) -> None:
    for user_id in user_ids:
        websocket = active_connections.get(user_id)
        if not websocket:
            continue
        try:
            await websocket.send_text(json.dumps(message, default=str))
        except Exception:
            unregister_connection(int(user_id))


async def send_notification(user_id: int, notification_type: str, data: dict):
    user_key = str(user_id)
    if user_key not in active_connections:
        print(f"⚠️ Пользователь {user_id} офлайн, уведомление пропущено")
        return False

    try:
        ws = active_connections[user_key]
        await ws.send_text(
            json.dumps(
                {
                    "type": "notification",
                    "notification_type": notification_type,
                    "data": data,
                },
                default=str,
            )
        )
        return True
    except Exception as exc:
        print(f"❌ Ошибка отправки уведомления пользователю {user_id}: {exc}")
        unregister_connection(user_id)
        return False


async def broadcast_online_users():
    connections = list(active_connections.items())
    online_users = [user_id for user_id, _ in connections]
    message = {"type": "online_users", "users": online_users}

    for user_id, ws in connections:
        try:
            await ws.send_text(json.dumps(message))
        except Exception:
            unregister_connection(int(user_id))


async def broadcast_to_chat(chat_id: str, message: dict, recipient_ids: Set[str], exclude_user_id: str = None):
    targets = set(recipient_ids)
    if exclude_user_id:
        targets.discard(exclude_user_id)
    await send_to_users(targets, message)


async def get_online_users() -> list:
    return list(active_connections.keys())


async def broadcast_to_admins(message: dict):
    for user_id, websocket in list(active_connections.items()):
        if connection_roles.get(user_id) not in ("admin", "moderator"):
            continue
        try:
            await websocket.send_text(json.dumps(message, default=str))
        except Exception:
            unregister_connection(int(user_id))


async def broadcast_user_status(user_id: int, is_online: bool):
    message = {
        "type": "user_status_changed",
        "user_id": user_id,
        "is_online": is_online,
        "timestamp": datetime.now().isoformat(),
    }
    await broadcast_to_admins(message)
