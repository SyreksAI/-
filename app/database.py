# app/database.py
from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
import os
from dotenv import load_dotenv
from .config import settings

load_dotenv()

DATABASE_URL = settings.DATABASE_URL

# ✅ Оптимизированный пул соединений
engine = create_engine(
    DATABASE_URL,
    pool_size=20,
    max_overflow=10,
    pool_pre_ping=True,
    pool_recycle=3600,
    echo=False
)

SessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=engine
)

Base = declarative_base()


def get_db():
    """Генератор для получения сессии базы данных"""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()