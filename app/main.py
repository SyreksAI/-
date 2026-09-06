from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy.orm import Session
from sqlalchemy import func, text
import json
import os
import traceback
import logging
import time
from typing import Dict, List, Optional, Any, Set

# ✅ ВСЕ АБСОЛЮТНЫЕ ИМПОРТЫ
from app.database import engine, Base, get_db
from app.routes import auth, users, categories, messages, groups, upload, test
from app.routes import forum  # ✅ ДОБАВЛЕНО: импорт форума
from app.models import (
    Message, User, Subscription, Group, Category, AdminLog,
    ForumCategory, ForumTopic, ForumPost, ForumComment,
    Technology, StudyTopic, StudySubtopic
)
from app.websocket_manager import active_connections, send_notification, broadcast_online_users, broadcast_user_status
from app.config import settings
from app.dependencies import get_current_user, get_ws_current_user
from app.middleware import RateLimitMiddleware, LoggingMiddleware
from app.routes import study
from app.routes import settings as settings_router
from app.routes import comments
from app.routes import support
from app.routes import progress

# ✅ Настройка логирования
logging.basicConfig(
    level=getattr(logging, settings.LOG_LEVEL, "INFO"),
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Создаём таблицы
try:
    Base.metadata.create_all(bind=engine)
    logger.info("✅ Таблицы созданы успешно")
except Exception as e:
    logger.error(f"❌ Ошибка создания таблиц: {e}")

# ✅ Создаём приложение
app = FastAPI(
    title="DubPar API",
    version="2.0.0",
    description="DubPar - образовательная платформа с чатом и форумом"
)

# ✅ CORS с ограниченным списком из настроек
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ✅ Добавляем middleware для безопасности и логирования
app.add_middleware(RateLimitMiddleware)
app.add_middleware(LoggingMiddleware)

# Подключаем роутеры
app.include_router(auth.router, prefix="/api/auth", tags=["auth"])
app.include_router(users.router, prefix="/api/users", tags=["users"])
app.include_router(categories.router, prefix="/api/categories", tags=["categories"])
app.include_router(messages.router, prefix="/api/messages", tags=["messages"])
app.include_router(groups.router, prefix="/api/groups", tags=["groups"])
app.include_router(upload.router, prefix="/api/upload", tags=["upload"])
app.include_router(test.router, prefix="/api/test", tags=["test"])
app.include_router(forum.router, prefix="/api/forum", tags=["forum"])
app.include_router(study.router, prefix="/api/study", tags=["study"])
app.include_router(settings_router.router, prefix="/api/settings", tags=["settings"])
app.include_router(comments.router, prefix="/api/comments", tags=["comments"])
app.include_router(support.router, prefix="/api/support", tags=["support"])
app.include_router(progress.router, prefix="/api/progress", tags=["progress"])

# Монтируем статические файлы
if os.path.exists("uploads"):
    app.mount("/uploads", StaticFiles(directory="uploads"), name="uploads")


def can_send_private_message(sender_id: int, recipient_id: int, db: Session) -> bool:
    """
    Проверяет, могут ли два пользователя отправлять друг другу личные сообщения.
    Требуется взаимная подписка.
    """
    if sender_id == recipient_id:
        return False
    
    subscriptions = db.query(Subscription).filter(
        Subscription.follower_id.in_([sender_id, recipient_id]),
        Subscription.following_id.in_([sender_id, recipient_id]),
        Subscription.status == "approved"
    ).all()
    
    sent_exists = any(s.follower_id == sender_id and s.following_id == recipient_id for s in subscriptions)
    recv_exists = any(s.follower_id == recipient_id and s.following_id == sender_id for s in subscriptions)
    
    return sent_exists and recv_exists


def parse_members(members):
    """Парсит поле members в список"""
    if members is None:
        return []
    if isinstance(members, list):
        return members
    if isinstance(members, str):
        try:
            return json.loads(members)
        except:
            return []
    try:
        return json.loads(json.dumps(members))
    except:
        return []


def get_next_order(chat_id: str, db: Session) -> int:
    """
    Генерирует уникальный order на основе времени в микросекундах.
    """
    # Базовое значение - текущее время в микросекундах
    base_order = int(time.time() * 1000000)
    
    # Проверяем, что такого order нет в этом чате (на случай коллизий)
    existing = db.query(Message).filter(
        Message.chat_id == chat_id,
        Message.order == base_order
    ).first()
    
    # Если коллизия - увеличиваем на 1 до уникального значения
    while existing:
        base_order += 1
        existing = db.query(Message).filter(
            Message.chat_id == chat_id,
            Message.order == base_order
        ).first()
    
    return base_order


@app.websocket("/ws/{user_id}")
async def websocket_endpoint(websocket: WebSocket, user_id: int):
    """WebSocket эндпоинт для чата"""
    await websocket.accept()
    
    db = None
    user = None
    try:
        db = next(get_db())
        user = get_ws_current_user(user_id, db)
        if not user:
            await websocket.close(code=1008, reason="Пользователь не найден или забанен")
            return
    except Exception as e:
        logger.error(f"❌ Ошибка проверки пользователя: {e}")
        await websocket.close(code=1008, reason="Ошибка авторизации")
        return
    
    active_connections[str(user_id)] = websocket
    logger.info(f"✅ Пользователь {user_id} ({user.username}) подключен. Всего: {len(active_connections)}")
    
    await broadcast_online_users()
    
    try:
        user.is_online = True
        db.commit()
        await broadcast_user_status(user_id, True)
        
        # ✅ ОТПРАВЛЯЕМ ИСТОРИЮ
        chat_ids = ['general']
        
        subs = db.query(Subscription).filter(
            Subscription.follower_id == user_id,
            Subscription.status == 'approved'
        ).all()
        for sub in subs:
            chat_ids.append(f"private_{min(user_id, sub.following_id)}_{max(user_id, sub.following_id)}")
        
        all_groups = db.query(Group).filter(Group.is_active == True).all()
        for group in all_groups:
            members = parse_members(group.members)
            if user_id in members:
                chat_ids.append(group.id)
        
        logger.info(f"📋 Чаты пользователя {user_id}: {chat_ids}")
        
        # ✅ СОРТИРУЕМ ПО order (1, 2, 3, ...)
        all_messages = db.query(Message).filter(
            Message.chat_id.in_(chat_ids),
            Message.is_deleted == False
        ).order_by(Message.order.asc()).all()
        
        user_ids = set()
        for msg in all_messages:
            user_ids.add(msg.user_id)
            if msg.reply_to:
                user_ids.add(msg.reply_to.user_id)
        
        users_map = {u.id: u for u in db.query(User).filter(User.id.in_(user_ids)).all()}
        
        logger.info(f"📨 Загружено {len(all_messages)} сообщений для пользователя {user_id}")
        
        for msg in all_messages:
            sender = users_map.get(msg.user_id)
            reply_to_data = None
            if msg.reply_to:
                reply_sender = users_map.get(msg.reply_to.user_id)
                reply_to_data = {
                    "message_id": msg.reply_to.id,
                    "text": msg.reply_to.text,
                    "username": reply_sender.username if reply_sender else "unknown",
                    "user_id": msg.reply_to.user_id
                }
            
            await websocket.send_text(json.dumps({
                "type": "history",
                "message": {
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
                    "timestamp": msg.timestamp.isoformat(),
                    "files": msg.files or [],
                    "reply_to": reply_to_data,
                    "is_deleted": msg.is_deleted,
                    "edited_at": msg.edited_at.isoformat() if msg.edited_at else None,
                    "order": msg.order
                }
            }, default=str))
        
        await websocket.send_text(json.dumps({
            "type": "history_complete",
            "chat_id": "all",
            "count": len(all_messages)
        }))
        
        logger.info(f"✅ История отправлена для {len(all_messages)} сообщений")
        
        # ✅ Основной цикл обработки сообщений
        while True:
            data = await websocket.receive_text()
            message_data = json.loads(data)
            
            logger.info(f"📥 Получено от {user_id}: {message_data.get('type')}")
            
            # ✅ ОБРАБОТКА get_history
            if message_data.get("type") == "get_history":
                chat_id = message_data.get("chat_id", "general")
                limit = message_data.get("limit", 100)
                
                logger.info(f"📨 Запрос истории для чата: {chat_id}")
                
                if chat_id.startswith("private_"):
                    parts = chat_id.split("_")
                    if len(parts) == 3:
                        user1 = int(parts[1])
                        user2 = int(parts[2])
                        if user_id not in [user1, user2]:
                            await websocket.send_text(json.dumps({
                                "type": "error",
                                "message": "Доступ запрещен"
                            }))
                            continue
                elif chat_id != "general":
                    group = db.query(Group).filter(Group.id == chat_id, Group.is_active == True).first()
                    if not group:
                        await websocket.send_text(json.dumps({
                            "type": "error",
                            "message": "Группа не найдена"
                        }))
                        continue
                    
                    members = parse_members(group.members)
                    if user_id not in members:
                        await websocket.send_text(json.dumps({
                            "type": "error",
                            "message": "Доступ запрещен"
                        }))
                        continue
                
                messages_history = db.query(Message).filter(
                    Message.chat_id == chat_id,
                    Message.is_deleted == False
                ).order_by(Message.order.asc()).limit(limit).all()
                
                logger.info(f"📨 Найдено {len(messages_history)} сообщений для чата {chat_id}")
                
                if len(messages_history) == 0:
                    await websocket.send_text(json.dumps({
                        "type": "history_complete",
                        "chat_id": chat_id,
                        "count": 0
                    }))
                    continue
                
                msg_user_ids = set()
                for msg in messages_history:
                    msg_user_ids.add(msg.user_id)
                    if msg.reply_to:
                        msg_user_ids.add(msg.reply_to.user_id)
                
                msg_users_map = {u.id: u for u in db.query(User).filter(User.id.in_(msg_user_ids)).all()}
                
                for msg in messages_history:
                    sender = msg_users_map.get(msg.user_id)
                    reply_to_data = None
                    if msg.reply_to:
                        reply_sender = msg_users_map.get(msg.reply_to.user_id)
                        reply_to_data = {
                            "message_id": msg.reply_to.id,
                            "text": msg.reply_to.text,
                            "username": reply_sender.username if reply_sender else "unknown",
                            "user_id": msg.reply_to.user_id
                        }
                    
                    await websocket.send_text(json.dumps({
                        "type": "history",
                        "message": {
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
                            "timestamp": msg.timestamp.isoformat(),
                            "files": msg.files or [],
                            "reply_to": reply_to_data,
                            "is_deleted": msg.is_deleted,
                            "edited_at": msg.edited_at.isoformat() if msg.edited_at else None,
                            "order": msg.order
                        }
                    }, default=str))
                
                await websocket.send_text(json.dumps({
                    "type": "history_complete",
                    "chat_id": chat_id,
                    "count": len(messages_history)
                }))
                
                continue
            
            # ✅ ОБРАБОТКА ОБЫЧНЫХ СООБЩЕНИЙ
            if message_data.get("type") == "message":
                text = message_data.get("text", "")
                chat_id = message_data.get("chat_id", "general")
                recipient_id = message_data.get("recipient_id")
                is_system = message_data.get("is_system", False)
                files = message_data.get("files", [])
                
                if chat_id.startswith("private_"):
                    parts = chat_id.split("_")
                    if len(parts) == 3:
                        user1 = int(parts[1])
                        user2 = int(parts[2])
                        recipient_id = user2 if user1 == user_id else user1
                        
                        if not can_send_private_message(user_id, recipient_id, db):
                            await websocket.send_text(json.dumps({
                                "type": "error",
                                "message": "Требуется взаимная подписка для отправки личных сообщений"
                            }))
                            continue
                
                elif chat_id != "general":
                    group = db.query(Group).filter(Group.id == chat_id, Group.is_active == True).first()
                    
                    if not group:
                        await websocket.send_text(json.dumps({
                            "type": "error",
                            "message": "Группа не найдена"
                        }))
                        continue
                    
                    members = parse_members(group.members)
                    if user_id not in members:
                        await websocket.send_text(json.dumps({
                            "type": "error",
                            "message": "Вы не состоите в этой группе"
                        }))
                        continue
                    
                    recipient_id = None
                
                reply_to = None
                reply_to_data = message_data.get("reply_to")
                if reply_to_data:
                    reply_to_id = reply_to_data.get("message_id")
                    if reply_to_id:
                        reply_to = db.query(Message).filter(Message.id == reply_to_id).first()
                
                # ✅ ИСПРАВЛЕНО: простой order (1, 2, 3, ...)
                next_order = get_next_order(chat_id, db)
                
                new_message = Message(
                    user_id=user_id,
                    text=text,
                    chat_id=chat_id,
                    recipient_id=recipient_id,
                    is_admin=message_data.get("is_admin", False),
                    is_system=is_system,
                    files=files,
                    reply_to_id=reply_to.id if reply_to else None,
                    order=next_order
                )
                
                # ✅ ИСПРАВЛЕНО: обработка ошибок при сохранении
                try:
                    db.add(new_message)
                    db.commit()
                    db.refresh(new_message)
                except Exception as e:
                    db.rollback()
                    logger.error(f"❌ Ошибка сохранения сообщения: {e}")
                    await websocket.send_text(json.dumps({
                        "type": "error",
                        "message": f"Ошибка сохранения: {str(e)}"
                    }))
                    continue
                
                logger.info(f"💾 Сохранено сообщение #{new_message.id} в чат {chat_id} (order={new_message.order})")
                
                sender = db.query(User).filter(User.id == new_message.user_id).first()
                
                reply_to_response = None
                if new_message.reply_to:
                    reply_sender = db.query(User).filter(User.id == new_message.reply_to.user_id).first()
                    reply_to_response = {
                        "message_id": new_message.reply_to.id,
                        "text": new_message.reply_to.text,
                        "username": reply_sender.username if reply_sender else "unknown",
                        "user_id": new_message.reply_to.user_id
                    }
                
                response = {
                    "type": "new_message",
                    "message": {
                        "id": new_message.id,
                        "user_id": new_message.user_id,
                        "username": sender.username if sender else "unknown",
                        "user_name": sender.name if sender else "Unknown",
                        "text": new_message.text,
                        "chat_id": new_message.chat_id,
                        "recipient_id": new_message.recipient_id,
                        "is_admin": new_message.is_admin,
                        "is_system": new_message.is_system,
                        "read": new_message.read,
                        "timestamp": new_message.timestamp.isoformat(),
                        "files": new_message.files or [],
                        "reply_to": reply_to_response,
                        "order": new_message.order
                    }
                }
                
                # Отправляем всем
                for conn_id, connection in list(active_connections.items()):
                    try:
                        await connection.send_text(json.dumps(response, default=str))
                    except Exception:
                        if conn_id in active_connections:
                            del active_connections[conn_id]
                
                continue
            
            # ✅ ОБРАБОТКА edit_message
            if message_data.get("type") == "edit_message":
                message_id = message_data.get("message_id")
                chat_id = message_data.get("chat_id")
                new_text = message_data.get("text")
                
                if message_id and chat_id and new_text:
                    msg_to_edit = db.query(Message).filter(
                        Message.id == message_id,
                        Message.chat_id == chat_id,
                        Message.is_deleted == False
                    ).first()
                    
                    if msg_to_edit and msg_to_edit.user_id == user_id:
                        msg_to_edit.text = new_text
                        msg_to_edit.edited_at = func.now()
                        db.commit()
                        
                        logger.info(f"✏️ Сообщение #{message_id} отредактировано")
                        
                        edit_response = {
                            "type": "message_edited",
                            "message": {
                                "id": msg_to_edit.id,
                                "chat_id": msg_to_edit.chat_id,
                                "text": msg_to_edit.text,
                                "edited": True,
                                "edited_at": msg_to_edit.edited_at.isoformat() if msg_to_edit.edited_at else None,
                                "order": msg_to_edit.order
                            }
                        }
                        for conn_id, connection in list(active_connections.items()):
                            try:
                                await connection.send_text(json.dumps(edit_response, default=str))
                            except Exception:
                                pass
                continue
            
            # ✅ ОБРАБОТКА delete_message
            if message_data.get("type") == "delete_message":
                message_id = message_data.get("message_id")
                chat_id = message_data.get("chat_id")
                
                if message_id and chat_id:
                    msg_to_delete = db.query(Message).filter(
                        Message.id == message_id,
                        Message.chat_id == chat_id
                    ).first()
                    
                    if msg_to_delete and msg_to_delete.user_id == user_id:
                        msg_to_delete.is_deleted = True
                        msg_to_delete.deleted_at = func.now()
                        db.commit()
                        
                        logger.info(f"🗑️ Сообщение #{message_id} удалено")
                        
                        delete_response = {
                            "type": "message_deleted",
                            "message_id": message_id,
                            "chat_id": chat_id
                        }
                        for conn_id, connection in list(active_connections.items()):
                            try:
                                await connection.send_text(json.dumps(delete_response, default=str))
                            except Exception:
                                pass
                continue
            
            # ✅ ОБРАБОТКА typing
            if message_data.get("type") == "typing":
                chat_id = message_data.get("chat_id", "general")
                typing_response = {
                    "type": "typing",
                    "user_id": user_id,
                    "username": user.username if user else "unknown",
                    "chat_id": chat_id
                }
                for conn_id, connection in list(active_connections.items()):
                    try:
                        await connection.send_text(json.dumps(typing_response, default=str))
                    except Exception:
                        pass
                continue
                    
    except WebSocketDisconnect:
        logger.info(f"❌ Пользователь {user_id} отключен.")
    except Exception as e:
        logger.error(f"❌ Ошибка WebSocket: {e}")
        traceback.print_exc()
    finally:
        if str(user_id) in active_connections:
            del active_connections[str(user_id)]
        
        if db:
            try:
                user = db.query(User).filter(User.id == user_id).first()
                if user:
                    user.is_online = False
                    user.last_seen = func.now()
                    db.commit()
                    await broadcast_user_status(user_id, False)  
                    logger.info(f"🔴 Пользователь {user_id} офлайн")
            except Exception as e:
                logger.error(f"❌ Ошибка обновления статуса: {e}")
            finally:
                db.close()
                logger.info(f"🧹 Сессия БД для пользователя {user_id} закрыта.")
        
        await broadcast_online_users()


@app.get("/")
async def root():
    return {
        "message": "DubPar API is running!",
        "version": "2.0.0",
        "status": "online"
    }


@app.get("/health")
async def health():
    return {
        "status": "ok",
        "version": "2.0.0",
        "active_connections": len(active_connections)
    }


@app.get("/api/status")
async def api_status():
    """Проверка статуса API"""
    return {
        "status": "online",
        "database": "connected",
        "websocket": "active",
        "connections": len(active_connections)
    }