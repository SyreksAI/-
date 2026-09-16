from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
import os
import logging

from app.database import engine, Base
from app.routes import auth, users, categories, messages, groups, upload, test, chat_upload, files
from app.routes import forum
from app.models import ForumCategory
from app.websocket_manager import active_connections
from app.config import settings
from app.middleware import RateLimitMiddleware, LoggingMiddleware, MaintenanceMiddleware
from app.ws_chat import websocket_endpoint
from app.routes import study
from app.routes import settings as settings_router
from app.routes import comments
from app.routes import support
from app.routes import progress
from app.routes import admin as admin_router

# ✅ Настройка логирования
logging.basicConfig(
    level=getattr(logging, settings.LOG_LEVEL, "INFO"),
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Создаём таблицы
try:
    Base.metadata.create_all(bind=engine)
    logger.info("✅ Таблицы созданы успешно")
except Exception as e:
    logger.error(f"❌ Ошибка создания таблиц: {e}")


def seed_forum_categories():
    from app.database import SessionLocal

    db = SessionLocal()
    try:
        if db.query(ForumCategory).count() > 0:
            return
        defaults = [
            ("Общие обсуждения", "Вопросы и идеи по платформе", "fas fa-comments", 1),
            ("Python & Backend", "FastAPI, Django, базы данных", "fab fa-python", 2),
            ("Frontend", "React, CSS, UI/UX", "fab fa-react", 3),
            ("DevOps", "Docker, CI/CD, деплой", "fas fa-server", 4),
        ]
        for name, description, icon, order in defaults:
            db.add(ForumCategory(name=name, description=description, icon=icon, order=order))
        db.commit()
        logger.info("✅ Созданы категории форума по умолчанию")
    except Exception as e:
        db.rollback()
        logger.error(f"❌ Ошибка создания категорий форума: {e}")
    finally:
        db.close()


seed_forum_categories()


def ensure_user_legal_consents_column():
    from sqlalchemy import text

    try:
        with engine.begin() as conn:
            if engine.dialect.name == "postgresql":
                conn.execute(text(
                    "ALTER TABLE users ADD COLUMN IF NOT EXISTS legal_consents JSONB DEFAULT '{}'::jsonb"
                ))
            else:
                conn.execute(text(
                    "ALTER TABLE users ADD COLUMN IF NOT EXISTS legal_consents JSON DEFAULT '{}'"
                ))
        logger.info("✅ Колонка legal_consents проверена")
    except Exception as e:
        logger.warning(f"⚠️ Не удалось добавить legal_consents: {e}")


ensure_user_legal_consents_column()


def ensure_user_yandex_id_column():
    from sqlalchemy import text

    try:
        with engine.begin() as conn:
            if engine.dialect.name == "postgresql":
                conn.execute(text(
                    "ALTER TABLE users ADD COLUMN IF NOT EXISTS yandex_id VARCHAR"
                ))
                conn.execute(text(
                    "CREATE UNIQUE INDEX IF NOT EXISTS ix_users_yandex_id ON users (yandex_id)"
                ))
            else:
                conn.execute(text(
                    "ALTER TABLE users ADD COLUMN IF NOT EXISTS yandex_id VARCHAR"
                ))
        logger.info("✅ Колонка yandex_id проверена")
    except Exception as e:
        logger.warning(f"⚠️ Не удалось добавить yandex_id: {e}")


ensure_user_yandex_id_column()


def ensure_messages_chat_index():
    from sqlalchemy import text

    try:
        with engine.begin() as conn:
            if engine.dialect.name == "postgresql":
                conn.execute(text(
                    "CREATE INDEX IF NOT EXISTS ix_messages_chat_history "
                    "ON messages (chat_id, timestamp DESC, id DESC) "
                    "WHERE is_deleted = false"
                ))
        logger.info("✅ Индекс ix_messages_chat_history проверен")
    except Exception as e:
        logger.warning(f"⚠️ Не удалось создать индекс messages: {e}")


ensure_messages_chat_index()

# ✅ Создаём приложение
app = FastAPI(
    title="DubPar API",
    version="2.0.0",
    description="DubPar - образовательная платформа с чатом и форумом"
)


def _format_validation_error(error: dict) -> str:
    loc = [str(part) for part in error.get("loc", []) if part != "body"]
    field = ".".join(loc)
    msg = error.get("msg", "Ошибка валидации")
    if msg.startswith("Value error, "):
        msg = msg[len("Value error, "):]
    return f"{field}: {msg}" if field else msg


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    messages = [_format_validation_error(error) for error in exc.errors()]
    return JSONResponse(
        status_code=422,
        content={"detail": "; ".join(messages) if messages else "Ошибка валидации данных"},
    )


# ✅ CORS с ограниченным списком из настроек
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ✅ Добавляем middleware для безопасности и логирования
app.add_middleware(MaintenanceMiddleware)
app.add_middleware(RateLimitMiddleware)
app.add_middleware(LoggingMiddleware)

# Подключаем роутеры
app.include_router(auth.router, prefix="/api/auth", tags=["auth"])
app.include_router(users.router, prefix="/api/users", tags=["users"])
app.include_router(categories.router, prefix="/api/categories", tags=["categories"])
app.include_router(messages.router, prefix="/api/messages", tags=["messages"])
app.include_router(groups.router, prefix="/api/groups", tags=["groups"])
app.include_router(upload.router, prefix="/api/upload", tags=["upload"])
app.include_router(chat_upload.router, prefix="/api/chat", tags=["chat-upload"])
app.include_router(files.router, prefix="/api/files", tags=["files"])
app.include_router(test.router, prefix="/api/test", tags=["test"])
app.include_router(forum.router, prefix="/api/forum", tags=["forum"])
app.include_router(study.router, prefix="/api/study", tags=["study"])
app.include_router(settings_router.router, prefix="/api/settings", tags=["settings"])
app.include_router(comments.router, prefix="/api/comments", tags=["comments"])
app.include_router(support.router, prefix="/api/support", tags=["support"])
app.include_router(progress.router, prefix="/api/progress", tags=["progress"])
app.include_router(admin_router.router, prefix="/api/admin", tags=["admin"])

# Монтируем статические файлы
if os.path.exists("uploads"):
    app.mount("/uploads", StaticFiles(directory="uploads"), name="uploads")


app.websocket("/ws/{user_id}")(websocket_endpoint)


@app.get("/")
async def root():
    return {
        "message": "DubPar API is running!",
        "version": "2.0.0",
        "status": "online"
    }


@app.get("/health")
async def health():
    media_backend = settings.MEDIA_STORAGE
    media_ok = True
    if media_backend == "minio":
        try:
            from app.storage import get_media_storage

            get_media_storage()
        except Exception:
            media_ok = False
    return {
        "status": "ok" if media_ok else "degraded",
        "version": "2.0.0",
        "active_connections": len(active_connections),
        "media_storage": media_backend,
        "media_ok": media_ok,
    }


@app.get("/api/status")
async def api_status():
    """Проверка статуса API"""
    return {
        "status": "online",
        "database": "connected",
        "websocket": "active",
        "connections": len(active_connections)
    }