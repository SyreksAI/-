from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel
from typing import Optional
from datetime import datetime

from app.database import get_db
from app.models import SupportRequest, User
from app.dependencies import get_current_user

router = APIRouter()

class SupportRequestCreate(BaseModel):
    name: str
    email: str
    subject: str
    message: str
    user_id: Optional[int] = None

class SupportRequestUpdate(BaseModel):
    status: str  # new, in_progress, resolved, closed
    admin_comment: Optional[str] = None

# ===== ПОЛЬЗОВАТЕЛЬСКАЯ ЧАСТЬ =====
@router.post("/")
async def create_support_request(
    request: SupportRequestCreate,
    db: AsyncSession = Depends(get_db)
):
    """Создать обращение в поддержку (доступно всем)"""
    new_request = SupportRequest(
        name=request.name,
        email=request.email,
        subject=request.subject,
        message=request.message,
        user_id=request.user_id,
        status="new"
    )
    db.add(new_request)
    await db.commit()
    await db.refresh(new_request)
    
    return {
        "id": new_request.id,
        "message": "Ваше обращение отправлено. Мы ответим вам в ближайшее время!"
    }

# ===== АДМИНСКАЯ ЧАСТЬ =====
@router.get("/")
async def get_support_requests(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    status: Optional[str] = None,
    skip: int = 0,
    limit: int = 100
):
    """Получить все обращения в поддержку (только для админов)"""
    if current_user.role not in ['admin', 'moderator']:
        raise HTTPException(status_code=403, detail="Доступ запрещен")
    
    stmt = select(SupportRequest)
    if status:
        stmt = stmt.where(SupportRequest.status == status)
    
    return (
        await db.execute(
            stmt.order_by(SupportRequest.created_at.desc()).offset(skip).limit(limit)
        )
    ).scalars().all()

@router.get("/{request_id}")
async def get_support_request(
    request_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Получить конкретное обращение"""
    if current_user.role not in ['admin', 'moderator']:
        raise HTTPException(status_code=403, detail="Доступ запрещен")
    
    request = (
        await db.execute(select(SupportRequest).where(SupportRequest.id == request_id))
    ).scalar_one_or_none()
    if not request:
        raise HTTPException(status_code=404, detail="Обращение не найдено")
    
    return request

@router.put("/{request_id}")
async def update_support_request(
    request_id: int,
    update: SupportRequestUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Обновить статус обращения (только для админов)"""
    if current_user.role not in ['admin', 'moderator']:
        raise HTTPException(status_code=403, detail="Доступ запрещен")
    
    request = (
        await db.execute(select(SupportRequest).where(SupportRequest.id == request_id))
    ).scalar_one_or_none()
    if not request:
        raise HTTPException(status_code=404, detail="Обращение не найдено")
    
    request.status = update.status
    request.updated_at = datetime.now()
    
    await db.commit()
    await db.refresh(request)
    
    return {"message": f"Статус обновлён на {update.status}"}

@router.delete("/{request_id}")
async def delete_support_request(
    request_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Удалить обращение (только для админов)"""
    if current_user.role not in ['admin', 'moderator']:
        raise HTTPException(status_code=403, detail="Доступ запрещен")
    
    request = (
        await db.execute(select(SupportRequest).where(SupportRequest.id == request_id))
    ).scalar_one_or_none()
    if not request:
        raise HTTPException(status_code=404, detail="Обращение не найдено")
    
    await db.delete(request)
    await db.commit()
    
    return {"message": "Обращение удалено"}
