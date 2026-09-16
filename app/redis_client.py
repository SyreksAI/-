# app/redis_client.py
import logging
import redis.asyncio as aioredis
import redis
import os
import json
from dotenv import load_dotenv
from functools import wraps
from typing import Optional, Any, Callable
import asyncio

load_dotenv()

logger = logging.getLogger(__name__)

REDIS_URL = os.getenv("REDIS_URL", "redis://redis:6379/0")
REDIS_CACHE_TTL = int(os.getenv("REDIS_CACHE_TTL", 300))

_redis_pool: aioredis.ConnectionPool | None = None
_redis_client: aioredis.Redis | None = None
_sync_redis_client: redis.Redis | None = None


async def get_redis_client() -> aioredis.Redis:
    global _redis_pool, _redis_client
    if _redis_client is None:
        _redis_pool = aioredis.ConnectionPool.from_url(
            REDIS_URL,
            decode_responses=True,
            max_connections=32,
        )
        _redis_client = aioredis.Redis(connection_pool=_redis_pool)
    return _redis_client


def get_sync_redis_client() -> redis.Redis:
    global _sync_redis_client
    if _sync_redis_client is None:
        _sync_redis_client = redis.Redis.from_url(REDIS_URL, decode_responses=True)
    return _sync_redis_client


# ===== ДЕКОРАТОР ДЛЯ КЭШИРОВАНИЯ =====
def _build_cache_key(func_name: str, key_prefix: str, args, kwargs) -> str:
    parts = [key_prefix or func_name]
    skip_kwargs = {"db", "current_user", "request"}

    for arg in args:
        if isinstance(arg, (int, str, float, bool)):
            parts.append(str(arg))

    for key, value in sorted(kwargs.items()):
        if key in skip_kwargs:
            continue
        if isinstance(value, (int, str, float, bool)):
            parts.append(f"{key}={value}")

    return ":".join(parts)


def _serialize_for_cache(value: Any) -> Any:
    if hasattr(value, "model_dump"):
        return value.model_dump()
    if isinstance(value, list):
        return [_serialize_for_cache(item) for item in value]
    if isinstance(value, dict):
        return {key: _serialize_for_cache(item) for key, item in value.items()}
    return value


def cache(ttl: int = REDIS_CACHE_TTL, key_prefix: str = ""):
    """
    Декоратор для кэширования результатов функций.
    """
    def decorator(func: Callable):
        @wraps(func)
        async def wrapper(*args, **kwargs):
            cache_key = _build_cache_key(func.__name__, key_prefix, args, kwargs)
            
            try:
                redis_client = await get_redis_client()
                cached = await redis_client.get(cache_key)
                if cached:
                    return json.loads(cached)
            except Exception as e:
                logger.debug("Redis cache get error: %s", e)
            
            result = await func(*args, **kwargs)
            
            try:
                redis_client = await get_redis_client()
                await redis_client.setex(
                    cache_key,
                    ttl,
                    json.dumps(_serialize_for_cache(result), default=str),
                )
            except Exception as e:
                logger.debug("Redis cache set error: %s", e)
            
            return result
        return wrapper
    return decorator


# ===== ФУНКЦИИ ДЛЯ РАБОТЫ С КЭШЕМ =====
async def _scan_keys(redis_client, pattern: str) -> list[str]:
    keys: list[str] = []
    cursor = 0
    while True:
        cursor, batch = await redis_client.scan(cursor=cursor, match=pattern, count=200)
        keys.extend(batch)
        if cursor == 0:
            break
    return keys


async def invalidate_cache(pattern: str = "*"):
    """Очистить кэш по шаблону (SCAN вместо KEYS)."""
    try:
        redis_client = await get_redis_client()
        keys = await _scan_keys(redis_client, pattern)
        if keys:
            await redis_client.delete(*keys)
            logger.debug("Cache invalidated: %s keys", len(keys))
    except Exception as e:
        logger.debug("Redis invalidate error: %s", e)


async def get_cached(key: str):
    """Получить значение из кэша"""
    try:
        redis_client = await get_redis_client()
        data = await redis_client.get(key)
        return json.loads(data) if data else None
    except Exception as e:
        logger.debug("Redis get error: %s", e)
        return None


async def set_cached(key: str, value: Any, ttl: int = REDIS_CACHE_TTL):
    """Сохранить значение в кэш"""
    try:
        redis_client = await get_redis_client()
        await redis_client.setex(key, ttl, json.dumps(value, default=str))
        return True
    except Exception as e:
        logger.debug("Redis set error: %s", e)
        return False