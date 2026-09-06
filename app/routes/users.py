# app/routes/users.py
from fastapi import APIRouter, Depends, HTTPException, Header, Request
from sqlalchemy.orm import Session
from typing import List, Optional
from passlib.context import CryptContext
import logging
from datetime import datetime, timedelta

from app.database import get_db
from app.models import User, Subscription, Message, Comment
from app.schemas import UserResponse, SubscriptionRequest, UserUpdate
from app.websocket_manager import send_notification
from app.config import settings
from app.redis_client import cache, invalidate_cache

logger = logging.getLogger(__name__)

router = APIRouter()

# ===== ХЕШИРОВАНИЕ ПАРОЛЕЙ =====
pwd_context = CryptContext(schemes=['pbkdf2_sha256'], deprecated='auto')

def get_password_hash(password):
    return pwd_context.hash(password)

def validate_password(password: str) -> bool:
    if len(password) < 8:
        return False
    if not any(c.isupper() for c in password):
        return False
    if not any(c.islower() for c in password):
        return False
    if not any(c.isdigit() for c in password):
        return False
    if not any(c in "!@#$%^&*()_+-=[]{}|;:,.<>?" for c in password):
        return False
    return True


# ===== ЗАВИСИМОСТЬ ДЛЯ ПОЛУЧЕНИЯ ТЕКУЩЕГО ПОЛЬЗОВАТЕЛЯ =====
async def get_current_user(
    x_user_id: Optional[int] = Header(None, alias="X-User-ID"),
    db: Session = Depends(get_db)
) -> User:
    if not x_user_id:
        raise HTTPException(
            status_code=401, 
            detail="Необходима аутентификация (отсутствует заголовок X-User-ID)"
        )
    
    user = db.query(User).filter(User.id == x_user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Пользователь не найден")
    
    return user


# ===== PING (ОБНОВЛЕНИЕ ОНЛАЙН-СТАТУСА) =====
@router.post("/ping")
async def ping_user(
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    user = db.query(User).filter(User.id == current_user.id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Пользователь не найден")
    
    user.last_activity = datetime.now()
    user.is_online = True
    
    db.commit()
    db.refresh(user)
    
    online_count = db.query(User).filter(
        User.is_online == True,
        User.last_activity > datetime.now() - timedelta(minutes=5)
    ).count()
    
    return {
        "status": "ok",
        "last_activity": user.last_activity.isoformat(),
        "online_count": online_count
    }


# ===== GET ЭНДПОИНТЫ =====
@router.get("/", response_model=List[UserResponse])
@cache(ttl=60, key_prefix="users_list")
async def get_all_users(db: Session = Depends(get_db)):
    try:
        users = db.query(User).all()
        # ✅ Преобразуем в список словарей
        return [UserResponse.model_validate(user).model_dump() for user in users]
    except Exception as e:
        print(f"❌ Ошибка в get_all_users: {e}")
        return []


@router.get("/search", response_model=List[UserResponse])
async def search_users(q: str, db: Session = Depends(get_db)):
    try:
        return db.query(User).filter(User.username.ilike(f"%{q}%")).limit(20).all()
    except Exception as e:
        print(f"❌ Ошибка в search_users: {e}")
        return []


@router.get("/{user_id}", response_model=UserResponse)
@cache(ttl=120, key_prefix="user_profile")
async def get_user(user_id: int, db: Session = Depends(get_db)):
    try:
        user = db.query(User).filter(User.id == user_id).first()
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        return user
    except Exception as e:
        print(f"❌ Ошибка в get_user: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ===== ПОДПИСКИ =====
@router.get("/{user_id}/pending-subscriptions")
async def get_pending_subscriptions(
    user_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    try:
        if current_user.id != user_id:
            raise HTTPException(status_code=403, detail="Доступ запрещен")
            
        subscriptions = db.query(Subscription).filter(
            Subscription.following_id == user_id,
            Subscription.status == "pending"
        ).all()
        
        result = []
        for sub in subscriptions:
            follower = db.query(User).filter(User.id == sub.follower_id).first()
            if follower:
                result.append({
                    "id": sub.id,
                    "follower_id": sub.follower_id,
                    "follower_username": follower.username,
                    "follower_name": follower.name,
                    "following_id": sub.following_id,
                    "status": sub.status,
                    "created_at": sub.created_at.isoformat() if sub.created_at else None
                })
        return result
    except Exception as e:
        print(f"❌ Ошибка в pending-subscriptions: {e}")
        return []


@router.post("/subscribe")
async def subscribe(
    request: SubscriptionRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    try:
        if current_user.id == request.following_id:
            raise HTTPException(status_code=400, detail="Нельзя подписаться на себя")
        
        following = db.query(User).filter(User.id == request.following_id).first()
        if not following:
            raise HTTPException(status_code=404, detail="User not found")
        
        existing = db.query(Subscription).filter(
            Subscription.follower_id == current_user.id,
            Subscription.following_id == request.following_id
        ).first()
        
        if existing:
            if existing.status == "pending":
                raise HTTPException(status_code=400, detail="Запрос уже отправлен")
            elif existing.status == "approved":
                raise HTTPException(status_code=400, detail="Вы уже подписаны")
            elif existing.status == "rejected":
                existing.status = "pending"
                db.commit()
                db.refresh(existing)
                await send_notification(
                    user_id=request.following_id,
                    notification_type="subscription_request",
                    data={
                        "subscription_id": existing.id,
                        "follower_id": current_user.id,
                        "follower_name": current_user.name,
                        "follower_username": current_user.username
                    }
                )
                logger.info(f"📨 Запрос на подписку отправлен повторно от {current_user.id} к {request.following_id}")
                return {"id": existing.id, "status": existing.status, "message": "Запрос отправлен повторно"}
        
        subscription = Subscription(
            follower_id=current_user.id,
            following_id=request.following_id,
            status="pending"
        )
        db.add(subscription)
        db.commit()
        db.refresh(subscription)
        
        await send_notification(
            user_id=request.following_id,
            notification_type="subscription_request",
            data={
                "subscription_id": subscription.id,
                "follower_id": current_user.id,
                "follower_name": current_user.name,
                "follower_username": current_user.username
            }
        )
        
        logger.info(f"📨 Запрос на подписку отправлен от {current_user.id} к {request.following_id}")
        
        return {"id": subscription.id, "status": subscription.status, "message": "Запрос отправлен"}
    except Exception as e:
        print(f"❌ Ошибка в subscribe: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/subscriptions/{subscription_id}/approve")
async def approve_subscription(
    subscription_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    try:
        subscription = db.query(Subscription).filter(Subscription.id == subscription_id).first()
        if not subscription:
            raise HTTPException(status_code=404, detail="Подписка не найдена")
        
        if subscription.following_id != current_user.id:
            raise HTTPException(status_code=403, detail="Нет прав для одобрения этой подписки")
        
        subscription.status = "approved"
        
        reverse_sub = db.query(Subscription).filter(
            Subscription.follower_id == current_user.id,
            Subscription.following_id == subscription.follower_id
        ).first()
        
        if not reverse_sub:
            reverse_sub = Subscription(
                follower_id=current_user.id,
                following_id=subscription.follower_id,
                status="approved"
            )
            db.add(reverse_sub)
        else:
            reverse_sub.status = "approved"
            
        db.commit()
        
        await send_notification(
            user_id=subscription.follower_id,
            notification_type="subscription_approved",
            data={
                "subscription_id": subscription.id,
                "following_id": current_user.id,
                "follower_id": subscription.follower_id
            }
        )
        
        logger.info(f"✅ Подписка #{subscription_id} одобрена")
        
        return {"message": "Подписка одобрена", "status": "approved"}
    except Exception as e:
        print(f"❌ Ошибка в approve_subscription: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/subscriptions/{subscription_id}/reject")
async def reject_subscription(
    subscription_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    try:
        subscription = db.query(Subscription).filter(Subscription.id == subscription_id).first()
        if not subscription or subscription.following_id != current_user.id:
            raise HTTPException(status_code=403, detail="Нет прав для отклонения")
        
        subscription.status = "rejected"
        db.commit()
        
        logger.info(f"❌ Подписка #{subscription_id} отклонена")
        
        return {"message": "Подписка отклонена", "status": "rejected"}
    except Exception as e:
        print(f"❌ Ошибка в reject_subscription: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/subscriptions/status/{following_id}")
async def get_subscription_status(
    following_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    try:
        subscription = db.query(Subscription).filter(
            Subscription.follower_id == current_user.id,
            Subscription.following_id == following_id
        ).first()
        
        return {"status": subscription.status if subscription else "none"}
    except Exception as e:
        print(f"❌ Ошибка в subscription_status: {e}")
        return {"status": "none"}


@router.get("/{user_id}/followers")
async def get_followers(
    user_id: int,
    db: Session = Depends(get_db)
):
    try:
        subscriptions = db.query(Subscription).filter(
            Subscription.following_id == user_id,
            Subscription.status == "approved"
        ).all()
        
        result = []
        for sub in subscriptions:
            follower = db.query(User).filter(User.id == sub.follower_id).first()
            if follower:
                result.append({
                    "id": follower.id,
                    "username": follower.username,
                    "name": follower.name
                })
        return result
    except Exception as e:
        print(f"❌ Ошибка в followers: {e}")
        return []


@router.get("/{user_id}/following")
async def get_following(
    user_id: int,
    db: Session = Depends(get_db)
):
    try:
        subscriptions = db.query(Subscription).filter(
            Subscription.follower_id == user_id,
            Subscription.status == "approved"
        ).all()
        
        result = []
        for sub in subscriptions:
            following = db.query(User).filter(User.id == sub.following_id).first()
            if following:
                result.append({
                    "id": following.id,
                    "username": following.username,
                    "name": following.name
                })
        return result
    except Exception as e:
        print(f"❌ Ошибка в following: {e}")
        return []


@router.get("/{user_id}/subscriptions")
async def get_user_subscriptions(
    user_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    try:
        if current_user.id != user_id:
            raise HTTPException(status_code=403, detail="Доступ запрещен")
            
        subscriptions = db.query(Subscription).filter(
            Subscription.follower_id == user_id
        ).all()
        
        result = []
        for sub in subscriptions:
            following = db.query(User).filter(User.id == sub.following_id).first()
            if following:
                result.append({
                    "id": sub.id,
                    "following_id": sub.following_id,
                    "following_username": following.username,
                    "following_name": following.name,
                    "status": sub.status,
                    "created_at": sub.created_at.isoformat() if sub.created_at else None
                })
        return result
    except Exception as e:
        print(f"❌ Ошибка в subscriptions: {e}")
        return []


# ===== ОБНОВЛЕНИЕ ПРОФИЛЯ =====
@router.put("/{user_id}", response_model=UserResponse)
async def update_user(
    user_id: int,
    user_update: UserUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    try:
        if current_user.id != user_id:
            raise HTTPException(status_code=403, detail="Нельзя редактировать чужой профиль")
        
        user = db.query(User).filter(User.id == user_id).first()
        if not user:
            raise HTTPException(status_code=404, detail="Пользователь не найден")
        
        if user_update.name is not None:
            if len(user_update.name.strip()) < 2:
                raise HTTPException(status_code=400, detail="Имя должно содержать минимум 2 символа")
            user.name = user_update.name.strip()
        
        if user_update.username is not None:
            username = user_update.username.strip()
            if len(username) < 3:
                raise HTTPException(status_code=400, detail="Username должен содержать минимум 3 символа")
            if not username.replace("_", "").isalnum():
                raise HTTPException(status_code=400, detail="Username может содержать только буквы, цифры и _")
            
            existing = db.query(User).filter(
                User.username == username,
                User.id != user_id
            ).first()
            if existing:
                raise HTTPException(status_code=400, detail="Username уже занят")
            user.username = username
        
        if user_update.email is not None:
            email = user_update.email.strip().lower()
            if "@" not in email or "." not in email:
                raise HTTPException(status_code=400, detail="Некорректный email")
            
            existing = db.query(User).filter(
                User.email == email,
                User.id != user_id
            ).first()
            if existing:
                raise HTTPException(status_code=400, detail="Email уже используется")
            user.email = email
        
        if user_update.password is not None:
            password = user_update.password
            if len(password) < 6:
                raise HTTPException(status_code=400, detail="Пароль должен содержать минимум 6 символов")
            if not validate_password(password):
                raise HTTPException(
                    status_code=400, 
                    detail="Пароль должен содержать минимум 8 символов, включая заглавную и строчную буквы, цифру и спецсимвол"
                )
            user.password = get_password_hash(password)
        
        db.commit()
        db.refresh(user)
        
        await invalidate_cache(f"user_profile:{user_id}")
        await invalidate_cache("users_list*")
        
        logger.info(f"✅ Профиль пользователя {user_id} обновлён")
        
        return UserResponse(
            id=user.id,
            username=user.username,
            name=user.name,
            email=user.email,
            role=user.role,
            registered=user.registered,
            languages=user.languages or [],
            topics_count=user.topics_count or 0,
            progress=user.progress or 0,
            is_online=user.is_online,
            last_activity=user.last_activity
        )
    except Exception as e:
        print(f"❌ Ошибка в update_user: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/{user_id}/toggle-ban")
async def toggle_ban_user(
    user_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    if current_user.role != 'admin':
        raise HTTPException(status_code=403, detail="Доступ запрещен")
    
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Пользователь не найден")
    
    if user.id == current_user.id:
        raise HTTPException(status_code=400, detail="Нельзя заблокировать самого себя")
    
    user.is_banned = not user.is_banned
    db.commit()
    db.refresh(user)
    
    await invalidate_cache(f"user_profile:{user_id}")
    await invalidate_cache("users_list*")
    
    return {
        "id": user.id,
        "is_banned": user.is_banned,
        "message": "Пользователь заблокирован" if user.is_banned else "Пользователь разблокирован"
    }


@router.delete("/{user_id}")
async def delete_user(
    user_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    if current_user.role != 'admin':
        raise HTTPException(status_code=403, detail="Доступ запрещен")
    
    if user_id == current_user.id:
        raise HTTPException(status_code=400, detail="Нельзя удалить самого себя")
    
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Пользователь не найден")
    
    if user.role == 'admin':
        admin_count = db.query(User).filter(User.role == 'admin').count()
        if admin_count <= 1:
            raise HTTPException(
                status_code=400, 
                detail="Нельзя удалить единственного администратора"
            )
    
    db.query(Subscription).filter(
        (Subscription.follower_id == user_id) | (Subscription.following_id == user_id)
    ).delete()
    
    db.query(Message).filter(Message.user_id == user_id).delete()
    
    db.query(Comment).filter(Comment.user_id == user_id).delete()
    
    db.delete(user)
    db.commit()
    
    await invalidate_cache(f"user_profile:{user_id}")
    await invalidate_cache("users_list*")
    
    return {"message": f"Пользователь {user.name} удалён успешно"}