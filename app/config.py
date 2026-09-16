from typing import Annotated, List, Optional

from pydantic import AliasChoices, Field, field_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # Основные настройки
    APP_NAME: str = "DubPar API"
    APP_VERSION: str = "2.0.0"
    ENVIRONMENT: str = "development"

    # База данных
    DATABASE_URL: str = "postgresql://dubpar:dubpar_password@localhost:5432/dubpar"

    # JWT
    SECRET_KEY: str = "change-me-to-a-long-random-secret-key-32b+"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 15
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7
    RESET_TOKEN_EXPIRE_MINUTES: int = 60
    REFRESH_COOKIE_NAME: str = "refresh_token"
    CSRF_COOKIE_NAME: str = "csrf_token"
    MEDIA_ACCESS_COOKIE_NAME: str = "media_access"
    ROLE_CACHE_SECONDS: int = 60

    # Публичный URL сайта (для ссылок в письмах)
    PUBLIC_SITE_URL: str = "http://localhost:8080"

    # CORS — строка через запятую или JSON-массив
    ALLOWED_ORIGINS: Annotated[List[str], NoDecode] = Field(
        default_factory=lambda: [
            "http://localhost:3000",
            "http://localhost:8080",
            "http://localhost:5173",
        ]
    )

    # WebSocket
    WS_MAX_SIZE: int = 10 * 1024 * 1024

    # Медиа-хранилище: local (диск) | minio (S3-объекты; метаданные в PostgreSQL)
    MEDIA_STORAGE: str = "local"
    MINIO_ENDPOINT: str = "minio:9000"
    MINIO_ACCESS_KEY: str = "minioadmin"
    MINIO_SECRET_KEY: str = "minioadmin"
    MINIO_BUCKET: str = "dubpar-media"
    MINIO_SECURE: bool = False

    # Загрузка файлов (local backend)
    UPLOAD_DIR: str = "uploads"
    MAX_UPLOAD_SIZE: int = 5 * 1024 * 1024  # legacy /api/upload
    MAX_UPLOAD_IMAGE_SIZE: int = 10 * 1024 * 1024
    MAX_UPLOAD_VIDEO_SIZE: int = 400 * 1024 * 1024
    MAX_UPLOAD_AUDIO_SIZE: int = 20 * 1024 * 1024
    MAX_UPLOAD_FILE_SIZE: int = 10 * 1024 * 1024

    # Rate Limiting
    RATE_LIMIT_REQUESTS: int = 60
    RATE_LIMIT_PERIOD: int = 60
    AUTH_RATE_LIMIT_REQUESTS: int = 10
    AUTH_RATE_LIMIT_PERIOD: int = 300

    # Логирование
    LOG_LEVEL: str = "INFO"

    # Email (SMTP)
    SMTP_HOST: str = "smtp.gmail.com"
    SMTP_PORT: int = 587
    SMTP_USER: Optional[str] = None
    SMTP_PASSWORD: Optional[str] = None
    FROM_EMAIL: Optional[str] = None

    # Юридическая информация оператора
    LEGAL_OPERATOR_NAME: str = "SyrekAI"
    LEGAL_PLATFORM_NAME: str = "дубльпар.online"
    LEGAL_SITE_URL: str = "https://дубльпар.online"
    LEGAL_PRIVACY_EMAIL: str = "syreksai@gmail.com"
    LEGAL_SUPPORT_EMAIL: str = "syreksai@gmail.com"
    LEGAL_DOCS_VERSION: str = "07.09.2026"
    LEGAL_INN: Optional[str] = None
    LEGAL_OGRN: Optional[str] = None
    LEGAL_ADDRESS: Optional[str] = None
    LEGAL_PHONE: Optional[str] = None
    LEGAL_ROSKOMNADZOR_NUMBER: Optional[str] = None

    # Cloudflare Turnstile
    TURNSTILE_SECRET_KEY: Optional[str] = Field(
        default=None,
        validation_alias=AliasChoices("TURNSTILE_SECRET_KEY", "RECAPTCHA_SECRET_KEY"),
    )
    TURNSTILE_SITE_KEY: Optional[str] = Field(
        default=None,
        validation_alias=AliasChoices("TURNSTILE_SITE_KEY", "VITE_TURNSTILE_SITE_KEY"),
    )
    SKIP_TURNSTILE_VERIFY: bool = False

    # Yandex OAuth (Yandex ID)
    YANDEX_OAUTH_CLIENT_ID: Optional[str] = None
    YANDEX_OAUTH_CLIENT_SECRET: Optional[str] = None
    YANDEX_OAUTH_REDIRECT_URI: Optional[str] = None
    FRONTEND_URL: Optional[str] = None

    @property
    def turnstile_required(self) -> bool:
        return bool(self.TURNSTILE_SECRET_KEY) and not self.SKIP_TURNSTILE_VERIFY

    @field_validator("ALLOWED_ORIGINS", mode="before")
    @classmethod
    def parse_allowed_origins(cls, value):
        if isinstance(value, str):
            return [origin.strip() for origin in value.split(",") if origin.strip()]
        return value

    @property
    def DEBUG(self) -> bool:
        return self.ENVIRONMENT != "production"

    @property
    def site_url(self) -> str:
        return self.PUBLIC_SITE_URL.rstrip("/")

    @property
    def frontend_url(self) -> str:
        if self.FRONTEND_URL:
            return self.FRONTEND_URL.rstrip("/")
        return self.site_url

    @property
    def yandex_oauth_enabled(self) -> bool:
        return bool(self.YANDEX_OAUTH_CLIENT_ID and self.YANDEX_OAUTH_CLIENT_SECRET)


settings = Settings()
