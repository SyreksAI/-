from datetime import datetime

import pytest
from sqlalchemy import select

from app.time_utils import format_registered
from app.models import User
from tests.conftest import run_async


def test_public_settings_exposes_turnstile_flags(client):
    response = client.get("/api/settings/public")
    assert response.status_code == 200
    data = response.json()
    assert "turnstileSiteKey" in data
    assert "turnstileRequired" in data
    assert isinstance(data["turnstileRequired"], bool)


def test_format_registered_handles_none():
    assert format_registered(None) == ""


def test_format_registered_formats_datetime():
    assert format_registered(datetime(2026, 3, 7, 12, 0, 0)) == "07.03.2026"


def test_format_registered_strips_time_from_iso_string():
    assert format_registered("2026-03-07T05:56:32.329190") == "07.03.2026"
    assert format_registered("2026-03-07 05:56:32.32919") == "07.03.2026"


def test_login_success(client, test_user, monkeypatch):
    sent = {"login": False}

    def fake_login_notice(*args, **kwargs):
        sent["login"] = True
        return True

    monkeypatch.setattr("app.routes.auth.send_login_notice_email", fake_login_notice)

    response = client.post(
        "/api/auth/login",
        json={"email": "test@example.com", "password": "Test1234!"},
    )
    assert response.status_code == 200
    data = response.json()
    assert "access_token" in data
    assert data["user"]["username"] == "testuser"
    assert sent["login"] is True


def test_get_user_profile(client, test_user, auth_headers):
    response = client.get(f"/api/users/{test_user.id}", headers=auth_headers)
    assert response.status_code == 200
    data = response.json()
    assert data["username"] == "testuser"
    assert isinstance(data["registered"], str)


def test_update_user_profile(client, test_user, auth_headers):
    response = client.put(
        f"/api/users/{test_user.id}",
        headers=auth_headers,
        json={
            "name": "Updated Name",
            "username": " updated_user ",
            "email": " updated@example.com ",
        },
    )
    assert response.status_code == 200
    data = response.json()
    assert data["name"] == "Updated Name"
    assert data["username"] == "updated_user"
    assert data["email"] == "updated@example.com"


def test_update_user_profile_password(client, test_user, auth_headers):
    profile = client.get(f"/api/users/{test_user.id}", headers=auth_headers).json()
    response = client.put(
        f"/api/users/{test_user.id}",
        headers=auth_headers,
        json={"password": "NewPass123!"},
    )
    assert response.status_code == 200

    login_response = client.post(
        "/api/auth/login",
        json={"email": profile["email"], "password": "NewPass123!"},
    )
    assert login_response.status_code == 200


REGISTER_PAYLOAD = {
    "name": "New User",
    "username": "newuser",
    "email": "new@example.com",
    "password": "Test1234!",
    "recaptcha_token": "test-token",
    "accept_privacy_policy": True,
    "accept_data_processing": True,
    "accept_public_offer": True,
    "legal_docs_version": "07.09.2026",
}


def test_register_requires_legal_consents(client, monkeypatch):
    monkeypatch.setattr("app.routes.auth.verify_turnstile", lambda token: True)

    response = client.post(
        "/api/auth/register",
        json={
            **REGISTER_PAYLOAD,
            "accept_privacy_policy": False,
            "accept_data_processing": True,
            "accept_public_offer": True,
        },
    )
    assert response.status_code == 422


def test_register_saves_legal_consents(client, db_session, monkeypatch):
    monkeypatch.setattr("app.routes.auth.verify_turnstile", lambda token: True)
    sent = {"registration": False}

    def fake_registration_notice(*args, **kwargs):
        sent["registration"] = True
        return True

    monkeypatch.setattr("app.routes.auth.send_registration_notice_email", fake_registration_notice)

    response = client.post("/api/auth/register", json=REGISTER_PAYLOAD)
    assert response.status_code == 200
    assert "access_token" in response.json()
    assert sent["registration"] is True

    user = run_async(
        db_session.execute(select(User).where(User.email == "new@example.com"))
    ).scalar_one_or_none()
    assert user is not None
    assert user.legal_consents["privacy_policy"]["accepted"] is True
    assert user.legal_consents["data_processing"]["accepted"] is True
    assert user.legal_consents["public_offer"]["accepted"] is True
    assert user.legal_consents["privacy_policy"]["version"] == "07.09.2026"
