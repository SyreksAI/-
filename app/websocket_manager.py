import json

# Хранилище активных WebSocket-соединений
active_connections = {}

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
    online_users = list(active_connections.keys())
    message = {
        "type": "online_users",
        "users": online_users
    }
    for user_id, ws in active_connections.items():
        try:
            await ws.send_text(json.dumps(message))
        except Exception:
            pass