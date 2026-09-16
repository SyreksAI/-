from datetime import datetime

from app.models import User
from app.password_utils import hash_password
from tests.conftest import run_async


def test_get_all_users(client, test_user, auth_headers):
    response = client.get("/api/users/", headers=auth_headers)
    assert response.status_code == 200
    users = response.json()
    assert isinstance(users, list)
    assert len(users) >= 1
    assert users[0]["username"] == "testuser"
    assert "is_online" in users[0]


def test_search_users_by_username_and_name(client, test_user, auth_headers, db_session):
    other = User(
        username="otheruser",
        name="Alice Search",
        email="other@example.com",
        password=hash_password("Test1234!"),
        role="student",
        registered=datetime.now(),
    )
    async def _add_other():
        db_session.add(other)
        await db_session.commit()

    run_async(_add_other())

    by_username = client.get("/api/users/search?q=other", headers=auth_headers)
    assert by_username.status_code == 200
    assert any(u["username"] == "otheruser" for u in by_username.json())

    by_name = client.get("/api/users/search?q=Alice", headers=auth_headers)
    assert by_name.status_code == 200
    assert any(u["name"] == "Alice Search" for u in by_name.json())

    self_excluded = client.get("/api/users/search?q=test", headers=auth_headers)
    assert all(u["id"] != test_user.id for u in self_excluded.json())

    short_query = client.get("/api/users/search?q=a", headers=auth_headers)
    assert short_query.status_code == 200
    assert short_query.json() == []
