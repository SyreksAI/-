"""Smoke tests against running DubPar stack (inside Docker network)."""
import os
import sys
import time

import httpx

BASE = os.getenv("SMOKE_BASE_URL", "http://dubpar-web")
BACKEND_HEALTH_URL = os.getenv("SMOKE_BACKEND_HEALTH_URL", "http://backend:8000/health")
ADMIN_EMAIL = os.getenv("SMOKE_ADMIN_EMAIL")
ADMIN_PASSWORD = os.getenv("SMOKE_ADMIN_PASSWORD")
WAIT_TIMEOUT_SEC = int(os.getenv("SMOKE_WAIT_TIMEOUT", "60"))


def check(name: str, ok: bool, detail: str = "") -> bool:
    status = "OK" if ok else "FAIL"
    msg = f"[{status}] {name}"
    if detail:
        msg += f" — {detail}"
    print(msg)
    return ok


def wait_for_backend(client: httpx.Client) -> bool:
    deadline = time.time() + WAIT_TIMEOUT_SEC
    while time.time() < deadline:
        try:
            r = client.get(BACKEND_HEALTH_URL, timeout=3)
            if r.status_code == 200 and r.json().get("status") == "ok":
                return True
        except httpx.HTTPError:
            pass
        time.sleep(1)
    return False


def main() -> int:
    passed = 0
    failed = 0
    token = None

    with httpx.Client(timeout=15.0, headers={"Accept": "application/json"}) as client:

        if not wait_for_backend(client):
            print("[FAIL] Backend readiness — timeout")
            return 1
        print("[OK] Backend readiness")

        tests = []

        r = client.get(f"{BASE}/", timeout=15)
        tests.append(check("Frontend /", r.status_code == 200, str(r.status_code)))

        r = client.get(f"{BASE}/privacy", timeout=15)
        tests.append(check("Privacy page", r.status_code == 200))

        r = client.get(f"{BASE}/terms", timeout=15)
        tests.append(check("Terms page", r.status_code == 200))

        r = client.get(f"{BASE}/about", timeout=15)
        tests.append(check("About page", r.status_code == 200))

        r = client.get(f"{BASE}/docs", timeout=15)
        tests.append(check("API docs", r.status_code == 200))

        if ADMIN_EMAIL and ADMIN_PASSWORD:
            r = client.post(
                f"{BASE}/api/auth/admin-login",
                json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
                timeout=15,
            )
            if r.status_code == 200 and r.json().get("access_token"):
                token = r.json()["access_token"]
                role = r.json().get("user", {}).get("role")
                tests.append(check("Admin login", role in ("admin", "moderator"), f"role={role}"))
            else:
                tests.append(check("Admin login", False, f"status={r.status_code}"))

            if token:
                headers = {"Authorization": f"Bearer {token}"}
                r = client.get(f"{BASE}/api/auth/me", headers=headers, timeout=15)
                tests.append(check("Auth /me", r.status_code == 200 and r.json().get("email") == ADMIN_EMAIL))

                r = client.get(f"{BASE}/api/users/", headers=headers, timeout=15)
                tests.append(check("Users list", r.status_code == 200 and len(r.json()) >= 1, f"count={len(r.json())}"))

                r = client.get(f"{BASE}/api/users/search?q=stas", headers=headers, timeout=15)
                found = any(u.get("username") == "stas" for u in r.json())
                tests.append(check("User search", r.status_code == 200 and found))

            r = client.post(
                f"{BASE}/api/auth/login",
                json={"email": ADMIN_EMAIL, "password": "WrongPass1!"},
                timeout=15,
            )
            tests.append(check("Wrong password -> 401", r.status_code == 401, str(r.status_code)))
        else:
            print("[SKIP] Admin auth tests — set SMOKE_ADMIN_EMAIL and SMOKE_ADMIN_PASSWORD")

        r = client.post(
            f"{BASE}/api/auth/register",
            json={
                "name": "Test",
                "username": "smokeuser999",
                "email": "smoke999@example.com",
                "password": "Test1234!",
                "recaptcha_token": "test",
                "accept_privacy_policy": False,
                "accept_data_processing": True,
                "accept_public_offer": True,
            },
            timeout=15,
        )
        tests.append(check("Register without consents -> 422", r.status_code == 422, str(r.status_code)))

        for ok in tests:
            if ok:
                passed += 1
            else:
                failed += 1

    print(f"\nResult: {passed} passed, {failed} failed")
    return 0 if failed == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
