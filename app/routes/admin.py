# app/routes/admin.py
from __future__ import annotations

from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.admin_audit import admin_audit_log
from app.database import get_db
from app.dependencies import current_admin, invalidate_role_cache
from app.jwt_auth import invalidate_user_sessions
from app.models import AdminLog, User
from app.redis_client import invalidate_cache
from app.roles import Role, normalize_role
from app.routes.auth import build_user_response
from app.schemas import AdminAuditListResponse, AdminRoleUpdate, AdminStatsResponse, AdminUserListResponse

router = APIRouter()


def _can_change_role(actor: User, target: User, new_role: str) -> None:
    actor_role = normalize_role(actor.role)
    target_role = normalize_role(target.role)
    new_role = normalize_role(new_role)

    if target_role == Role.SUPERADMIN.value and actor_role != Role.SUPERADMIN.value:
        raise HTTPException(status_code=403, detail="Нельзя изменить роль superadmin")

    if target_role == Role.SUPERADMIN.value and new_role != Role.SUPERADMIN.value:
        raise HTTPException(status_code=403, detail="superadmin нельзя разжаловать через API")

    if actor.id == target.id and new_role != actor_role:
        raise HTTPException(status_code=403, detail="Нельзя изменить собственную роль")

    allowed_roles = {Role.USER.value, Role.MODERATOR.value, Role.ADMIN.value, Role.SUPERADMIN.value}
    if new_role not in allowed_roles:
        raise HTTPException(status_code=400, detail="Недопустимая роль")

    if actor_role == Role.ADMIN.value and new_role == Role.SUPERADMIN.value:
        raise HTTPException(status_code=403, detail="Только superadmin может назначать superadmin")


@router.get("/users", response_model=AdminUserListResponse)
async def list_admin_users(
    query: str = Query("", alias="query"),
    role: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    admin: User = Depends(current_admin),
    db: AsyncSession = Depends(get_db),
):
    filters = []
    q = query.strip()
    if q:
        pattern = f"%{q}%"
        filters.append(
            or_(User.username.ilike(pattern), User.name.ilike(pattern), User.email.ilike(pattern))
        )
    if role:
        filters.append(User.role == normalize_role(role))

    base = select(User)
    if filters:
        base = base.where(*filters)

    total = (await db.execute(select(func.count()).select_from(base.subquery()))).scalar() or 0
    offset = (page - 1) * page_size
    users = (
        await db.execute(base.order_by(User.id.desc()).offset(offset).limit(page_size))
    ).scalars().all()

    return AdminUserListResponse(
        items=[build_user_response(u) for u in users],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.patch("/users/{user_id}/role")
async def change_user_role(
    user_id: int,
    body: AdminRoleUpdate,
    request: Request,
    admin: User = Depends(current_admin),
    db: AsyncSession = Depends(get_db),
):
    target = (await db.execute(select(User).where(User.id == user_id))).scalar_one_or_none()
    if not target:
        raise HTTPException(status_code=404, detail="Пользователь не найден")

    new_role = normalize_role(body.role)
    _can_change_role(admin, target, new_role)

    old_role = normalize_role(target.role)
    target.role = new_role
    await db.commit()
    await db.refresh(target)

    await invalidate_role_cache(user_id)
    await invalidate_cache(f"user:{user_id}")
    await invalidate_user_sessions(user_id)

    await admin_audit_log(
        db,
        admin_id=admin.id,
        action="user.role_change",
        target_type="user",
        target_id=user_id,
        payload={"old_role": old_role, "new_role": new_role},
        request=request,
    )

    return {"message": "Роль обновлена", "user": build_user_response(target)}


@router.post("/users/{user_id}/ban")
async def ban_user(
    user_id: int,
    request: Request,
    admin: User = Depends(current_admin),
    db: AsyncSession = Depends(get_db),
):
    target = (await db.execute(select(User).where(User.id == user_id))).scalar_one_or_none()
    if not target:
        raise HTTPException(status_code=404, detail="Пользователь не найден")
    if target.id == admin.id:
        raise HTTPException(status_code=400, detail="Нельзя заблокировать самого себя")
    if normalize_role(target.role) == Role.SUPERADMIN.value:
        raise HTTPException(status_code=403, detail="Нельзя заблокировать superadmin")

    target.is_banned = True
    await db.commit()

    await invalidate_role_cache(user_id)
    await invalidate_cache(f"user:{user_id}")
    await invalidate_user_sessions(user_id)

    await admin_audit_log(
        db,
        admin_id=admin.id,
        action="user.ban",
        target_type="user",
        target_id=user_id,
        request=request,
    )
    return {"message": "Пользователь заблокирован", "is_banned": True}


@router.post("/users/{user_id}/unban")
async def unban_user(
    user_id: int,
    request: Request,
    admin: User = Depends(current_admin),
    db: AsyncSession = Depends(get_db),
):
    target = (await db.execute(select(User).where(User.id == user_id))).scalar_one_or_none()
    if not target:
        raise HTTPException(status_code=404, detail="Пользователь не найден")

    target.is_banned = False
    await db.commit()
    await invalidate_cache(f"user:{user_id}")

    await admin_audit_log(
        db,
        admin_id=admin.id,
        action="user.unban",
        target_type="user",
        target_id=user_id,
        request=request,
    )
    return {"message": "Пользователь разблокирован", "is_banned": False}


@router.post("/users/{user_id}/reset-sessions")
async def reset_user_sessions(
    user_id: int,
    request: Request,
    admin: User = Depends(current_admin),
    db: AsyncSession = Depends(get_db),
):
    target = (await db.execute(select(User).where(User.id == user_id))).scalar_one_or_none()
    if not target:
        raise HTTPException(status_code=404, detail="Пользователь не найден")

    await invalidate_user_sessions(user_id)
    await admin_audit_log(
        db,
        admin_id=admin.id,
        action="user.reset_sessions",
        target_type="user",
        target_id=user_id,
        request=request,
    )
    return {"message": "Сессии пользователя сброшены"}


@router.get("/audit", response_model=AdminAuditListResponse)
async def list_audit_logs(
    admin_id: Optional[int] = Query(None),
    action: Optional[str] = Query(None),
    from_date: Optional[datetime] = Query(None, alias="from"),
    to_date: Optional[datetime] = Query(None, alias="to"),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    admin: User = Depends(current_admin),
    db: AsyncSession = Depends(get_db),
):
    query = select(AdminLog, User.name).join(User, User.id == AdminLog.admin_id)
    if admin_id is not None:
        query = query.where(AdminLog.admin_id == admin_id)
    if action:
        query = query.where(AdminLog.action == action)
    if from_date:
        query = query.where(AdminLog.created_at >= from_date)
    if to_date:
        query = query.where(AdminLog.created_at <= to_date)

    count_q = select(func.count()).select_from(query.subquery())
    total = (await db.execute(count_q)).scalar() or 0
    offset = (page - 1) * page_size
    rows = (
        await db.execute(query.order_by(AdminLog.created_at.desc()).offset(offset).limit(page_size))
    ).all()

    items = []
    for log, admin_name in rows:
        items.append(
            {
                "id": log.id,
                "admin_id": log.admin_id,
                "admin_name": admin_name,
                "action": log.action,
                "target_type": log.target_type,
                "target_id": log.target_id,
                "payload": log.details or {},
                "created_at": log.created_at,
            }
        )

    return AdminAuditListResponse(items=items, total=total, page=page, page_size=page_size)


@router.get("/stats", response_model=AdminStatsResponse)
async def admin_stats(
    admin: User = Depends(current_admin),
    db: AsyncSession = Depends(get_db),
):
    total_users = (await db.execute(select(func.count()).select_from(User))).scalar() or 0
    banned_users = (
        await db.execute(select(func.count()).select_from(User).where(User.is_banned == True))
    ).scalar() or 0
    online_users = (
        await db.execute(select(func.count()).select_from(User).where(User.is_online == True))
    ).scalar() or 0
    by_role = {}
    for role_value in (Role.USER.value, Role.MODERATOR.value, Role.ADMIN.value, Role.SUPERADMIN.value):
        count = (
            await db.execute(select(func.count()).select_from(User).where(User.role == role_value))
        ).scalar() or 0
        by_role[role_value] = count

    return AdminStatsResponse(
        total_users=total_users,
        banned_users=banned_users,
        online_users=online_users,
        users_by_role=by_role,
    )
