#!/usr/bin/env python3
"""Diagnose user password hashes and optionally reset a password."""
import argparse
import sys

from app.database import SessionLocal
from app.models import User
from app.password_utils import hash_password, identify_hash_scheme
from app.routes.auth import authenticate_user


def diagnose():
    db = SessionLocal()
    try:
        users = db.query(User).order_by(User.id).all()
        print(f"Total users: {len(users)}")
        for user in users:
            stored = user.password or ""
            scheme = identify_hash_scheme(stored)
            print(
                f"- id={user.id} username={user.username!r} email={user.email!r} "
                f"role={user.role} scheme={scheme} hash_len={len(stored)}"
            )
    finally:
        db.close()


def reset_password(email: str, new_password: str):
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.email == email).first()
        if not user:
            print(f"User not found: {email}", file=sys.stderr)
            return 1
        user.password = hash_password(new_password)
        db.commit()
        ok = authenticate_user(db, email, new_password)
        print(f"Password reset for {email} (id={user.id}): {'OK' if ok else 'FAILED'}")
        return 0 if ok else 2
    finally:
        db.close()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--reset", metavar="EMAIL")
    parser.add_argument("--password", metavar="NEW_PASSWORD")
    args = parser.parse_args()

    if args.reset:
        if not args.password:
            print("--password is required with --reset", file=sys.stderr)
            return 1
        return reset_password(args.reset, args.password)

    diagnose()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
