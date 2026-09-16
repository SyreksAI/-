# app/routes/settings.py
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Dict, Any
import json

from app.config import settings as app_settings
from app.database import get_db
from app.models import Settings, User
from app.dependencies import get_current_admin, get_current_user
from app.redis_client import cache, invalidate_cache
from app.site_settings import get_setting, is_maintenance_mode, is_registration_enabled

router = APIRouter()


def _parse_setting_value(raw_value):
    try:
        return json.loads(raw_value)
    except (json.JSONDecodeError, TypeError):
        return raw_value


def _as_bool(value, default=False):
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        return value.strip().lower() in {"true", "1", "yes"}
    return default


@router.get("/public")
@cache(ttl=60, key_prefix="site_settings_public")
async def get_public_settings(db: AsyncSession = Depends(get_db)):
    """Публичные настройки и юридическая информация для фронтенда."""
    public_keys = ("siteName", "siteDescription", "registrationEnabled", "maintenanceMode")
    rows = (
        await db.execute(select(Settings).where(Settings.key.in_(public_keys)))
    ).scalars().all()
    stored = {row.key: _parse_setting_value(row.value) for row in rows}

    return {
        "siteName": stored.get("siteName", app_settings.LEGAL_PLATFORM_NAME),
        "siteDescription": stored.get("siteDescription", "Образовательный проект по РПО"),
        "registrationEnabled": _as_bool(stored.get("registrationEnabled"), True),
        "maintenanceMode": _as_bool(stored.get("maintenanceMode"), False),
        "turnstileSiteKey": app_settings.TURNSTILE_SITE_KEY or "",
        "turnstileRequired": app_settings.turnstile_required,
        "yandexOAuthEnabled": app_settings.yandex_oauth_enabled,
        "legal": {
            "operatorName": app_settings.LEGAL_OPERATOR_NAME,
            "platformName": app_settings.LEGAL_PLATFORM_NAME,
            "siteUrl": app_settings.LEGAL_SITE_URL,
            "privacyEmail": app_settings.LEGAL_PRIVACY_EMAIL,
            "supportEmail": app_settings.LEGAL_SUPPORT_EMAIL,
            "docsVersion": app_settings.LEGAL_DOCS_VERSION,
            "inn": app_settings.LEGAL_INN or "",
            "ogrn": app_settings.LEGAL_OGRN or "",
            "legalAddress": app_settings.LEGAL_ADDRESS or "",
            "phone": app_settings.LEGAL_PHONE or "",
            "roskomnadzorNumber": app_settings.LEGAL_ROSKOMNADZOR_NUMBER or "",
        },
    }


@router.get("/")
@cache(ttl=300, key_prefix="site_settings")
async def get_settings(db: AsyncSession = Depends(get_db)):
    """Получить все настройки"""
    settings = (await db.execute(select(Settings))).scalars().all()
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
    _: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """Обновить настройки (admin/superadmin)."""
    for key, value in settings_data.items():
        setting = (
            await db.execute(select(Settings).where(Settings.key == key))
        ).scalar_one_or_none()
        if setting:
            setting.value = json.dumps(value)
        else:
            setting = Settings(key=key, value=json.dumps(value))
            db.add(setting)
    
    await db.commit()
    
    await invalidate_cache("site_settings*")
    await invalidate_cache("site_settings_public*")
    from app.site_settings import invalidate_maintenance_cache
    await invalidate_maintenance_cache()

    return {"message": "Настройки сохранены"}


@router.post("/init")
async def init_settings(
    db: AsyncSession = Depends(get_db),
    _: object = Depends(get_current_admin),
):
    """Инициализировать настройки по умолчанию"""
    default_settings = {
        "siteName": "дубльпар.online",
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
        existing = (
            await db.execute(select(Settings).where(Settings.key == key))
        ).scalar_one_or_none()
        if not existing:
            setting = Settings(key=key, value=json.dumps(value))
            db.add(setting)
    
    await db.commit()
    return {"message": "Настройки инициализированы"}
