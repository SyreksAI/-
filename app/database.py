# app/database.py
from dotenv import load_dotenv
from sqlalchemy import create_engine
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import declarative_base, sessionmaker

from .config import settings

load_dotenv()


def normalize_database_url(url: str, *, async_mode: bool = False) -> str:
    """Normalize PostgreSQL/SQLite URLs for sync or async drivers."""
    if url.startswith("postgresql+psycopg2://"):
        url = "postgresql+psycopg://" + url.removeprefix("postgresql+psycopg2://")
    elif url.startswith("postgresql://"):
        url = "postgresql+psycopg://" + url.removeprefix("postgresql://")
    elif url.startswith("postgres://"):
        url = "postgresql+psycopg://" + url.removeprefix("postgres://")

    if async_mode:
        if url.startswith("sqlite://"):
            return url.replace("sqlite://", "sqlite+aiosqlite://", 1)
        if url.startswith("sqlite+aiosqlite://"):
            return url
    else:
        if url.startswith("sqlite+aiosqlite://"):
            return url.replace("sqlite+aiosqlite://", "sqlite://", 1)
        if url.startswith("postgresql+psycopg://"):
            return "postgresql+psycopg://" + url.split("://", 1)[1]

    return url


DATABASE_URL = normalize_database_url(settings.DATABASE_URL)
ASYNC_DATABASE_URL = normalize_database_url(settings.DATABASE_URL, async_mode=True)

_engine_kwargs = {
    "pool_pre_ping": True,
    "pool_recycle": 3600,
    "echo": False,
}

if ASYNC_DATABASE_URL.startswith("sqlite"):
    async_engine = create_async_engine(
        ASYNC_DATABASE_URL,
        connect_args={"check_same_thread": False},
        **_engine_kwargs,
    )
    sync_engine = create_engine(
        DATABASE_URL,
        connect_args={"check_same_thread": False},
        **_engine_kwargs,
    )
else:
    async_engine = create_async_engine(
        ASYNC_DATABASE_URL,
        pool_size=20,
        max_overflow=10,
        **_engine_kwargs,
    )
    sync_engine = create_engine(
        DATABASE_URL,
        pool_size=20,
        max_overflow=10,
        **_engine_kwargs,
    )

AsyncSessionLocal = async_sessionmaker(
    async_engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autocommit=False,
    autoflush=False,
)

SessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=sync_engine,
)

Base = declarative_base()

# Backward-compatible alias for startup scripts and Alembic
engine = sync_engine


async def get_db():
    async with AsyncSessionLocal() as session:
        yield session
