"""Admin audit logging."""
from __future__ import annotations

import json
from typing import Any, Optional

from fastapi import Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import AdminLog

SENSITIVE_KEYS = {"password", "token", "access_token", "refresh_token", "totp", "secret"}


def _sanitize_payload(payload: Optional[dict[str, Any]]) -> dict[str, Any]:
    if not payload:
        return {}
    clean: dict[str, Any] = {}
    for key, value in payload.items():
        lowered = key.lower()
        if any(part in lowered for part in SENSITIVE_KEYS):
            continue
        if isinstance(value, dict):
            clean[key] = _sanitize_payload(value)
        else:
            clean[key] = value
    return clean


def client_ip(request: Request) -> str:
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        return forwarded.split(",")[0].strip()
    if request.client:
        return request.client.host
    return "unknown"


async def admin_audit_log(
    db: AsyncSession,
    *,
    admin_id: int,
    action: str,
    target_type: str,
    target_id: str | int,
    payload: Optional[dict[str, Any]] = None,
    request: Optional[Request] = None,
    ip: Optional[str] = None,
) -> AdminLog:
    details = _sanitize_payload(payload or {})
    if request is not None:
        details["ip"] = client_ip(request)
    elif ip:
        details["ip"] = ip

    entry = AdminLog(
        admin_id=admin_id,
        action=action,
        target_type=target_type,
        target_id=str(target_id),
        details=details,
    )
    db.add(entry)
    await db.commit()
    await db.refresh(entry)
    return entry
