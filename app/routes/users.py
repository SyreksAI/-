# app/routes/users.py
from fastapi import APIRouter, Depends, HTTPException, Header, Request
from sqlalchemy import func, or_, select, delete
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List, Optional
import logging
from datetime import datetime, timedelta

from app.database import get_db
from app.models import User, Subscription, Message, Comment
from app.schemas import UserResponse, UserPublicResponse, SubscriptionRequest, UserUpdate
from app.websocket_manager import send_notification
from app.config import settings
from app.redis_client import cache, invalidate_cache
from app.dependencies import get_current_user, get_current_admin
from app.routes.auth import build_user_response
from app.password_utils import hash_password

logger = logging.getLogger(__name__)

router = APIRouter()


async def _users_by_ids(db: AsyncSession, user_ids: list[int]) -> dict[int, User]:
    if not user_ids:
        return {}
    rows = (
        await db.execute(select(User).where(User.id.in_(user_ids)))
    ).scalars().all()
    return {user.id: user for user in rows}


@router.post("/ping")
async def ping_user(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    current_user.last_activity = datetime.now()
    current_user.is_online = True
    await db.commit()
    return {
        "status": "ok",
        "last_activity": current_user.last_activity.isoformat(),
    }


@router.get("/", response_model=List[UserPublicResponse])
@cache(ttl=30, key_prefix="users_list")
async def get_all_users(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    users = (await db.execute(select(User))).scalars().all()
    return [
        UserPublicResponse(
            id=user.id,
            username=user.username,
            name=user.name,
            role=user.role,
            progress=user.progress or 0,
            is_online=user.is_online,
        )
        for user in users
    ]


@router.get("/search", response_model=List[UserPublicResponse])
async def search_users(
    q: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    query = q.strip()
    if len(query) < 2:
        return []

    pattern = f"%{query}%"
    users = (
        await db.execute(
            select(User)
            .where(
                User.is_active == True,
                or_(User.username.ilike(pattern), User.name.ilike(pattern)),
            )
            .order_by(User.username.asc())
            .limit(20)
        )
    ).scalars().all()
    return [
        UserPublicResponse(
            id=user.id,
            username=user.username,
            name=user.name,
            role=user.role,
            progress=user.progress or 0,
            is_online=user.is_online,
        )
        for user in users
        if user.id != current_user.id
    ]


@router.get("/{user_id}", response_model=UserResponse)
async def get_user(
    user_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    user = (
        await db.execute(select(User).where(User.id == user_id))
    ).scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if current_user.id != user_id and current_user.role not in ["admin", "moderator"]:
        return build_user_response(user, hide_email=True, hide_ban=True)
    return build_user_response(user)


@router.get("/{user_id}/pending-subscriptions")
async def get_pending_subscriptions(
    user_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    try:
        if current_user.id != user_id:
            raise HTTPException(status_code=403, detail="Доступ запрещен")
            
        subscriptions = (
            await db.execute(
                select(Subscription).where(
                    Subscription.following_id == user_id,
                    Subscription.status == "pending"
                )
            )
        ).scalars().all()
        
        followers = await _users_by_ids(db, [sub.follower_id for sub in subscriptions])
        result = []
        for sub in subscriptions:
            follower = followers.get(sub.follower_id)
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
    db: AsyncSession = Depends(get_db)
):
    try:
        if current_user.id == request.following_id:
            raise HTTPException(status_code=400, detail="Нельзя подписаться на себя")
        
        following = (
            await db.execute(select(User).where(User.id == request.following_id))
        ).scalar_one_or_none()
        if not following:
            raise HTTPException(status_code=404, detail="User not found")
        
        existing = (
            await db.execute(
                select(Subscription).where(
                    Subscription.follower_id == current_user.id,
                    Subscription.following_id == request.following_id
                )
            )
        ).scalar_one_or_none()
        
        if existing:
            if existing.status == "pending":
                raise HTTPException(status_code=400, detail="Запрос уже отправлен")
            elif existing.status == "approved":
                raise HTTPException(status_code=400, detail="Вы уже подписаны")
            elif existing.status == "rejected":
                existing.status = "pending"
                await db.commit()
                await db.refresh(existing)
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
        await db.commit()
        await db.refresh(subscription)
        
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
    db: AsyncSession = Depends(get_db)
):
    try:
        subscription = (
            await db.execute(select(Subscription).where(Subscription.id == subscription_id))
        ).scalar_one_or_none()
        if not subscription:
            raise HTTPException(status_code=404, detail="Подписка не найдена")
        
        if subscription.following_id != current_user.id:
            raise HTTPException(status_code=403, detail="Нет прав для одобрения этой подписки")
        
        subscription.status = "approved"
        
        reverse_sub = (
            await db.execute(
                select(Subscription).where(
                    Subscription.follower_id == current_user.id,
                    Subscription.following_id == subscription.follower_id
                )
            )
        ).scalar_one_or_none()
        
        if not reverse_sub:
            reverse_sub = Subscription(
                follower_id=current_user.id,
                following_id=subscription.follower_id,
                status="approved"
            )
            db.add(reverse_sub)
        else:
            reverse_sub.status = "approved"
            
        await db.commit()
        
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
    db: AsyncSession = Depends(get_db)
):
    try:
        subscription = (
            await db.execute(select(Subscription).where(Subscription.id == subscription_id))
        ).scalar_one_or_none()
        if not subscription or subscription.following_id != current_user.id:
            raise HTTPException(status_code=403, detail="Нет прав для отклонения")
        
        subscription.status = "rejected"
        await db.commit()
        
        logger.info(f"❌ Подписка #{subscription_id} отклонена")
        
        return {"message": "Подписка отклонена", "status": "rejected"}
    except Exception as e:
        print(f"❌ Ошибка в reject_subscription: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/subscriptions/status/{following_id}")
async def get_subscription_status(
    following_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    try:
        subscription = (
            await db.execute(
                select(Subscription).where(
                    Subscription.follower_id == current_user.id,
                    Subscription.following_id == following_id
                )
            )
        ).scalar_one_or_none()
        
        return {"status": subscription.status if subscription else "none"}
    except Exception as e:
        print(f"❌ Ошибка в subscription_status: {e}")
        return {"status": "none"}


@router.get("/{user_id}/followers")
async def get_followers(
    user_id: int,
    db: AsyncSession = Depends(get_db)
):
    try:
        subscriptions = (
            await db.execute(
                select(Subscription).where(
                    Subscription.following_id == user_id,
                    Subscription.status == "approved"
                )
            )
        ).scalars().all()
        
        followers = await _users_by_ids(db, [sub.follower_id for sub in subscriptions])
        return [
            {
                "id": follower.id,
                "username": follower.username,
                "name": follower.name,
            }
            for sub in subscriptions
            if (follower := followers.get(sub.follower_id))
        ]
    except Exception as e:
        print(f"❌ Ошибка в followers: {e}")
        return []


@router.get("/{user_id}/following")
async def get_following(
    user_id: int,
    db: AsyncSession = Depends(get_db)
):
    try:
        subscriptions = (
            await db.execute(
                select(Subscription).where(
                    Subscription.follower_id == user_id,
                    Subscription.status == "approved"
                )
            )
        ).scalars().all()
        
        following_users = await _users_by_ids(db, [sub.following_id for sub in subscriptions])
        return [
            {
                "id": following.id,
                "username": following.username,
                "name": following.name,
            }
            for sub in subscriptions
            if (following := following_users.get(sub.following_id))
        ]
    except Exception as e:
        print(f"❌ Ошибка в following: {e}")
        return []


@router.get("/{user_id}/subscriptions")
async def get_user_subscriptions(
    user_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    try:
        if current_user.id != user_id:
            raise HTTPException(status_code=403, detail="Доступ запрещен")
            
        subscriptions = (
            await db.execute(
                select(Subscription).where(Subscription.follower_id == user_id)
            )
        ).scalars().all()
        
        following_users = await _users_by_ids(db, [sub.following_id for sub in subscriptions])
        result = []
        for sub in subscriptions:
            following = following_users.get(sub.following_id)
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


@router.put("/{user_id}", response_model=UserResponse)
async def update_user(
    user_id: int,
    user_update: UserUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    try:
        from app.roles import ADMIN_PANEL_ROLES, normalize_role

        is_admin = normalize_role(current_user.role) in ADMIN_PANEL_ROLES
        if current_user.id != user_id and not is_admin:
            raise HTTPException(status_code=403, detail="Нельзя редактировать чужой профиль")
        
        user = (
            await db.execute(select(User).where(User.id == user_id))
        ).scalar_one_or_none()
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
            
            existing = (
                await db.execute(
                    select(User).where(User.username == username, User.id != user_id)
                )
            ).scalar_one_or_none()
            if existing:
                raise HTTPException(status_code=400, detail="Username уже занят")
            user.username = username
        
        if user_update.email is not None:
            email = user_update.email.strip().lower()
            if "@" not in email or "." not in email:
                raise HTTPException(status_code=400, detail="Некорректный email")
            
            existing = (
                await db.execute(
                    select(User).where(User.email == email, User.id != user_id)
                )
            ).scalar_one_or_none()
            if existing:
                raise HTTPException(status_code=400, detail="Email уже используется")
            user.email = email
        
        if user_update.password is not None:
            user.password = hash_password(user_update.password)

        if user_update.role is not None or user_update.is_banned is not None or user_update.is_active is not None:
            raise HTTPException(
                status_code=403,
                detail="Изменение роли и статуса доступно только через /api/admin",
            )

        await db.commit()
        await db.refresh(user)
        
        await invalidate_cache(f"user_profile:{user_id}")
        await invalidate_cache("users_list*")
        
        logger.info(f"✅ Профиль пользователя {user_id} обновлён")
        
        return build_user_response(user)
    except HTTPException:
        raise
    except Exception as e:
        print(f"❌ Ошибка в update_user: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/{user_id}/toggle-ban")
async def toggle_ban_user(
    user_id: int,
    current_user: User = Depends(get_current_user),
):
    raise HTTPException(
        status_code=403,
        detail="Блокировка пользователей доступна только через /api/admin",
    )


@router.delete("/{user_id}")
async def delete_user(
    user_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    if current_user.role != 'admin':
        raise HTTPException(status_code=403, detail="Доступ запрещен")
    
    if user_id == current_user.id:
        raise HTTPException(status_code=400, detail="Нельзя удалить самого себя")
    
    user = (
        await db.execute(select(User).where(User.id == user_id))
    ).scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="Пользователь не найден")
    
    if user.role == 'admin':
        admin_count = (
            await db.execute(
                select(func.count()).select_from(User).where(User.role == 'admin')
            )
        ).scalar()
        if admin_count <= 1:
            raise HTTPException(
                status_code=400, 
                detail="Нельзя удалить единственного администратора"
            )
    
    await db.execute(
        delete(Subscription).where(
            (Subscription.follower_id == user_id) | (Subscription.following_id == user_id)
        )
    )
    
    await db.execute(delete(Message).where(Message.user_id == user_id))
    
    await db.execute(delete(Comment).where(Comment.user_id == user_id))
    
    await db.delete(user)
    await db.commit()
    
    await invalidate_cache(f"user_profile:{user_id}")
    await invalidate_cache(f"user:{user_id}")
    await invalidate_cache("users_list*")
    
    return {"message": f"Пользователь {user.name} удалён успешно"}
