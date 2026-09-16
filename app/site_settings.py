import json
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Settings


def _parse_bool(value: Any, default: bool = False) -> bool:
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        return value.strip().lower() in {"true", "1", "yes"}
    return default


async def get_setting(db: AsyncSession, key: str, default: Any = None) -> Any:
    row = (
        await db.execute(select(Settings).where(Settings.key == key))
    ).scalar_one_or_none()
    if not row:
        return default
    try:
        return json.loads(row.value)
    except (json.JSONDecodeError, TypeError):
        return row.value


async def is_registration_enabled(db: AsyncSession) -> bool:
    return _parse_bool(await get_setting(db, "registrationEnabled", True), True)


_MAINTENANCE_CACHE_KEY = "site_settings:maintenance_mode"
_MAINTENANCE_CACHE_TTL = 60


async def invalidate_maintenance_cache() -> None:
    try:
        from app.redis_client import get_redis_client

        client = await get_redis_client()
        await client.delete(_MAINTENANCE_CACHE_KEY)
    except Exception:
        pass


async def is_maintenance_mode(db: AsyncSession) -> bool:
    try:
        from app.redis_client import get_redis_client

        client = await get_redis_client()
        cached = await client.get(_MAINTENANCE_CACHE_KEY)
        if cached is not None:
            return cached == "1"
    except Exception:
        pass

    value = _parse_bool(await get_setting(db, "maintenanceMode", False), False)
    try:
        from app.redis_client import get_redis_client

        client = await get_redis_client()
        await client.setex(_MAINTENANCE_CACHE_KEY, _MAINTENANCE_CACHE_TTL, "1" if value else "0")
    except Exception:
        pass
    return value
