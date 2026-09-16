"""Redis-backed sessions (replaces JWT for auth tokens)."""
from __future__ import annotations

import json
import secrets
from typing import Literal, Optional

from fastapi import HTTPException

from app.config import settings
from app.redis_client import get_redis_client

SessionKind = Literal["access", "password_reset", "email_verify"]

SESSION_PREFIX = "session:"
RESET_PREFIX = "reset:"
VERIFY_PREFIX = "verify:"

# Fallback when Redis unavailable (tests/local dev)
_memory_store: dict[str, tuple[str, dict, int]] = {}


def _ttl_seconds(minutes: int) -> int:
    return max(60, minutes * 60)


async def _redis_set(key: str, payload: dict, ttl: int) -> None:
    try:
        redis = await get_redis_client()
        await redis.setex(key, ttl, json.dumps(payload))
    except Exception:
        _memory_store[key] = (key, payload, ttl)


async def _redis_get(key: str) -> dict | None:
    try:
        redis = await get_redis_client()
        raw = await redis.get(key)
        if raw:
            return json.loads(raw)
    except Exception:
        pass
    stored = _memory_store.get(key)
    return stored[1] if stored else None


async def _redis_delete(key: str) -> None:
    try:
        redis = await get_redis_client()
        await redis.delete(key)
    except Exception:
        pass
    _memory_store.pop(key, None)


async def create_access_session(user_id: int, role: str = "user") -> str:
    session_id = secrets.token_urlsafe(32)
    payload = {"user_id": user_id, "role": role, "kind": "access"}
    await _redis_set(
        f"{SESSION_PREFIX}{session_id}",
        payload,
        _ttl_seconds(settings.ACCESS_TOKEN_EXPIRE_MINUTES),
    )
    return session_id


async def create_password_reset_token(user_id: int) -> str:
    token = secrets.token_urlsafe(32)
    payload = {"user_id": user_id, "kind": "password_reset"}
    await _redis_set(
        f"{RESET_PREFIX}{token}",
        payload,
        _ttl_seconds(settings.RESET_TOKEN_EXPIRE_MINUTES),
    )
    return token


async def create_email_verify_token(user_id: int) -> str:
    token = secrets.token_urlsafe(32)
    payload = {"user_id": user_id, "kind": "email_verify"}
    await _redis_set(
        f"{VERIFY_PREFIX}{token}",
        payload,
        _ttl_seconds(settings.RESET_TOKEN_EXPIRE_MINUTES),
    )
    return token


async def revoke_access_session(session_id: str) -> None:
    await _redis_delete(f"{SESSION_PREFIX}{session_id}")


async def consume_password_reset_token(token: str) -> int:
    """Validate and single-use consume a password reset token."""
    user_id = await get_user_id_from_token(token, allow_reset=True)
    await _redis_delete(f"{RESET_PREFIX}{token}")
    return user_id


async def get_user_id_from_token(
    token: str,
    *,
    allow_reset: bool = False,
    allow_verify: bool = False,
) -> int:
    if allow_reset:
        data = await _redis_get(f"{RESET_PREFIX}{token}")
        if not data or data.get("kind") != "password_reset":
            raise HTTPException(status_code=400, detail="Неверный или истёкший токен сброса")
        return int(data["user_id"])

    if allow_verify:
        data = await _redis_get(f"{VERIFY_PREFIX}{token}")
        if not data or data.get("kind") != "email_verify":
            raise HTTPException(status_code=400, detail="Неверный или истёкший токен")
        return int(data["user_id"])

    data = await _redis_get(f"{SESSION_PREFIX}{token}")
    if not data or data.get("kind") != "access":
        raise HTTPException(status_code=401, detail="Сессия недействительна или истекла")
    return int(data["user_id"])


async def get_session_user_id(token: str) -> int | None:
    try:
        return await get_user_id_from_token(token)
    except HTTPException:
        return None
