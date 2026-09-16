# app/middleware.py
from collections import defaultdict
import logging
import time
from typing import Dict, List

from sqlalchemy import select
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse

from app.config import settings
from app.database import AsyncSessionLocal
from app.models import User
from app.jwt_auth import resolve_token_session
from app.roles import STAFF_ROLES, normalize_role
from app.session_store import get_session_user_id
from app.site_settings import is_maintenance_mode

logger = logging.getLogger(__name__)

MAINTENANCE_EXEMPT_PATHS = {
    "/health",
    "/api/settings/",
    "/api/settings/public",
    "/api/auth/login",
}

# Fallback if Redis unavailable
_memory_rate_limit: Dict[str, List[float]] = defaultdict(list)

AUTH_PATHS = {
    "/api/auth/login",
    "/api/auth/register",
    "/api/auth/forgot-password",
    "/api/auth/reset-password",
}


def _allow_request(bucket_key: str, limit: int, period: int) -> bool:
    """Fixed-window counter via Redis; falls back to in-memory."""
    redis_key = f"ratelimit:{bucket_key}"
    try:
        from app.redis_client import get_sync_redis_client

        client = get_sync_redis_client()
        count = client.incr(redis_key)
        if count == 1:
            client.expire(redis_key, period)
        return count <= limit
    except Exception as exc:
        logger.warning("Redis rate-limit fallback to memory: %s", exc)
        now = time.time()
        _memory_rate_limit[bucket_key] = [
            t for t in _memory_rate_limit[bucket_key] if now - t < period
        ]
        if len(_memory_rate_limit[bucket_key]) >= limit:
            return False
        _memory_rate_limit[bucket_key].append(now)
        return True


class RateLimitMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        if not request.url.path.startswith("/api"):
            return await call_next(request)

        client_ip = request.client.host if request.client else "unknown"
        path = request.url.path

        if path in AUTH_PATHS:
            bucket_key = f"auth:{client_ip}:{path}"
            limit = settings.AUTH_RATE_LIMIT_REQUESTS
            period = settings.AUTH_RATE_LIMIT_PERIOD
            detail = "Слишком много попыток авторизации. Попробуйте позже."
        else:
            bucket_key = f"api:{client_ip}"
            limit = settings.RATE_LIMIT_REQUESTS
            period = settings.RATE_LIMIT_PERIOD
            detail = "Слишком много запросов. Попробуйте позже."

        if not _allow_request(bucket_key, limit, period):
            return JSONResponse(
                status_code=429,
                content={"detail": detail, "retry_after": period},
            )

        return await call_next(request)


class MaintenanceMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        path = request.url.path
        if not path.startswith("/api") or path in MAINTENANCE_EXEMPT_PATHS:
            return await call_next(request)

        cached = await self._maintenance_flag_cached()
        if cached is False:
            return await call_next(request)

        async with AsyncSessionLocal() as db:
            maintenance_on = (
                cached is True
                if cached is not None
                else await is_maintenance_mode(db)
            )
            if not maintenance_on:
                return await call_next(request)

            if await self._is_admin_request(request, db):
                return await call_next(request)

            return JSONResponse(
                status_code=503,
                content={"detail": "Сайт временно недоступен — идёт техническое обслуживание"},
            )

    @staticmethod
    async def _maintenance_flag_cached() -> bool | None:
        try:
            from app.redis_client import get_redis_client

            client = await get_redis_client()
            cached = await client.get("site_settings:maintenance_mode")
            if cached is None:
                return None
            return cached == "1"
        except Exception:
            return None

    @staticmethod
    async def _is_admin_request(request: Request, db) -> bool:
        auth = request.headers.get("Authorization", "")
        if not auth.startswith("Bearer "):
            return False
        token = auth[7:]
        try:
            try:
                user_id, _sid = await resolve_token_session(token)
            except Exception:
                user_id = await get_session_user_id(token)
                if not user_id:
                    return False
            user = (
                await db.execute(select(User).where(User.id == user_id))
            ).scalar_one_or_none()
            return bool(user and normalize_role(user.role) in STAFF_ROLES)
        except Exception:
            return False


class LoggingMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        start_time = time.time()
        logger.info("%s %s", request.method, request.url.path)
        response = await call_next(request)
        process_time = time.time() - start_time
        logger.info(
            "%s %s - Status: %s - Time: %.3fs",
            request.method,
            request.url.path,
            response.status_code,
            process_time,
        )
        return response
