"""Yandex ID OAuth 2.0 helpers."""
from __future__ import annotations

import logging
import re
import secrets
from typing import Any
from urllib.parse import urlencode

import httpx
from fastapi import HTTPException

logger = logging.getLogger(__name__)
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models import User
from app.password_utils import hash_password
from app.roles import normalize_role
from app.session_store import _redis_delete, _redis_get, _redis_set
from app.site_settings import is_registration_enabled

OAUTH_STATE_PREFIX = "oauth:yandex:"
OAUTH_STATE_TTL = 600

YANDEX_AUTH_URL = "https://oauth.yandex.ru/authorize"
YANDEX_TOKEN_URL = "https://oauth.yandex.ru/token"
YANDEX_USERINFO_URL = "https://login.yandex.ru/info"


def yandex_oauth_enabled() -> bool:
    return bool(settings.YANDEX_OAUTH_CLIENT_ID and settings.YANDEX_OAUTH_CLIENT_SECRET)


def yandex_redirect_uri() -> str:
    if settings.YANDEX_OAUTH_REDIRECT_URI:
        return settings.YANDEX_OAUTH_REDIRECT_URI.rstrip("/")
    return f"{settings.site_url}/api/auth/yandex/callback"


async def store_oauth_state(state: str, payload: dict) -> None:
    await _redis_set(f"{OAUTH_STATE_PREFIX}{state}", payload, OAUTH_STATE_TTL)


async def consume_oauth_state(state: str) -> dict | None:
    key = f"{OAUTH_STATE_PREFIX}{state}"
    payload = await _redis_get(key)
    if not payload:
        return None
    await _redis_delete(key)
    return payload


def build_authorize_url(state: str) -> str:
    params = {
        "response_type": "code",
        "client_id": settings.YANDEX_OAUTH_CLIENT_ID,
        "redirect_uri": yandex_redirect_uri(),
        "state": state,
    }
    return f"{YANDEX_AUTH_URL}?{urlencode(params)}"


async def exchange_code_for_token(code: str) -> str:
    async with httpx.AsyncClient(timeout=20.0) as client:
        response = await client.post(
            YANDEX_TOKEN_URL,
            data={
                "grant_type": "authorization_code",
                "code": code,
                "client_id": settings.YANDEX_OAUTH_CLIENT_ID,
                "client_secret": settings.YANDEX_OAUTH_CLIENT_SECRET,
                "redirect_uri": yandex_redirect_uri(),
            },
            headers={"Content-Type": "application/x-www-form-urlencoded"},
        )
    if response.status_code != 200:
        logger.warning("Yandex token exchange failed: %s %s", response.status_code, response.text[:500])
        detail = "Не удалось получить токен Яндекса"
        try:
            error_payload = response.json()
            error_code = error_payload.get("error_description") or error_payload.get("error")
            if error_code:
                detail = f"Яндекс OAuth: {error_code}"
        except Exception:
            pass
        raise HTTPException(status_code=400, detail=detail)
    payload = response.json()
    access_token = payload.get("access_token")
    if not access_token:
        raise HTTPException(status_code=400, detail="Яндекс не вернул access_token")
    return access_token


async def fetch_yandex_profile(access_token: str) -> dict[str, Any]:
    async with httpx.AsyncClient(timeout=20.0) as client:
        response = await client.get(
            YANDEX_USERINFO_URL,
            params={"format": "json"},
            headers={"Authorization": f"OAuth {access_token}"},
        )
    if response.status_code != 200:
        raise HTTPException(status_code=400, detail="Не удалось получить профиль Яндекса")
    return response.json()


def _sanitize_username(value: str) -> str:
    cleaned = re.sub(r"[^\w]", "", (value or "").lower())
    return (cleaned[:20] or "user")


async def _unique_username(db: AsyncSession, base: str) -> str:
    candidate = _sanitize_username(base)
    for index in range(0, 100):
        name = candidate if index == 0 else f"{candidate}{index}"
        exists = (
            await db.execute(select(User.id).where(User.username == name))
        ).scalar_one_or_none()
        if not exists:
            return name
    return f"user{secrets.token_hex(3)}"


async def resolve_yandex_user(db: AsyncSession, profile: dict[str, Any]) -> tuple[User, bool]:
    yandex_id = str(profile.get("id") or "").strip()
    if not yandex_id:
        raise HTTPException(status_code=400, detail="Профиль Яндекса без id")

    email = (profile.get("default_email") or profile.get("email") or "").strip().lower()
    if not email:
        raise HTTPException(status_code=400, detail="Яндекс не предоставил email")

    display_name = (
        profile.get("real_name")
        or profile.get("display_name")
        or profile.get("login")
        or email.split("@")[0]
    )

    user = (
        await db.execute(select(User).where(User.yandex_id == yandex_id))
    ).scalar_one_or_none()
    if user:
        user.role = normalize_role(user.role)
        return user, False

    user = (
        await db.execute(select(User).where(func.lower(User.email) == email))
    ).scalar_one_or_none()
    if user:
        if user.yandex_id and user.yandex_id != yandex_id:
            raise HTTPException(status_code=409, detail="Email уже привязан к другому аккаунту Яндекса")
        user.yandex_id = yandex_id
        if not user.is_verified:
            user.is_verified = True
        await db.commit()
        await db.refresh(user)
        user.role = normalize_role(user.role)
        return user, False

    if not await is_registration_enabled(db):
        raise HTTPException(status_code=403, detail="Регистрация новых пользователей временно отключена")

    username = await _unique_username(db, profile.get("login") or email.split("@")[0])
    from datetime import datetime

    user = User(
        username=username,
        name=str(display_name).strip() or username,
        email=email,
        password=hash_password(secrets.token_urlsafe(32)),
        role="user",
        registered=datetime.now(),
        is_verified=True,
        yandex_id=yandex_id,
        legal_consents={
            "privacy_policy": {"accepted": True, "version": settings.LEGAL_DOCS_VERSION, "via": "yandex"},
            "data_processing": {"accepted": True, "version": settings.LEGAL_DOCS_VERSION, "via": "yandex"},
            "public_offer": {"accepted": True, "version": settings.LEGAL_DOCS_VERSION, "via": "yandex"},
        },
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    user.role = normalize_role(user.role)
    return user, True
