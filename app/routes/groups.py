from fastapi import APIRouter, Depends, HTTPException, Header
from sqlalchemy.orm import Session
from typing import Optional, List
import time
from ..database import get_db
from ..models import Group, User
from ..schemas import GroupCreate, GroupResponse
from ..websocket_manager import send_notification

router = APIRouter()


async def get_current_user(
    x_user_id: Optional[int] = Header(None, alias="X-User-ID"),
    db: Session = Depends(get_db)
) -> User:
    if not x_user_id:
        raise HTTPException(status_code=401, detail="Необходима аутентификация")
    
    user = db.query(User).filter(User.id == x_user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Пользователь не найден")
    return user


@router.get("/search")
async def search_groups(
    q: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Поиск групп по названию"""
    
    all_groups = db.query(Group).filter(
        Group.name.ilike(f"%{q}%")
    ).limit(50).all()
    
    groups = [g for g in all_groups if current_user.id in g.members]
    
    return [
        {
            "id": g.id,
            "name": g.name,
            "creatorId": g.creator_id,
            "members": g.members,
            "isGroup": True,
            "memberCount": len(g.members)
        }
        for g in groups
    ]


@router.post("/create", response_model=GroupResponse)
async def create_group(
    group_data: GroupCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    if not group_data.name.strip():
        raise HTTPException(status_code=400, detail="Название группы не может быть пустым")
    
    if len(group_data.member_ids) == 0:
        raise HTTPException(status_code=400, detail="Выберите хотя бы одного участника")

    group_id = f"group_{int(time.time() * 1000)}"
    members = list(set([current_user.id] + group_data.member_ids))

    new_group = Group(
        id=group_id,
        name=group_data.name.strip(),
        creator_id=current_user.id,
        members=members
    )
    
    db.add(new_group)
    db.commit()
    db.refresh(new_group)

    group_response = {
        "id": new_group.id,
        "name": new_group.name,
        "creatorId": new_group.creator_id,
        "members": new_group.members,
        "isGroup": True
    }

    for member_id in members:
        if member_id == current_user.id:
            continue
            
        await send_notification(
            user_id=member_id,
            notification_type="group_added",
            data={
                "group": group_response,
                "added_by": current_user.name,
                "added_by_id": current_user.id
            }
        )

    return group_response


@router.post("/{group_id}/add-member")
async def add_member(
    group_id: str,
    user_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    group = db.query(Group).filter(Group.id == group_id).first()
    if not group:
        raise HTTPException(status_code=404, detail="Группа не найдена")
    
    if group.creator_id != current_user.id:
        raise HTTPException(status_code=403, detail="Только создатель может добавлять участников")
    
    if user_id in group.members:
        raise HTTPException(status_code=400, detail="Пользователь уже в группе")
    
    group.members.append(user_id)
    db.commit()
    db.refresh(group)
    
    group_response = {
        "id": group.id,
        "name": group.name,
        "creatorId": group.creator_id,
        "members": group.members,
        "isGroup": True
    }
    
    await send_notification(
        user_id=user_id,
        notification_type="group_added",
        data={
            "group": group_response,
            "added_by": current_user.name,
            "added_by_id": current_user.id
        }
    )
    
    return {"message": "Участник добавлен", "members": group.members}


@router.get("/user/{user_id}")
async def get_user_groups(
    user_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    if current_user.id != user_id:
        raise HTTPException(status_code=403, detail="Доступ запрещен")
    
    all_groups = db.query(Group).all()
    groups = [g for g in all_groups if user_id in g.members]
    
    return [
        {
            "id": g.id,
            "name": g.name,
            "creatorId": g.creator_id,
            "members": g.members,
            "isGroup": True
        }
        for g in groups
    ]


@router.get("/{group_id}")
async def get_group(
    group_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    group = db.query(Group).filter(Group.id == group_id).first()
    if not group:
        raise HTTPException(status_code=404, detail="Группа не найдена")
    
    if current_user.id not in group.members:
        raise HTTPException(status_code=403, detail="Вы не состоите в этой группе")
    
    return {
        "id": group.id,
        "name": group.name,
        "creatorId": group.creator_id,
        "members": group.members,
        "isGroup": True
    }


# ===== УДАЛЕНИЕ ГРУППЫ (только создатель) =====
@router.delete("/{group_id}")
async def delete_group(
    group_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Удалить группу (только создатель)"""
    
    group = db.query(Group).filter(Group.id == group_id).first()
    if not group:
        raise HTTPException(status_code=404, detail="Группа не найдена")
    
    if group.creator_id != current_user.id:
        raise HTTPException(status_code=403, detail="Только создатель может удалить группу")
    
    db.delete(group)
    db.commit()
    
    return {"message": "Группа удалена"}


# ===== ВЫХОД ИЗ ГРУППЫ (участник) =====
@router.delete("/{group_id}/remove-member")
async def remove_member(
    group_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Выйти из группы (участник)"""
    
    group = db.query(Group).filter(Group.id == group_id).first()
    if not group:
        raise HTTPException(status_code=404, detail="Группа не найдена")
    
    if current_user.id not in group.members:
        raise HTTPException(status_code=400, detail="Вы не состоите в этой группе")
    
    if current_user.id == group.creator_id:
        raise HTTPException(status_code=400, detail="Создатель не может выйти из группы, только удалить её")
    
    group.members.remove(current_user.id)
    db.commit()
    db.refresh(group)
    
    return {"message": "Вы вышли из группы", "members": group.members}