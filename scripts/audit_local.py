"""Local smoke audit for running DubPar stack (no credentials required)."""
from __future__ import annotations

import os
import sys

import httpx

BASE = os.getenv("AUDIT_BASE_URL", "http://localhost:8080")


def check(name: str, ok: bool, detail: str = "") -> bool:
    status = "OK" if ok else "FAIL"
    line = f"[{status}] {name}"
    if detail:
        line += f" — {detail}"
    print(line)
    return ok


def main() -> int:
    passed = 0
    total = 0

    with httpx.Client(
        base_url=BASE,
        timeout=20.0,
        follow_redirects=False,
        trust_env=False,
    ) as client:
        tests = [
            ("Health", lambda: client.get("/health")),
            ("Public settings", lambda: client.get("/api/settings/public")),
        ]
        for name, fn in tests:
            total += 1
            r = fn()
            detail = str(r.status_code)
            if name == "Public settings" and r.status_code == 200:
                data = r.json()
                detail += f"; yandex={data.get('yandexOAuthEnabled')}; reg={data.get('registrationEnabled')}"
            if check(name, r.status_code == 200, detail):
                passed += 1

        for path in (
            "/",
            "/login",
            "/register",
            "/forum",
            "/profile",
            "/privacy",
            "/terms",
            "/about",
            "/support",
            "/admin/login",
            "/auth/oauth",
        ):
            total += 1
            r = client.get(path)
            if check(f"Page {path}", r.status_code == 200, str(r.status_code)):
                passed += 1

        total += 1
        r = client.get("/api/auth/yandex/login?next=/&origin=http://localhost:8080")
        loc = r.headers.get("location", "")
        if check(
            "Yandex OAuth start",
            r.status_code == 302 and "oauth.yandex.ru" in loc,
            loc[:120],
        ):
            passed += 1

        email = os.getenv("AUDIT_EMAIL")
        password = os.getenv("AUDIT_PASSWORD")
        if email and password:
            total += 1
            r = client.post("/api/auth/login", json={"email": email, "password": password})
            if r.status_code != 200:
                check("Login", False, f"status={r.status_code} {r.text[:160]}")
            else:
                data = r.json()
                token = data.get("access_token")
                user = data.get("user", {})
                headers = {"Authorization": f"Bearer {token}"}
                if check(
                    "Login",
                    bool(token),
                    f"user={user.get('username')} role={user.get('role')}",
                ):
                    passed += 1

                authed = [
                    "/api/auth/me",
                    "/api/study/technologies",
                    "/api/progress/my-progress",
                    "/api/forum/categories",
                    "/api/groups/my",
                    "/api/messages/history/general",
                ]
                for path in authed:
                    total += 1
                    r = client.get(path, headers=headers)
                    detail = str(r.status_code)
                    if r.status_code >= 400:
                        try:
                            detail += f" {r.json().get('detail', '')}"
                        except Exception:
                            detail += f" {r.text[:120]}"
                    if check(f"API {path}", r.status_code < 400, detail):
                        passed += 1
        else:
            print("[SKIP] Authenticated API checks — set AUDIT_EMAIL and AUDIT_PASSWORD")

    failed = total - passed
    print(f"\n=== SUMMARY: {passed}/{total} passed, {failed} failed ===")
    return 0 if failed == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
