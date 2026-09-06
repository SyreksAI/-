import json
from typing import Dict
from fastapi import WebSocket
from datetime import datetime  # ✅ ДОБАВИТЬ!

# Хранилище активных WebSocket-соединений
active_connections: Dict[str, WebSocket] = {}


async def send_notification(user_id: int, notification_type: str, data: dict):
    """Отправить уведомление пользователю через WebSocket"""
    user_key = str(user_id)
    if user_key in active_connections:
        try:
            ws = active_connections[user_key]
            await ws.send_text(json.dumps({
                "type": "notification",
                "notification_type": notification_type,
                "data": data
            }, default=str))
            print(f"📨 Уведомление отправлено пользователю {user_id}: {notification_type}")
            return True
        except Exception as e:
            print(f"❌ Ошибка отправки уведомления пользователю {user_id}: {e}")
            if user_key in active_connections:
                del active_connections[user_key]
            return False
    else:
        print(f"⚠️ Пользователь {user_id} офлайн, уведомление пропущено")
        return False


async def broadcast_online_users():
    """Отправить всем клиентам список онлайн пользователей"""
    connections = list(active_connections.items())
    online_users = [user_id for user_id, _ in connections]
    
    message = {
        "type": "online_users",
        "users": online_users
    }
    
    for user_id, ws in connections:
        try:
            await ws.send_text(json.dumps(message))
        except Exception:
            if user_id in active_connections:
                del active_connections[user_id]


async def broadcast_to_chat(chat_id: str, message: dict, exclude_user_id: str = None):
    """Отправляет сообщение всем пользователям в чате"""
    connections = list(active_connections.items())
    
    for user_id, ws in connections:
        if exclude_user_id and user_id == exclude_user_id:
            continue
        try:
            await ws.send_text(json.dumps(message, default=str))
        except Exception:
            if user_id in active_connections:
                del active_connections[user_id]


async def get_online_users() -> list:
    """Возвращает список ID онлайн-пользователей"""
    return list(active_connections.keys())


# ✅ ДОБАВЛЕНА ФУНКЦИЯ broadcast_to_admins
async def broadcast_to_admins(message: dict):
    """Отправить сообщение всем админам"""
    connections = list(active_connections.items())
    for user_id, websocket in connections:
        try:
            await websocket.send_text(json.dumps(message, default=str))
        except Exception:
            if user_id in active_connections:
                del active_connections[user_id]


# ✅ ДОБАВЛЕНА ФУНКЦИЯ broadcast_user_status
async def broadcast_user_status(user_id: int, is_online: bool):
    """Отправить всем админам обновление статуса пользователя"""
    message = {
        "type": "user_status_changed",
        "user_id": user_id,
        "is_online": is_online,
        "timestamp": datetime.now().isoformat()
    }
    await broadcast_to_admins(message)