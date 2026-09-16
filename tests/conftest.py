import asyncio
import os
from datetime import datetime

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

os.environ["SECRET_KEY"] = "test-secret-key-for-pytest-only-32bytes!"
os.environ["DATABASE_URL"] = "sqlite://"
os.environ.setdefault("REDIS_URL", "redis://localhost:6379/15")
os.environ.setdefault("ALLOWED_ORIGINS", "http://localhost:8080")
os.environ.setdefault("AUTH_RATE_LIMIT_REQUESTS", "10000")
os.environ.setdefault("AUTH_RATE_LIMIT_PERIOD", "1")

import app.models  # noqa: F401 — register all tables on Base.metadata
from app.config import settings
from app.database import Base, get_db
from app.main import app

settings.SECRET_KEY = os.environ["SECRET_KEY"]
from app.models import StudySubtopic, StudyTopic, Technology, User
from app.password_utils import hash_password
from app.jwt_auth import _memory_sessions, _memory_tokens
from app.session_store import _memory_store
from app.jwt_auth import create_auth_session

test_engine = create_async_engine(
    "sqlite+aiosqlite://",
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestingSessionLocal = async_sessionmaker(
    test_engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autocommit=False,
    autoflush=False,
)


def run_async(coro):
    loop = asyncio.new_event_loop()
    try:
        return loop.run_until_complete(coro)
    finally:
        loop.close()


async def _flush_test_redis():
    from app.redis_client import get_redis_client

    redis = await get_redis_client()
    await redis.flushdb()


@pytest.fixture(autouse=True)
def clear_session_store():
    _memory_store.clear()
    _memory_sessions.clear()
    _memory_tokens.clear()
    try:
        run_async(_flush_test_redis())
    except Exception:
        pass
    yield
    _memory_store.clear()
    _memory_sessions.clear()
    _memory_tokens.clear()
    try:
        run_async(_flush_test_redis())
    except Exception:
        pass


@pytest.fixture(autouse=True)
def setup_database():
    run_async(_create_tables())
    yield
    run_async(_drop_tables())


async def _create_tables():
    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)


async def _drop_tables():
    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)


@pytest.fixture
def db_session():
    session_cm = TestingSessionLocal()
    session = run_async(session_cm.__aenter__())
    try:
        yield session
    finally:
        run_async(session_cm.__aexit__(None, None, None))


def _shared_session_factory(session):
    class _SessionMaker:
        def __call__(self):
            return self

        async def __aenter__(self):
            return session

        async def __aexit__(self, exc_type, exc, tb):
            return False

    return _SessionMaker()


@pytest.fixture
def client(db_session):
    import app.database as database_module
    import app.middleware as middleware_module
    import app.ws_chat as ws_chat_module

    shared = _shared_session_factory(db_session)
    original_db_local = database_module.AsyncSessionLocal
    original_middleware_local = middleware_module.AsyncSessionLocal
    original_ws_local = ws_chat_module.AsyncSessionLocal

    database_module.AsyncSessionLocal = shared
    middleware_module.AsyncSessionLocal = shared
    ws_chat_module.AsyncSessionLocal = shared

    async def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as test_client:
        yield test_client

    database_module.AsyncSessionLocal = original_db_local
    middleware_module.AsyncSessionLocal = original_middleware_local
    ws_chat_module.AsyncSessionLocal = original_ws_local
    app.dependency_overrides.clear()


@pytest.fixture
def test_user(db_session):
    async def _create():
        user = User(
            username="testuser",
            name="Test User",
            email="test@example.com",
            password=hash_password("Test1234!"),
            role="user",
            registered=datetime.now(),
        )
        db_session.add(user)
        await db_session.commit()
        await db_session.refresh(user)
        return user

    return run_async(_create())


@pytest.fixture
def auth_headers(test_user):
    token, _, _ = run_async(create_auth_session(test_user.id, test_user.role or "user"))
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def study_content(db_session):
    async def _create():
        tech = Technology(name="Python", icon="fab fa-python")
        db_session.add(tech)
        await db_session.commit()
        await db_session.refresh(tech)

        topic = StudyTopic(title="FastAPI", description="Topic content", technology_id=tech.id)
        db_session.add(topic)
        await db_session.commit()
        await db_session.refresh(topic)

        subtopic = StudySubtopic(
            title="Routing", description="Subtopic content", topic_id=topic.id
        )
        db_session.add(subtopic)
        await db_session.commit()
        await db_session.refresh(subtopic)

        return {"technology": tech, "topic": topic, "subtopic": subtopic}

    return run_async(_create())
