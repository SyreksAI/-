# app/dependencies.py
import json
from typing import Optional

from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.jwt_auth import resolve_token_session
from app.models import User
from app.redis_client import get_redis_client, invalidate_cache
from app.roles import ADMIN_PANEL_ROLES, STAFF_ROLES, normalize_role, role_at_least
from app.session_store import get_user_id_from_token

security = HTTPBearer(auto_error=False)


async def _load_user_from_db(db: AsyncSession, user_id: int) -> User:
    user = (
        await db.execute(select(User).where(User.id == user_id, User.is_active == True))
    ).scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="Пользователь не найден")
    if user.is_banned:
        raise HTTPException(status_code=403, detail="Ваш аккаунт забанен")
    user.role = normalize_role(user.role)
    return user


async def _get_cached_role(user_id: int) -> Optional[str]:
    try:
        redis = await get_redis_client()
        cached = await redis.get(f"user_role:{user_id}")
        if cached:
            return normalize_role(json.loads(cached).get("role"))
    except Exception:
        pass
    return None


async def _set_cached_role(user_id: int, role: str) -> None:
    try:
        redis = await get_redis_client()
        await redis.setex(
            f"user_role:{user_id}",
            settings.ROLE_CACHE_SECONDS,
            json.dumps({"role": normalize_role(role)}),
        )
    except Exception:
        pass


async def invalidate_role_cache(user_id: int) -> None:
    await invalidate_cache(f"user_role:{user_id}")


async def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
    db: AsyncSession = Depends(get_db),
) -> User:
    if not credentials or not credentials.credentials:
        raise HTTPException(
            status_code=401,
            detail="Необходима аутентификация (отсутствует Bearer token)",
        )

    token = credentials.credentials
    user_id: int
    try:
        user_id, _sid = await resolve_token_session(token)
    except HTTPException:
        # Backward compatibility with legacy opaque session tokens in tests/tools.
        user_id = await get_user_id_from_token(token)

    cached_role = await _get_cached_role(user_id)
    user = await _load_user_from_db(db, user_id)

    if cached_role and cached_role != normalize_role(user.role):
        # Role changed — force reload path; DB is source of truth.
        await invalidate_role_cache(user_id)
        user = await _load_user_from_db(db, user_id)

    await _set_cached_role(user_id, user.role)
    return user


async def get_current_admin(current_user: User = Depends(get_current_user)) -> User:
    if normalize_role(current_user.role) not in STAFF_ROLES:
        raise HTTPException(
            status_code=403,
            detail="Доступ запрещен. Требуются права администратора.",
        )
    return current_user


async def current_admin(current_user: User = Depends(get_current_user)) -> User:
    """Admin panel access: admin and superadmin only."""
    if normalize_role(current_user.role) not in ADMIN_PANEL_ROLES:
        raise HTTPException(status_code=403, detail="Недостаточно прав")
    return current_user


def require_role(minimum_role: str):
    async def _checker(current_user: User = Depends(get_current_user)) -> User:
        if not role_at_least(current_user.role, minimum_role):
            raise HTTPException(status_code=403, detail="Недостаточно прав")
        return current_user

    return _checker


async def get_ws_current_user(token: str, db: AsyncSession) -> Optional[User]:
    try:
        user_id, _sid = await resolve_token_session(token)
    except HTTPException:
        try:
            user_id = await get_user_id_from_token(token)
        except HTTPException:
            return None

    user = (
        await db.execute(select(User).where(User.id == user_id, User.is_active == True))
    ).scalar_one_or_none()
    if not user or user.is_banned:
        return None
    user.role = normalize_role(user.role)
    return user
