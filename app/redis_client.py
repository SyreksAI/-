# app/redis_client.py
import redis.asyncio as aioredis
import redis
import os
import json
from dotenv import load_dotenv
from functools import wraps
from typing import Optional, Any, Callable
import asyncio

load_dotenv()

REDIS_URL = os.getenv("REDIS_URL", "redis://redis:6379/0")
REDIS_CACHE_TTL = int(os.getenv("REDIS_CACHE_TTL", 300))


# Асинхронный клиент
async def get_redis_client():
    """Получить асинхронный клиент Redis"""
    return aioredis.from_url(REDIS_URL, decode_responses=True)


# Синхронный клиент
def get_sync_redis_client():
    return redis.Redis.from_url(REDIS_URL, decode_responses=True)


# ===== ДЕКОРАТОР ДЛЯ КЭШИРОВАНИЯ =====
def cache(ttl: int = REDIS_CACHE_TTL, key_prefix: str = ""):
    """
    Декоратор для кэширования результатов функций.
    """
    def decorator(func: Callable):
        @wraps(func)
        async def wrapper(*args, **kwargs):
            cache_key = key_prefix
            if not cache_key:
                cache_key = f"{func.__name__}:{str(args)}:{str(kwargs)}"
            
            try:
                redis_client = await get_redis_client()
                cached = await redis_client.get(cache_key)
                if cached:
                    print(f"✅ Cache HIT: {cache_key}")
                    return json.loads(cached)
            except Exception as e:
                print(f"⚠️ Redis cache error (get): {e}")
            
            # ✅ ИСПРАВЛЕНО: вызываем функцию и ждём результат
            result = await func(*args, **kwargs)
            
            try:
                redis_client = await get_redis_client()
                await redis_client.setex(cache_key, ttl, json.dumps(result, default=str))
                print(f"✅ Cache SET: {cache_key}")
            except Exception as e:
                print(f"⚠️ Redis cache error (set): {e}")
            
            return result
        return wrapper
    return decorator


# ===== ФУНКЦИИ ДЛЯ РАБОТЫ С КЭШЕМ =====
async def invalidate_cache(pattern: str = "*"):
    """Очистить кэш по шаблону"""
    try:
        redis_client = await get_redis_client()
        keys = await redis_client.keys(pattern)
        if keys:
            await redis_client.delete(*keys)
            print(f"🧹 Cache invalidated: {len(keys)} keys")
    except Exception as e:
        print(f"⚠️ Redis invalidate error: {e}")


async def get_cached(key: str):
    """Получить значение из кэша"""
    try:
        redis_client = await get_redis_client()
        data = await redis_client.get(key)
        return json.loads(data) if data else None
    except Exception as e:
        print(f"⚠️ Redis get error: {e}")
        return None


async def set_cached(key: str, value: Any, ttl: int = REDIS_CACHE_TTL):
    """Сохранить значение в кэш"""
    try:
        redis_client = await get_redis_client()
        await redis_client.setex(key, ttl, json.dumps(value, default=str))
        return True
    except Exception as e:
        print(f"⚠️ Redis set error: {e}")
        return False