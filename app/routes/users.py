from fastapi import APIRouter, Depends, HTTPException, Header
from sqlalchemy.orm import Session
from typing import List, Optional
from passlib.context import CryptContext
import logging
from ..database import get_db
from ..models import User, Subscription
from ..schemas import UserResponse, SubscriptionRequest, UserUpdate
from ..websocket_manager import send_notification
from ..config import settings

logger = logging.getLogger(__name__)

router = APIRouter()

# ===== ХЕШИРОВАНИЕ ПАРОЛЕЙ =====
pwd_context = CryptContext(schemes=['pbkdf2_sha256'], deprecated='auto')

def get_password_hash(password):
    return pwd_context.hash(password)

def validate_password(password: str) -> bool:
    """Проверка сложности пароля"""
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


# ===== GET ЭНДПОИНТЫ =====
@router.get("/", response_model=List[UserResponse])
async def get_all_users(db: Session = Depends(get_db)):
    """Получить всех пользователей"""
    return db.query(User).all()


@router.get("/search", response_model=List[UserResponse])
async def search_users(q: str, db: Session = Depends(get_db)):
    """Поиск пользователей по username"""
    return db.query(User).filter(User.username.ilike(f"%{q}%")).limit(20).all()


@router.get("/{user_id}", response_model=UserResponse)
async def get_user(user_id: int, db: Session = Depends(get_db)):
    """Получить пользователя по ID"""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user


# ===== ПОДПИСКИ =====
@router.get("/{user_id}/pending-subscriptions")
async def get_pending_subscriptions(
    user_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Получить ожидающие запросы на подписку"""
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


@router.post("/subscribe")
async def subscribe(
    request: SubscriptionRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Отправить запрос на подписку"""
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


@router.put("/subscriptions/{subscription_id}/approve")
async def approve_subscription(
    subscription_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Одобрить запрос на подписку"""
    subscription = db.query(Subscription).filter(Subscription.id == subscription_id).first()
    if not subscription:
        raise HTTPException(status_code=404, detail="Подписка не найдена")
    
    if subscription.following_id != current_user.id:
        raise HTTPException(status_code=403, detail="Нет прав для одобрения этой подписки")
    
    subscription.status = "approved"
    
    # Создаём обратную подписку
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


@router.put("/subscriptions/{subscription_id}/reject")
async def reject_subscription(
    subscription_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Отклонить запрос на подписку"""
    subscription = db.query(Subscription).filter(Subscription.id == subscription_id).first()
    if not subscription or subscription.following_id != current_user.id:
        raise HTTPException(status_code=403, detail="Нет прав для отклонения")
    
    subscription.status = "rejected"
    db.commit()
    
    logger.info(f"❌ Подписка #{subscription_id} отклонена")
    
    return {"message": "Подписка отклонена", "status": "rejected"}


@router.get("/subscriptions/status/{following_id}")
async def get_subscription_status(
    following_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Получить статус подписки на пользователя"""
    subscription = db.query(Subscription).filter(
        Subscription.follower_id == current_user.id,
        Subscription.following_id == following_id
    ).first()
    
    return {"status": subscription.status if subscription else "none"}


@router.get("/{user_id}/followers")
async def get_followers(
    user_id: int,
    db: Session = Depends(get_db)
):
    """Получить подписчиков пользователя"""
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


@router.get("/{user_id}/following")
async def get_following(
    user_id: int,
    db: Session = Depends(get_db)
):
    """Получить подписки пользователя"""
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


@router.get("/{user_id}/subscriptions")
async def get_user_subscriptions(
    user_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Получить все подписки пользователя (с статусами)"""
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


# ===== ОБНОВЛЕНИЕ ПРОФИЛЯ =====
@router.put("/{user_id}", response_model=UserResponse)
async def update_user(
    user_id: int,
    user_update: UserUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Обновление профиля пользователя.
    Только владелец профиля может его редактировать.
    """
    
    # Проверяем, что пользователь редактирует свой профиль
    if current_user.id != user_id:
        raise HTTPException(status_code=403, detail="Нельзя редактировать чужой профиль")
    
    # Находим пользователя в БД
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Пользователь не найден")
    
    # Обновляем имя
    if user_update.name is not None:
        if len(user_update.name.strip()) < 2:
            raise HTTPException(status_code=400, detail="Имя должно содержать минимум 2 символа")
        user.name = user_update.name.strip()
    
    # Обновляем username
    if user_update.username is not None:
        username = user_update.username.strip()
        
        # Валидация username
        if len(username) < 3:
            raise HTTPException(status_code=400, detail="Username должен содержать минимум 3 символа")
        if not username.replace("_", "").isalnum():
            raise HTTPException(status_code=400, detail="Username может содержать только буквы, цифры и _")
        
        # Проверяем уникальность username
        existing = db.query(User).filter(
            User.username == username,
            User.id != user_id
        ).first()
        if existing:
            raise HTTPException(status_code=400, detail="Username уже занят")
        
        user.username = username
    
    # Обновляем email
    if user_update.email is not None:
        email = user_update.email.strip().lower()
        
        # Простая валидация email
        if "@" not in email or "." not in email:
            raise HTTPException(status_code=400, detail="Некорректный email")
        
        # Проверяем уникальность email
        existing = db.query(User).filter(
            User.email == email,
            User.id != user_id
        ).first()
        if existing:
            raise HTTPException(status_code=400, detail="Email уже используется")
        
        user.email = email
    
    # Обновляем пароль (если передан)
    if user_update.password is not None:
        password = user_update.password
        
        if len(password) < 6:
            raise HTTPException(status_code=400, detail="Пароль должен содержать минимум 6 символов")
        
        # ✅ Проверка сложности пароля
        if not validate_password(password):
            raise HTTPException(
                status_code=400, 
                detail="Пароль должен содержать минимум 8 символов, включая заглавную и строчную буквы, цифру и спецсимвол"
            )
        
        user.password = get_password_hash(password)
    
    # Сохраняем изменения
    db.commit()
    db.refresh(user)
    
    logger.info(f"✅ Профиль пользователя {user_id} обновлён")
    
    # Возвращаем обновленного пользователя
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
        is_online=user.is_online
    )