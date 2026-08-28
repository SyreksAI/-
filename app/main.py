from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy.orm import Session
import json
import os
from .database import engine, Base, get_db
from .routes import auth, users, categories, messages, groups, upload
from .models import Message, User, Subscription
from .websocket_manager import active_connections, send_notification, broadcast_online_users

Base.metadata.create_all(bind=engine)

app = FastAPI(title="DubPar API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
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
    
    sub1 = db.query(Subscription).filter(
        Subscription.follower_id == sender_id,
        Subscription.following_id == recipient_id,
        Subscription.status == "approved"
    ).first()
    
    sub2 = db.query(Subscription).filter(
        Subscription.follower_id == recipient_id,
        Subscription.following_id == sender_id,
        Subscription.status == "approved"
    ).first()
    
    return sub1 is not None and sub2 is not None


@app.websocket("/ws/{user_id}")
async def websocket_endpoint(websocket: WebSocket, user_id: int):
    await websocket.accept()
    active_connections[str(user_id)] = websocket
    print(f"✅ Пользователь {user_id} подключен. Всего: {len(active_connections)}")
    
    await broadcast_online_users()
    
    db = next(get_db())
    try:
        user = db.query(User).filter(User.id == user_id).first()
        if user:
            user.is_online = True
            db.commit()
    except Exception as e:
        print(f"❌ Ошибка обновления статуса: {e}")
    
    db = next(get_db())
    try:
        last_messages = db.query(Message).filter(
            Message.chat_id == "general"
        ).order_by(Message.timestamp.desc(), Message.id.desc()).limit(100).all()
        
        for msg in reversed(last_messages):
            sender = db.query(User).filter(User.id == msg.user_id).first()
            await websocket.send_text(json.dumps({
                "type": "history",
                "message": {
                    "id": msg.id,
                    "user_id": msg.user_id,
                    "username": sender.username if sender else "unknown",
                    "user_name": sender.name if sender else "Unknown",
                    "text": msg.text,
                    "chat_id": msg.chat_id,
                    "is_admin": msg.is_admin,
                    "is_system": msg.is_system,
                    "read": msg.read,
                    "timestamp": msg.timestamp.isoformat(),
                    "files": msg.files or []  # ✅ ДОБАВИТЬ
                }
            }, default=str))
        
        while True:
            data = await websocket.receive_text()
            message_data = json.loads(data)
            
            if message_data.get("type") == "message":
                text = message_data["text"]
                chat_id = message_data.get("chat_id", "general")
                recipient_id = message_data.get("recipient_id")
                is_system = message_data.get("is_system", False)
                files = message_data.get("files", [])  # ✅ ДОБАВИТЬ
                
                if recipient_id and str(chat_id).startswith("private_"):
                    if not can_send_private_message(user_id, recipient_id, db):
                        await websocket.send_text(json.dumps({
                            "type": "error",
                            "message": "Требуется взаимная подписка для отправки личных сообщений"
                        }))
                        continue
                
                new_message = Message(
                    user_id=user_id,
                    text=text,
                    chat_id=chat_id,
                    recipient_id=recipient_id,
                    is_admin=message_data.get("is_admin", False),
                    is_system=is_system,
                    files=files  # ✅ ДОБАВИТЬ
                )
                db.add(new_message)
                db.commit()
                db.refresh(new_message)
                
                sender = db.query(User).filter(User.id == new_message.user_id).first()
                
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
                        "files": new_message.files or []  # ✅ ДОБАВИТЬ
                    }
                }
                
                for conn_id, connection in list(active_connections.items()):
                    try:
                        await connection.send_text(json.dumps(response, default=str))
                    except Exception:
                        if conn_id in active_connections:
                            del active_connections[conn_id]
                    
    except WebSocketDisconnect:
        print(f"❌ Пользователь {user_id} отключен.")
    except Exception as e:
        print(f"❌ Ошибка WebSocket: {e}")
    finally:
        if str(user_id) in active_connections:
            del active_connections[str(user_id)]
        
        try:
            user = db.query(User).filter(User.id == user_id).first()
            if user:
                user.is_online = False
                db.commit()
        except Exception as e:
            print(f"❌ Ошибка обновления статуса: {e}")
        
        await broadcast_online_users()
        db.close()
        print(f"🧹 Сессия БД для пользователя {user_id} закрыта.")


@app.get("/")
async def root():
    return {"message": "DubPar API is running!", "version": "1.0.0"}


@app.get("/health")
async def health():
    return {"status": "ok"}