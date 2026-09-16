"""Утилита: проверка пользователей и сброс пароля.

Примеры:
  python -m app.manage_auth list
  python -m app.manage_auth hash-stats
  python -m app.manage_auth reset --email user@example.com --password 'NewPass123!'
"""
from __future__ import annotations

import argparse
import sys
from collections import Counter

from sqlalchemy import func

from app.database import SessionLocal
from app.models import User
from app.password_utils import get_password_validation_error, hash_password, identify_hash_scheme
from app.routes.auth import authenticate_user


def list_users() -> int:
    db = SessionLocal()
    try:
        users = db.query(User).order_by(User.id).all()
        print(f"Всего пользователей: {len(users)}")
        for user in users:
            scheme = identify_hash_scheme(user.password)
            print(
                f"  id={user.id} username={user.username} email={user.email} "
                f"role={user.role} hash={scheme}"
            )
        return 0
    finally:
        db.close()


def hash_stats() -> int:
    db = SessionLocal()
    try:
        users = db.query(User).all()
        counts = Counter(identify_hash_scheme(user.password) for user in users)
        total = len(users)
        print(f"Всего пользователей: {total}")
        for scheme in ("argon2", "bcrypt", "pbkdf2_sha256", "INVALID", "UNKNOWN"):
            print(f"  {scheme}: {counts.get(scheme, 0)}")
        leftover = counts.get("bcrypt", 0) + counts.get("pbkdf2_sha256", 0)
        if leftover == 0 and total > 0:
            print("Все хеши на argon2 — bcrypt/pbkdf2 legacy можно убирать из password_utils.")
        elif leftover:
            print(
                f"Ещё {leftover} legacy-хеш(ей). После логина пользователей они "
                "апгрейдятся на argon2 автоматически."
            )
        return 0
    finally:
        db.close()


def reset_password(email: str, password: str) -> int:
    db = SessionLocal()
    try:
        user = (
            db.query(User)
            .filter(func.lower(User.email) == email.strip().lower())
            .first()
        )
        if not user:
            print(f"Пользователь не найден: {email}", file=sys.stderr)
            return 1

        if password_error := get_password_validation_error(password):
            print(password_error, file=sys.stderr)
            return 1

        user.password = hash_password(password)
        db.commit()

        if authenticate_user(db, user.email, password):
            print(f"Пароль обновлён для {user.email} (id={user.id}, role={user.role})")
            return 0

        print("Пароль записан, но проверка входа не прошла", file=sys.stderr)
        return 2
    finally:
        db.close()


def main() -> int:
    parser = argparse.ArgumentParser(description="Управление пользователями (auth)")
    sub = parser.add_subparsers(dest="command", required=True)

    sub.add_parser("list", help="Список пользователей")
    sub.add_parser("hash-stats", help="Статистика схем хешей паролей")

    reset_parser = sub.add_parser("reset", help="Сбросить пароль пользователя")
    reset_parser.add_argument("--email", required=True)
    reset_parser.add_argument("--password", required=True)

    args = parser.parse_args()

    if args.command == "list":
        return list_users()
    if args.command == "hash-stats":
        return hash_stats()
    if args.command == "reset":
        return reset_password(args.email, args.password)
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
