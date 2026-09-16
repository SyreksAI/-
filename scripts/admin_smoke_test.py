"""Smoke tests for DubPar admin panel API and SPA routes."""
import os
import sys

import httpx

BASE = os.getenv("SMOKE_BASE_URL", "http://localhost:8080")
ADMIN_EMAIL = os.getenv("SMOKE_ADMIN_EMAIL")
ADMIN_PASSWORD = os.getenv("SMOKE_ADMIN_PASSWORD")


def check(name: str, ok: bool, detail: str = "") -> bool:
    status = "OK" if ok else "FAIL"
    msg = f"[{status}] {name}"
    if detail:
        msg += f" — {detail}"
    print(msg)
    return ok


def main() -> int:
    if not ADMIN_EMAIL or not ADMIN_PASSWORD:
        print("[FAIL] Set SMOKE_ADMIN_EMAIL and SMOKE_ADMIN_PASSWORD")
        return 1

    passed = failed = 0
    token = None
    headers = {}

    with httpx.Client(timeout=15.0, headers={"Accept": "application/json, text/html"}) as client:

        # --- Frontend SPA routes (nginx serves index.html) ---
        for path in (
            "/admin/login",
            "/admin",
            "/admin/users",
            "/admin/settings",
            "/admin/modules",
            "/admin/support",
        ):
            r = client.get(f"{BASE}{path}", timeout=15)
            ok = r.status_code == 200 and ("<!DOCTYPE html>" in r.text or "<html" in r.text.lower())
            if check(f"Page {path}", ok, str(r.status_code)):
                passed += 1
            else:
                failed += 1

        # --- Admin auth ---
        r = client.post(
            f"{BASE}/api/auth/admin-login",
            json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
            timeout=15,
        )
        if r.status_code == 200 and r.json().get("access_token"):
            token = r.json()["access_token"]
            role = r.json().get("user", {}).get("role")
            if check("Admin login API", role in ("admin", "moderator"), f"role={role}"):
                passed += 1
            else:
                failed += 1
        else:
            if check("Admin login API", False, f"status={r.status_code}"):
                passed += 1
            else:
                failed += 1
            print("\nResult: cannot continue without admin token")
            return 1

        headers = {"Authorization": f"Bearer {token}"}

        # --- Core admin APIs ---
        api_tests = [
            ("GET /api/auth/me", "get", "/api/auth/me", None, lambda r: r.status_code == 200 and r.json().get("role") in ("admin", "moderator")),
            ("GET /api/users/", "get", "/api/users/", None, lambda r: r.status_code == 200 and isinstance(r.json(), list)),
            ("GET /api/settings/", "get", "/api/settings/", None, lambda r: r.status_code == 200 and isinstance(r.json(), dict)),
            ("GET /api/study/technologies", "get", "/api/study/technologies", None, lambda r: r.status_code == 200 and isinstance(r.json(), list)),
            ("GET /api/support/", "get", "/api/support/", None, lambda r: r.status_code == 200 and isinstance(r.json(), list)),
            ("GET /api/categories/", "get", "/api/categories/", None, lambda r: r.status_code == 200 and isinstance(r.json(), list)),
        ]

        for name, method, path, body, validator in api_tests:
            if method == "get":
                r = client.get(f"{BASE}{path}", headers=headers, timeout=15)
            else:
                r = client.post(f"{BASE}{path}", headers=headers, json=body, timeout=15)
            ok = validator(r)
            detail = str(r.status_code)
            if not ok and r.headers.get("content-type", "").startswith("application/json"):
                try:
                    detail += f" {r.json()}"
                except Exception:
                    pass
            if check(name, ok, detail):
                passed += 1
            else:
                failed += 1

        # --- Settings write (admin only) ---
        r = client.get(f"{BASE}/api/settings/", headers=headers, timeout=15)
        settings = r.json() if r.status_code == 200 else {}
        test_key = "_admin_smoke_test"
        payload = {**settings, test_key: "ok"}
        r = client.put(f"{BASE}/api/settings/", headers=headers, json=payload, timeout=15)
        if check("PUT /api/settings/", r.status_code == 200, str(r.status_code)):
            passed += 1
        else:
            failed += 1

        # --- Unauthorized access without token ---
        r = client.get(f"{BASE}/api/support/", timeout=15)
        if check("Support without token -> 401", r.status_code == 401, str(r.status_code)):
            passed += 1
        else:
            failed += 1

        # --- Non-admin cannot admin-login with wrong role user (if exists) ---
        r = client.post(
            f"{BASE}/api/auth/admin-login",
            json={"email": "nonexistent@example.com", "password": "WrongPass1!"},
            timeout=15,
        )
        if check("Bad admin login -> 401", r.status_code == 401, str(r.status_code)):
            passed += 1
        else:
            failed += 1

    print(f"\nResult: {passed} passed, {failed} failed")
    return 0 if failed == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
