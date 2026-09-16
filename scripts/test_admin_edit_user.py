import os

import httpx

BASE = os.getenv("SMOKE_BASE_URL", "http://localhost:8080")
ADMIN_EMAIL = os.getenv("SMOKE_ADMIN_EMAIL")
ADMIN_PASSWORD = os.getenv("SMOKE_ADMIN_PASSWORD")

if not ADMIN_EMAIL or not ADMIN_PASSWORD:
    raise SystemExit("Set SMOKE_ADMIN_EMAIL and SMOKE_ADMIN_PASSWORD")

with httpx.Client(timeout=15.0) as client:
    r = client.post(
        f"{BASE}/api/auth/admin-login",
        json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
    )
    r.raise_for_status()
    token = r.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}
    users = client.get(f"{BASE}/api/users/", headers=headers).json()
    other = next((u for u in users if u.get("role") != "admin"), None)
    if not other:
        print("SKIP: no non-admin user")
    else:
        resp = client.put(
            f"{BASE}/api/users/{other['id']}",
            headers=headers,
            json={"name": other["name"]},
        )
        print(f"edit user {other['id']}: {resp.status_code}")
