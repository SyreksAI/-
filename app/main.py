from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy.orm import Session
from sqlalchemy import text
import json
import os
import traceback
import logging
from .database import engine, Base, get_db
from .routes import auth, users, categories, messages, groups, upload
from .models import Message, User, Subscription, Group
from .websocket_manager import active_connections, send_notification, broadcast_online_users

# ✅ Настройка логирования
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

Base.metadata.create_all(bind=engine)

# ✅ Ограничиваем CORS для продакшена
ALLOWED_ORIGINS = os.getenv("ALLOWED_ORIGINS", "http://localhost:3000,http://localhost:8080").split(",")

app = FastAPI(title="DubPar API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,  # ✅ Ограниченный список
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/api/auth", tags=["auth"])
app.include_router(users.router, prefix="/api/users", tags=["users"])
app.include_router(categories.router, prefix="/api/categories", tags=["categories"])
app.include_router(messages.router, prefix="/api/messages", tags=["messages"])
app.include_router(groups.router, prefix="/api/groups", tags=["groups"])
app.include_router(upload.router, prefix="/api/upload", tags=["upload"])

if os.path.exists("uploads"):
    app.mount("/uploads", StaticFiles(directory="uploads"), name="uploads")


def can_send_private_message(sender_id: int, recipient_id: int, db: Session) -> bool:
    if sender_id == recipient_id:
        return False
    
    # ✅ Оптимизированный запрос (одновременная проверка обеих подписок)
    subscriptions = db.query(Subscription).filter(
        Subscription.follower_id.in_([sender_id, recipient_id]),
        Subscription.following_id.in_([sender_id, recipient_id]),
        Subscription.status == "approved"
    ).all()
    
    # Проверяем, что есть обе подписки
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


@app.websocket("/ws/{user_id}")
async def websocket_endpoint(websocket: WebSocket, user_id: int):
    await websocket.accept()
    active_connections[str(user_id)] = websocket
    logger.info(f"✅ Пользователь {user_id} подключен. Всего: {len(active_connections)}")
    
    await broadcast_online_users()
    
    # ✅ Одна сессия для всего WebSocket
    db = None
    try:
        db = next(get_db())
        
        # Обновляем статус пользователя
        user = db.query(User).filter(User.id == user_id).first()
        if user:
            user.is_online = True
            db.commit()
            logger.info(f"🟢 Пользователь {user_id} ({user.username}) онлайн")
        
        # ✅ ОТПРАВЛЯЕМ ИСТОРИЮ С ОПТИМИЗАЦИЕЙ
        chat_ids = ['general']
        
        # Личные чаты: получаем всех пользователей с взаимной подпиской
        subs = db.query(Subscription).filter(
            Subscription.follower_id == user_id,
            Subscription.status == 'approved'
        ).all()
        for sub in subs:
            chat_ids.append(f"private_{min(user_id, sub.following_id)}_{max(user_id, sub.following_id)}")
        
        # ГРУППЫ — загружаем через объекты
        all_groups = db.query(Group).all()
        for group in all_groups:
            members = parse_members(group.members)
            if user_id in members:
                chat_ids.append(group.id)
        
        logger.info(f"📋 Чаты пользователя {user_id}: {chat_ids}")
        
        # Загружаем сообщения для всех чатов
        all_messages = db.query(Message).filter(
            Message.chat_id.in_(chat_ids)
        ).order_by(Message.timestamp.asc(), Message.id.asc()).all()
        
        # ✅ Предварительно загружаем всех пользователей для избежания N+1
        user_ids = set()
        for msg in all_messages:
            user_ids.add(msg.user_id)
            if msg.reply_to:
                user_ids.add(msg.reply_to.user_id)
        
        users_map = {u.id: u for u in db.query(User).filter(User.id.in_(user_ids)).all()}
        
        logger.info(f"📨 Загружено {len(all_messages)} сообщений для пользователя {user_id}")
        
        # Отправляем каждое сообщение
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
                    "reply_to": reply_to_data
                }
            }, default=str))
        
        # Подтверждаем завершение отправки истории
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
                
                # Проверяем доступ к чату
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
                    group = db.query(Group).filter(Group.id == chat_id).first()
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
                
                # Загружаем историю
                messages_history = db.query(Message).filter(
                    Message.chat_id == chat_id
                ).order_by(Message.timestamp.asc(), Message.id.asc()).limit(limit).all()
                
                logger.info(f"📨 Найдено {len(messages_history)} сообщений для чата {chat_id}")
                
                if len(messages_history) == 0:
                    await websocket.send_text(json.dumps({
                        "type": "history_complete",
                        "chat_id": chat_id,
                        "count": 0
                    }))
                    continue
                
                # ✅ Предварительно загружаем пользователей
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
                            "reply_to": reply_to_data
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
                text = message_data["text"]
                chat_id = message_data.get("chat_id", "general")
                recipient_id = message_data.get("recipient_id")
                is_system = message_data.get("is_system", False)
                files = message_data.get("files", [])
                is_shared = message_data.get("is_shared", False)
                original_sender = message_data.get("original_sender")
                original_chat = message_data.get("original_chat")
                
                # Сохраняем метаданные о пересылке
                forward_metadata = None
                if is_shared and original_sender:
                    forward_metadata = {
                        "is_shared": True,
                        "original_sender": original_sender,
                        "original_chat": original_chat,
                        "original_text": text
                    }
                
                # Определяем тип чата
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
                    # ГРУППА — проверяем через объект
                    group = db.query(Group).filter(Group.id == chat_id).first()
                    
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
                
                # Обработка reply_to
                reply_to = None
                reply_to_data = message_data.get("reply_to")
                if reply_to_data:
                    reply_to_id = reply_to_data.get("message_id")
                    if reply_to_id:
                        reply_to = db.query(Message).filter(Message.id == reply_to_id).first()
                
                # Сохраняем метаданные о пересылке
                if forward_metadata:
                    if not files:
                        files = []
                    files.append({
                        "_type": "forward_metadata",
                        "original_sender": original_sender,
                        "original_chat": original_chat,
                        "original_text": text
                    })
                
                # Создаём сообщение
                new_message = Message(
                    user_id=user_id,
                    text=text,
                    chat_id=chat_id,
                    recipient_id=recipient_id,
                    is_admin=message_data.get("is_admin", False),
                    is_system=is_system,
                    files=files,
                    reply_to_id=reply_to.id if reply_to else None
                )
                db.add(new_message)
                db.commit()
                db.refresh(new_message)
                
                logger.info(f"💾 Сохранено сообщение #{new_message.id} в чат {chat_id}")
                
                sender = db.query(User).filter(User.id == new_message.user_id).first()
                
                # Формируем reply_to для ответа
                reply_to_response = None
                if new_message.reply_to:
                    reply_sender = db.query(User).filter(User.id == new_message.reply_to.user_id).first()
                    reply_to_response = {
                        "message_id": new_message.reply_to.id,
                        "text": new_message.reply_to.text,
                        "username": reply_sender.username if reply_sender else "unknown",
                        "user_id": new_message.reply_to.user_id
                    }
                
                # Извлекаем информацию о пересылке
                forward_response = None
                if forward_metadata:
                    forward_response = {
                        "is_shared": True,
                        "original_sender": original_sender,
                        "original_chat": original_chat,
                        "original_text": text
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
                        "forward": forward_response
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
                        Message.chat_id == chat_id
                    ).first()
                    
                    if msg_to_edit and msg_to_edit.user_id == user_id:
                        msg_to_edit.text = new_text
                        db.commit()
                        
                        logger.info(f"✏️ Сообщение #{message_id} отредактировано")
                        
                        edit_response = {
                            "type": "message_edited",
                            "message": {
                                "id": msg_to_edit.id,
                                "chat_id": msg_to_edit.chat_id,
                                "text": msg_to_edit.text,
                                "edited": True
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
                        db.delete(msg_to_delete)
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
                    db.commit()
                    logger.info(f"🔴 Пользователь {user_id} офлайн")
            except Exception as e:
                logger.error(f"❌ Ошибка обновления статуса: {e}")
            finally:
                db.close()
                logger.info(f"🧹 Сессия БД для пользователя {user_id} закрыта.")
        
        await broadcast_online_users()


@app.get("/")
async def root():
    return {"message": "DubPar API is running!", "version": "1.0.0"}


@app.get("/health")
async def health():
    return {"status": "ok"}