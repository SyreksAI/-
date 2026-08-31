from fastapi import APIRouter, Depends, HTTPException, Header
from sqlalchemy.orm import Session
from typing import Optional, List
from ..database import get_db
from ..schemas import MessageResponse, MessageCreate
from ..models import Message, User

router = APIRouter()


@router.get("/history/{chat_id}")
async def get_chat_history(
    chat_id: str,
    limit: int = 100,
    x_user_id: Optional[int] = Header(None),
    db: Session = Depends(get_db)
):
    """Получить историю сообщений для конкретного чата"""
    
    messages = db.query(Message).filter(
        Message.chat_id == chat_id
    ).order_by(Message.timestamp.asc(), Message.id.asc()).limit(limit).all()
    
    result = []
    for msg in messages:
        sender = db.query(User).filter(User.id == msg.user_id).first()
        reply_to_data = None
        if msg.reply_to:
            reply_sender = db.query(User).filter(User.id == msg.reply_to.user_id).first()
            reply_to_data = {
                "message_id": msg.reply_to.id,
                "text": msg.reply_to.text,
                "username": reply_sender.username if reply_sender else "unknown",
                "user_id": msg.reply_to.user_id
            }
        
        result.append({
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
        })
    
    return result


@router.get("/chat/{chat_id}")
async def get_messages_by_chat(
    chat_id: str,
    limit: int = 50,
    x_user_id: Optional[int] = Header(None),
    db: Session = Depends(get_db)
):
    """Получить сообщения для чата по ID"""
    
    messages = db.query(Message).filter(
        Message.chat_id == chat_id
    ).order_by(Message.timestamp.desc(), Message.id.desc()).limit(limit).all()
    
    result = []
    for msg in reversed(messages):
        sender = db.query(User).filter(User.id == msg.user_id).first()
        reply_to_data = None
        if msg.reply_to:
            reply_sender = db.query(User).filter(User.id == msg.reply_to.user_id).first()
            reply_to_data = {
                "message_id": msg.reply_to.id,
                "text": msg.reply_to.text,
                "username": reply_sender.username if reply_sender else "unknown",
                "user_id": msg.reply_to.user_id
            }
        
        result.append({
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
        })
    
    return result


@router.post("/")
async def create_message(
    message: MessageCreate,
    x_user_id: Optional[int] = Header(None),
    db: Session = Depends(get_db)
):
    """Отправить сообщение через REST API (запасной вариант)"""
    
    current_user_id = x_user_id if x_user_id else 1
    
    # Обработка reply_to
    reply_to_id = None
    if message.reply_to:
        reply_to_id = message.reply_to.get("message_id")
    
    new_message = Message(
        user_id=current_user_id,
        text=message.text,
        chat_id=message.chat_id,
        recipient_id=message.recipient_id,
        is_admin=False,
        is_system=False,
        files=message.files or [],
        reply_to_id=reply_to_id
    )
    
    db.add(new_message)
    db.commit()
    db.refresh(new_message)
    
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
    
    return {
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
        "reply_to": reply_to_response
    }