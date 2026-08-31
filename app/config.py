"""
Конфигурация приложения DubPar
"""
from pydantic_settings import BaseSettings
from functools import lru_cache
from typing import List


class Settings(BaseSettings):
    """Настройки приложения"""
    
    # ===== DATABASE =====
    DATABASE_URL: str = "postgresql://dubpar:dubpar_password@database:5432/dubpar"
    
    # ===== SECURITY =====
    SECRET_KEY: str = "your-super-secret-key-change-in-production-2026"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 10080  # 7 дней
    
    # ===== CORS =====
    ALLOWED_ORIGINS: List[str] = [
        "http://localhost:5173",
        "http://localhost:3000",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:3000",
    ]
    
    # ===== PASSWORD =====
    PASSWORD_MIN_LENGTH: int = 8
    PASSWORD_REQUIRE_UPPERCASE: bool = True
    PASSWORD_REQUIRE_DIGIT: bool = True
    PASSWORD_REQUIRE_SPECIAL: bool = False
    
    # ===== FILE UPLOAD =====
    MAX_FILE_SIZE: int = 10 * 1024 * 1024  # 10 MB
    ALLOWED_FILE_TYPES: List[str] = [
        "image/jpeg",
        "image/png",
        "image/gif",
        "image/webp",
        "application/pdf",
        "text/plain",
        "application/msword",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    ]
    UPLOAD_DIR: str = "uploads"
    
    # ===== WEBSOCKET =====
    WS_HEARTBEAT_INTERVAL: int = 30  # секунды
    
    # ===== LOGGING =====
    LOG_LEVEL: str = "INFO"
    
    # ===== ADMIN =====
    ADMIN_USERNAME: str = "admin"
    ADMIN_EMAIL: str = "admin@dubpar.ru"
    ADMIN_PASSWORD: str = "AdminDubPar2026!"  # Смените в production!
    
    class Config:
        env_file = ".env"
        case_sensitive = True


@lru_cache()
def get_settings() -> Settings:
    """Получить настройки приложения (кэшируется)"""
    return Settings()
