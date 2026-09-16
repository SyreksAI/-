"""JWT access tokens, refresh cookies, and Redis session tracking."""
from __future__ import annotations

import json
import secrets
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

import jwt
from fastapi import HTTPException, Request, Response

from app.config import settings
from app.redis_client import get_redis_client

ACCESS_PREFIX = "access:"
REFRESH_PREFIX = "refresh:"
REFRESH_LOOKUP_PREFIX = "refresh_lookup:"
USER_SESSIONS_PREFIX = "user_sessions:"
CSRF_PREFIX = "csrf:"

_memory_sessions: dict[str, set[str]] = {}
_memory_tokens: dict[str, dict] = {}


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _access_ttl_seconds() -> int:
    return max(60, settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60)


def _refresh_ttl_seconds() -> int:
    return max(3600, settings.REFRESH_TOKEN_EXPIRE_DAYS * 86400)


async def _redis_sadd(key: str, member: str, ttl: int | None = None) -> None:
    _memory_sessions.setdefault(key, set()).add(member)
    try:
        redis = await get_redis_client()
        await redis.sadd(key, member)
        if ttl:
            await redis.expire(key, ttl)
    except Exception:
        pass


async def _redis_srem(key: str, member: str) -> None:
    bucket = _memory_sessions.get(key)
    if bucket:
        bucket.discard(member)
    try:
        redis = await get_redis_client()
        await redis.srem(key, member)
    except Exception:
        pass


async def _redis_smembers(key: str) -> set[str]:
    members = set(_memory_sessions.get(key, set()))
    try:
        redis = await get_redis_client()
        remote = await redis.smembers(key)
        members.update(remote or [])
    except Exception:
        pass
    return members


async def _redis_delete(key: str) -> None:
    try:
        redis = await get_redis_client()
        await redis.delete(key)
    except Exception:
        _memory_sessions.pop(key, None)
        _memory_tokens.pop(key, None)


async def _redis_set(key: str, payload: dict, ttl: int) -> None:
    _memory_tokens[key] = payload
    try:
        redis = await get_redis_client()
        await redis.setex(key, ttl, json.dumps(payload))
    except Exception:
        pass


async def _redis_get(key: str) -> dict | None:
    try:
        redis = await get_redis_client()
        raw = await redis.get(key)
        if raw:
            return json.loads(raw)
    except Exception:
        pass
    return _memory_tokens.get(key)


def create_access_token(*, user_id: int, role: str, sid: str) -> str:
    now = _utcnow()
    exp = now + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    payload = {
        "sub": str(user_id),
        "role": role,
        "sid": sid,
        "iat": int(now.timestamp()),
        "exp": int(exp.timestamp()),
    }
    token = jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.ALGORITHM)
    return token if isinstance(token, str) else token.decode()


def decode_access_token(token: str) -> dict[str, Any]:
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
    except jwt.ExpiredSignatureError as exc:
        raise HTTPException(status_code=401, detail="Токен истёк") from exc
    except jwt.InvalidTokenError as exc:
        raise HTTPException(status_code=401, detail="Недействительный токен") from exc

    if "sub" not in payload or "sid" not in payload:
        raise HTTPException(status_code=401, detail="Недействительный токен")
    return payload


async def register_session(user_id: int, sid: str) -> None:
    key = f"{USER_SESSIONS_PREFIX}{user_id}"
    await _redis_sadd(key, sid, ttl=_refresh_ttl_seconds())


async def is_session_active(user_id: int, sid: str) -> bool:
    key = f"{USER_SESSIONS_PREFIX}{user_id}"
    members = await _redis_smembers(key)
    return sid in members


async def invalidate_user_sessions(user_id: int) -> None:
    key = f"{USER_SESSIONS_PREFIX}{user_id}"
    sids = await _redis_smembers(key)
    for sid in sids:
        refresh_payload = await _redis_get(f"{REFRESH_PREFIX}{sid}")
        if refresh_payload and refresh_payload.get("refresh_token"):
            await _redis_delete(f"{REFRESH_LOOKUP_PREFIX}{refresh_payload['refresh_token']}")
        await _redis_delete(f"{REFRESH_PREFIX}{sid}")
    await _redis_delete(key)


async def revoke_session(user_id: int, sid: str) -> None:
    refresh_payload = await _redis_get(f"{REFRESH_PREFIX}{sid}")
    if refresh_payload and refresh_payload.get("refresh_token"):
        await _redis_delete(f"{REFRESH_LOOKUP_PREFIX}{refresh_payload['refresh_token']}")
    await _redis_srem(f"{USER_SESSIONS_PREFIX}{user_id}", sid)
    await _redis_delete(f"{REFRESH_PREFIX}{sid}")


async def create_auth_session(user_id: int, role: str) -> tuple[str, str, str]:
    sid = secrets.token_urlsafe(16)
    await register_session(user_id, sid)
    access_token = create_access_token(user_id=user_id, role=role, sid=sid)
    refresh_token = secrets.token_urlsafe(32)
    ttl = _refresh_ttl_seconds()
    await _redis_set(
        f"{REFRESH_PREFIX}{sid}",
        {"user_id": user_id, "sid": sid, "refresh_token": refresh_token},
        ttl,
    )
    await _redis_set(
        f"{REFRESH_LOOKUP_PREFIX}{refresh_token}",
        {"user_id": user_id, "sid": sid},
        ttl,
    )
    csrf_token = secrets.token_urlsafe(24)
    await _redis_set(f"{CSRF_PREFIX}{sid}", {"token": csrf_token}, _refresh_ttl_seconds())
    return access_token, refresh_token, csrf_token


def set_refresh_cookie(response: Response, refresh_token: str) -> None:
    response.set_cookie(
        key=settings.REFRESH_COOKIE_NAME,
        value=refresh_token,
        httponly=True,
        secure=settings.ENVIRONMENT == "production",
        samesite="lax",
        max_age=_refresh_ttl_seconds(),
        path="/api/auth",
    )


def set_csrf_cookie(response: Response, csrf_token: str) -> None:
    response.set_cookie(
        key=settings.CSRF_COOKIE_NAME,
        value=csrf_token,
        httponly=False,
        secure=settings.ENVIRONMENT == "production",
        samesite="lax",
        max_age=_refresh_ttl_seconds(),
        path="/",
    )


def set_media_access_cookie(response: Response, access_token: str) -> None:
    """HttpOnly cookie for <video>/<audio> Range requests (cannot send Authorization header)."""
    response.set_cookie(
        key=settings.MEDIA_ACCESS_COOKIE_NAME,
        value=access_token,
        httponly=True,
        secure=settings.ENVIRONMENT == "production",
        samesite="lax",
        max_age=_access_ttl_seconds(),
        path="/",
    )


def clear_auth_cookies(response: Response) -> None:
    response.delete_cookie(settings.REFRESH_COOKIE_NAME, path="/api/auth")
    response.delete_cookie(settings.CSRF_COOKIE_NAME, path="/")
    response.delete_cookie(settings.MEDIA_ACCESS_COOKIE_NAME, path="/")


async def refresh_access_token(request: Request, response: Response) -> tuple[str, int, str]:
    refresh_token = request.cookies.get(settings.REFRESH_COOKIE_NAME)
    if not refresh_token:
        raise HTTPException(status_code=401, detail="Refresh-токен отсутствует")

    csrf_header = request.headers.get("X-CSRF-Token")
    csrf_cookie = request.cookies.get(settings.CSRF_COOKIE_NAME)
    if not csrf_header or not csrf_cookie or csrf_header != csrf_cookie:
        raise HTTPException(status_code=403, detail="CSRF-проверка не пройдена")

    lookup = await _redis_get(f"{REFRESH_LOOKUP_PREFIX}{refresh_token}")
    if not lookup:
        raise HTTPException(status_code=401, detail="Refresh-токен недействителен")

    sid = str(lookup["sid"])
    user_id = int(lookup["user_id"])

    if not await is_session_active(user_id, sid):
        raise HTTPException(status_code=401, detail="Сессия отозвана")

    from app.roles import normalize_role

    role = "user"
    access_token = create_access_token(user_id=user_id, role=normalize_role(role), sid=sid)
    new_refresh = secrets.token_urlsafe(32)
    ttl = _refresh_ttl_seconds()
    await _redis_delete(f"{REFRESH_LOOKUP_PREFIX}{refresh_token}")
    await _redis_set(
        f"{REFRESH_PREFIX}{sid}",
        {"user_id": user_id, "sid": sid, "refresh_token": new_refresh},
        ttl,
    )
    await _redis_set(
        f"{REFRESH_LOOKUP_PREFIX}{new_refresh}",
        {"user_id": user_id, "sid": sid},
        ttl,
    )
    set_refresh_cookie(response, new_refresh)
    return access_token, user_id, sid


async def resolve_token_session(token: str) -> tuple[int, str]:
    payload = decode_access_token(token)
    user_id = int(payload["sub"])
    sid = str(payload["sid"])
    if not await is_session_active(user_id, sid):
        raise HTTPException(status_code=401, detail="Сессия недействительна или отозвана")
    return user_id, sid


def new_sid() -> str:
    return uuid.uuid4().hex
