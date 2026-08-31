"""
Менеджер WebSocket соединений DubPar
"""
import json
import logging
from typing import Dict, Any
from fastapi import WebSocket

logger = logging.getLogger(__name__)

# Хранилище активных WebSocket-соединений
active_connections: Dict[str, WebSocket] = {}


async def send_notification(user_id: int, notification_type: str, data: dict) -> bool:
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
            logger.debug(f"Уведомление отправлено пользователю {user_id}: {notification_type}")
            return True
        except Exception as e:
            logger.error(f"Ошибка отправки уведомления пользователю {user_id}: {e}")
            if user_key in active_connections:
                del active_connections[user_key]
            return False
    else:
        logger.debug(f"Пользователь {user_id} офлайн, уведомление пропущено")
        return False


async def broadcast_online_users():
    """Отправить всем клиентам список онлайн пользователей"""
    online_users = list(active_connections.keys())
    message = {
        "type": "online_users",
        "users": online_users
    }
    disconnected = []
    for user_id, ws in active_connections.items():
        try:
            await ws.send_text(json.dumps(message))
        except Exception as e:
            logger.warning(f"Ошибка отправки статуса онлайна пользователю {user_id}: {e}")
            disconnected.append(user_id)
    
    # Удаляем отключенные соединения
    for user_id in disconnected:
        if str(user_id) in active_connections:
            del active_connections[str(user_id)]


async def send_message_to_user(user_id: int, message_data: dict) -> bool:
    """Отправить сообщение конкретному пользователю"""
    user_key = str(user_id)
    if user_key in active_connections:
        try:
            ws = active_connections[user_key]
            await ws.send_text(json.dumps(message_data, default=str))
            return True
        except Exception as e:
            logger.error(f"Ошибка отправки сообщения пользователю {user_id}: {e}")
            if user_key in active_connections:
                del active_connections[user_key]
            return False
    return False


async def broadcast_message(message_data: dict, exclude_user_ids: list = None):
    """Отправить сообщение всем подключенным пользователям"""
    exclude_user_ids = exclude_user_ids or []
    disconnected = []
    
    for user_id, ws in active_connections.items():
        if int(user_id) in exclude_user_ids:
            continue
        try:
            await ws.send_text(json.dumps(message_data, default=str))
        except Exception as e:
            logger.warning(f"Ошибка широковещательной рассылки пользователю {user_id}: {e}")
            disconnected.append(user_id)
    
    # Удаляем отключенные соединения
    for user_id in disconnected:
        if str(user_id) in active_connections:
            del active_connections[str(user_id)]


def get_online_users() -> list:
    """Получить список онлайн пользователей"""
    return list(active_connections.keys())


def is_user_online(user_id: int) -> bool:
    """Проверить, онлайн ли пользователь"""
    return str(user_id) in active_connections