# app/dependencies.py
from fastapi import Depends, HTTPException, Header, WebSocket
from sqlalchemy.orm import Session
from typing import Optional
from .database import get_db
from .models import User
from .config import settings
from .redis_client import get_redis_client
import json


async def get_current_user(
    x_user_id: Optional[int] = Header(None, alias="X-User-ID"),
    db: Session = Depends(get_db)
) -> User:
    """Получить текущего пользователя из заголовка X-User-ID"""
    if not x_user_id:
        raise HTTPException(
            status_code=401,
            detail="Необходима аутентификация (отсутствует заголовок X-User-ID)"
        )
    
    # ✅ Проверяем кэш Redis
    try:
        redis = await get_redis_client()
        cached_user = await redis.get(f"user:{x_user_id}")
        if cached_user:
            user_data = json.loads(cached_user)
            # Проверяем, не забанен ли пользователь
            if user_data.get('is_banned'):
                raise HTTPException(status_code=403, detail="Ваш аккаунт забанен")
            # Возвращаем пользователя из кэша (создаём объект User)
            user = User(**user_data)
            return user
    except Exception as e:
        print(f"⚠️ Redis error in get_current_user: {e}")
    
    user = db.query(User).filter(User.id == x_user_id, User.is_active == True).first()
    if not user:
        raise HTTPException(status_code=404, detail="Пользователь не найден")
    
    if user.is_banned:
        raise HTTPException(status_code=403, detail="Ваш аккаунт забанен")
    
    # ✅ Сохраняем в кэш Redis
    try:
        redis = await get_redis_client()
        await redis.setex(f"user:{x_user_id}", 300, json.dumps({
            "id": user.id,
            "name": user.name,
            "username": user.username,
            "email": user.email,
            "role": user.role,
            "is_banned": user.is_banned,
            "is_active": user.is_active
        }, default=str))
    except Exception as e:
        print(f"⚠️ Redis error saving user: {e}")
    
    return user


async def get_current_admin(
    current_user: User = Depends(get_current_user)
) -> User:
    """Получить текущего пользователя только если он админ"""
    if current_user.role not in ['admin', 'moderator']:
        raise HTTPException(
            status_code=403,
            detail="Доступ запрещен. Требуются права администратора."
        )
    return current_user


def get_ws_current_user(
    user_id: int,
    db: Session
) -> Optional[User]:
    """Получить пользователя для WebSocket"""
    user = db.query(User).filter(User.id == user_id, User.is_active == True).first()
    if not user or user.is_banned:
        return None
    return user