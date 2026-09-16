"""Yandex OAuth flow tests."""
from datetime import datetime
from unittest.mock import AsyncMock, patch
from urllib.parse import parse_qs, urlparse

import pytest
from sqlalchemy import select

from app.config import settings
from app.models import User
from app.yandex_oauth import store_oauth_state
from tests.conftest import run_async


@pytest.fixture(autouse=True)
def yandex_oauth_settings():
    original = (
        settings.YANDEX_OAUTH_CLIENT_ID,
        settings.YANDEX_OAUTH_CLIENT_SECRET,
        settings.YANDEX_OAUTH_REDIRECT_URI,
        settings.FRONTEND_URL,
    )
    settings.YANDEX_OAUTH_CLIENT_ID = "test-client-id"
    settings.YANDEX_OAUTH_CLIENT_SECRET = "test-client-secret"
    settings.YANDEX_OAUTH_REDIRECT_URI = "http://testserver/api/auth/yandex/callback"
    settings.FRONTEND_URL = "http://localhost:8080"
    yield
    (
        settings.YANDEX_OAUTH_CLIENT_ID,
        settings.YANDEX_OAUTH_CLIENT_SECRET,
        settings.YANDEX_OAUTH_REDIRECT_URI,
        settings.FRONTEND_URL,
    ) = original


def test_yandex_login_disabled_without_credentials(client):
    settings.YANDEX_OAUTH_CLIENT_ID = None
    settings.YANDEX_OAUTH_CLIENT_SECRET = None
    resp = client.get("/api/auth/yandex/login", follow_redirects=False)
    assert resp.status_code == 404


def test_yandex_login_redirects_to_yandex(client):
    resp = client.get("/api/auth/yandex/login?next=/profile", follow_redirects=False)
    assert resp.status_code == 302
    location = resp.headers["location"]
    assert location.startswith("https://oauth.yandex.ru/authorize")
    assert "client_id=test-client-id" in location
    assert "state=" in location


def test_public_settings_exposes_yandex_flag(client):
    resp = client.get("/api/settings/public")
    assert resp.status_code == 200
    assert resp.json()["yandexOAuthEnabled"] is True


@patch("app.routes.auth.fetch_yandex_profile", new_callable=AsyncMock)
@patch("app.routes.auth.exchange_code_for_token", new_callable=AsyncMock)
def test_yandex_callback_creates_user(mock_exchange, mock_profile, client, db_session):
    mock_exchange.return_value = "ya-access-token"
    mock_profile.return_value = {
        "id": "123456",
        "default_email": "yandex-new@example.com",
        "login": "yandexuser",
        "real_name": "Yandex User",
    }

    state = "test-state-token"
    run_async(store_oauth_state(state, {"next": "/", "frontend": "http://localhost:8080"}))

    resp = client.get(
        f"/api/auth/yandex/callback?code=auth-code&state={state}",
        follow_redirects=False,
    )
    assert resp.status_code == 302
    location = resp.headers["location"]
    assert location.startswith("http://localhost:8080/auth/oauth?")
    query = parse_qs(urlparse(location).query)
    assert query["token_type"] == ["bearer"]
    assert query["access_token"][0]

    user = run_async(
        db_session.execute(
            select(User).where(User.email == "yandex-new@example.com")
        )
    ).scalar_one()
    assert user.yandex_id == "123456"
    assert user.is_verified is True


@patch("app.routes.auth.fetch_yandex_profile", new_callable=AsyncMock)
@patch("app.routes.auth.exchange_code_for_token", new_callable=AsyncMock)
def test_yandex_callback_links_existing_email_user(
    mock_exchange, mock_profile, client, db_session
):
    async def _create_user():
        user = User(
            username="existing",
            name="Existing User",
            email="existing@example.com",
            password="hashed",
            role="user",
            registered=datetime.now(),
        )
        db_session.add(user)
        await db_session.commit()
        await db_session.refresh(user)
        return user

    run_async(_create_user())

    mock_exchange.return_value = "ya-access-token"
    mock_profile.return_value = {
        "id": "654321",
        "default_email": "existing@example.com",
        "login": "existing",
    }

    state = "link-state"
    run_async(store_oauth_state(state, {"next": "/forum"}))

    resp = client.get(
        f"/api/auth/yandex/callback?code=auth-code&state={state}",
        follow_redirects=False,
    )
    assert resp.status_code == 302
    query = parse_qs(urlparse(resp.headers["location"]).query)
    assert query["next"] == ["/forum"]

    user = run_async(
        db_session.execute(
            select(User).where(User.email == "existing@example.com")
        )
    ).scalar_one()
    assert user.yandex_id == "654321"


def test_yandex_callback_invalid_state(client):
    resp = client.get(
        "/api/auth/yandex/callback?code=auth-code&state=invalid",
        follow_redirects=False,
    )
    assert resp.status_code == 302
    assert "error=" in resp.headers["location"]
