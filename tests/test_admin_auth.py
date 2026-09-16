"""Admin RBAC and session invalidation tests."""
from datetime import datetime

import pytest

from app.jwt_auth import _memory_sessions, _memory_tokens, create_auth_session, is_session_active
from app.models import AdminLog, User
from app.password_utils import hash_password


def _login(client, email, password):
    return client.post("/api/auth/login", json={"email": email, "password": password})


@pytest.fixture
def admin_user(db_session):
    async def _create():
        user = User(
            username="adminuser",
            name="Admin User",
            email="admin@example.com",
            password=hash_password("Admin1234!"),
            role="admin",
            registered=datetime.now(),
        )
        db_session.add(user)
        await db_session.commit()
        await db_session.refresh(user)
        return user

    from tests.conftest import run_async

    return run_async(_create())


@pytest.fixture
def superadmin_user(db_session):
    async def _create():
        user = User(
            username="superadmin",
            name="Super Admin",
            email="super@example.com",
            password=hash_password("Super1234!"),
            role="superadmin",
            registered=datetime.now(),
        )
        db_session.add(user)
        await db_session.commit()
        await db_session.refresh(user)
        return user

    from tests.conftest import run_async

    return run_async(_create())


@pytest.fixture
def admin_headers(client, admin_user):
    resp = _login(client, admin_user.email, "Admin1234!")
    assert resp.status_code == 200
    token = resp.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def user_headers(client, test_user):
    resp = _login(client, test_user.email, "Test1234!")
    assert resp.status_code == 200
    token = resp.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def test_user_cannot_access_admin_users(client, user_headers):
    resp = client.get("/api/admin/users", headers=user_headers)
    assert resp.status_code == 403


def test_admin_can_list_users(client, admin_headers):
    resp = client.get("/api/admin/users", headers=admin_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert "items" in data
    assert data["total"] >= 1


def test_admin_role_change_writes_audit(client, admin_headers, test_user, db_session):
    resp = client.patch(
        f"/api/admin/users/{test_user.id}/role",
        json={"role": "moderator"},
        headers=admin_headers,
    )
    assert resp.status_code == 200

    from tests.conftest import run_async

    async def _count_logs():
        from sqlalchemy import select

        result = await db_session.execute(select(AdminLog))
        return result.scalars().all()

    logs = run_async(_count_logs())
    assert any(log.action == "user.role_change" for log in logs)


def test_user_cannot_patch_own_role(client, user_headers, test_user):
    resp = client.patch(
        f"/api/admin/users/{test_user.id}/role",
        json={"role": "admin"},
        headers=user_headers,
    )
    assert resp.status_code == 403


def test_banned_admin_token_stops_working(client, admin_headers, db_session):
    from tests.conftest import run_async

    async def _create_target_admin():
        user = User(
            username="admin2",
            name="Admin Two",
            email="admin2@example.com",
            password=hash_password("Admin1234!"),
            role="admin",
            registered=datetime.now(),
        )
        db_session.add(user)
        await db_session.commit()
        await db_session.refresh(user)
        return user

    target = run_async(_create_target_admin())
    target_headers_resp = _login(client, target.email, "Admin1234!")
    target_headers = {"Authorization": f"Bearer {target_headers_resp.json()['access_token']}"}

    ban_resp = client.post(f"/api/admin/users/{target.id}/ban", headers=admin_headers)
    assert ban_resp.status_code == 200

    me_resp = client.get("/api/auth/me", headers=target_headers)
    assert me_resp.status_code in (401, 403)


def test_superadmin_cannot_be_demoted_by_admin(client, admin_headers, superadmin_user):
    resp = client.patch(
        f"/api/admin/users/{superadmin_user.id}/role",
        json={"role": "user"},
        headers=admin_headers,
    )
    assert resp.status_code == 403


def test_admin_cannot_change_role_via_users_put(client, admin_headers, test_user):
    resp = client.put(
        f"/api/users/{test_user.id}",
        json={"role": "superadmin"},
        headers=admin_headers,
    )
    assert resp.status_code == 403


def test_reset_password_token_single_use(client, test_user):
    from app.session_store import create_password_reset_token
    from tests.conftest import run_async

    token = run_async(create_password_reset_token(test_user.id))
    first = client.post(
        "/api/auth/reset-password",
        json={"token": token, "new_password": "NewPass1234!"},
    )
    assert first.status_code == 200

    second = client.post(
        "/api/auth/reset-password",
        json={"token": token, "new_password": "AnotherPass1234!"},
    )
    assert second.status_code == 400
