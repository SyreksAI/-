# app/routes/settings.py
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import Dict, Any
import json

from app.database import get_db
from app.models import Settings, User
from app.dependencies import get_current_user
from app.redis_client import cache, invalidate_cache

router = APIRouter()


# app/routes/settings.py

@router.get("/")
@cache(ttl=300, key_prefix="site_settings")
async def get_settings(db: Session = Depends(get_db)):
    """Получить все настройки"""
    settings = db.query(Settings).all()
    result = {}
    for s in settings:
        try:
            result[s.key] = json.loads(s.value)
        except:
            result[s.key] = s.value
    return result


@router.put("/")
async def update_settings(
    settings_data: Dict[str, Any],
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Обновить настройки (только для админов)"""
    if current_user.role != 'admin':
        raise HTTPException(status_code=403, detail="Доступ запрещен")
    
    for key, value in settings_data.items():
        setting = db.query(Settings).filter(Settings.key == key).first()
        if setting:
            setting.value = json.dumps(value)
        else:
            setting = Settings(key=key, value=json.dumps(value))
            db.add(setting)
    
    db.commit()
    
    await invalidate_cache("site_settings*")
    
    return {"message": "Настройки сохранены"}


@router.post("/init")
def init_settings(db: Session = Depends(get_db)):
    """Инициализировать настройки по умолчанию"""
    default_settings = {
        "siteName": "ДубльПар.ru",
        "siteDescription": "Образовательный проект по РПО",
        "logoUrl": "/logo.png",
        "primaryColor": "#7c3aed",
        "theme": "light",
        "language": "ru",
        "registrationEnabled": True,
        "maintenanceMode": False,
        "enableComments": True,
        "enableProgressTracking": True,
        "emailNotifications": True,
        "newTopicsNotifications": True,
        "newUsersNotifications": True,
        "systemNotifications": True
    }
    
    for key, value in default_settings.items():
        existing = db.query(Settings).filter(Settings.key == key).first()
        if not existing:
            setting = Settings(key=key, value=json.dumps(value))
            db.add(setting)
    
    db.commit()
    return {"message": "Настройки инициализированы"}