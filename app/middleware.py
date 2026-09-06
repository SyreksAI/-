# app/middleware.py
from fastapi import Request, HTTPException
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse
import time
import logging
from typing import Dict, List
from collections import defaultdict
from .config import settings

logger = logging.getLogger(__name__)

# Хранилище для rate limiting
rate_limit_storage: Dict[str, List[float]] = defaultdict(list)


class RateLimitMiddleware(BaseHTTPMiddleware):
    """Middleware для ограничения частоты запросов"""
    
    async def dispatch(self, request: Request, call_next):
        # Пропускаем не API запросы
        if not request.url.path.startswith("/api"):
            return await call_next(request)
        
        # Получаем IP клиента
        client_ip = request.client.host if request.client else "unknown"
        
        # Очищаем старые записи
        current_time = time.time()
        rate_limit_storage[client_ip] = [
            t for t in rate_limit_storage[client_ip]
            if current_time - t < settings.RATE_LIMIT_PERIOD
        ]
        
        # Проверяем лимит
        if len(rate_limit_storage[client_ip]) >= settings.RATE_LIMIT_REQUESTS:
            return JSONResponse(
                status_code=429,
                content={
                    "detail": "Слишком много запросов. Попробуйте позже.",
                    "retry_after": settings.RATE_LIMIT_PERIOD
                }
            )
        
        # Добавляем текущий запрос
        rate_limit_storage[client_ip].append(current_time)
        
        return await call_next(request)


class LoggingMiddleware(BaseHTTPMiddleware):
    """Middleware для логирования запросов"""
    
    async def dispatch(self, request: Request, call_next):
        start_time = time.time()
        
        # Логируем запрос
        logger.info(f"📥 {request.method} {request.url.path}")
        
        response = await call_next(request)
        
        # Логируем ответ
        process_time = time.time() - start_time
        logger.info(
            f"📤 {request.method} {request.url.path} "
            f"- Status: {response.status_code} "
            f"- Time: {process_time:.3f}s"
        )
        
        return response