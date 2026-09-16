"""Smoke test: Range GET for attachment with Cyrillic original_name."""
from __future__ import annotations

import asyncio
import sys

import httpx
from sqlalchemy import select

from app.database import AsyncSessionLocal
from app.jwt_auth import create_auth_session
from app.models import Attachment, User

ATTACHMENT_ID = sys.argv[1] if len(sys.argv) > 1 else "508690a44d044bb6bf5bc6dadfa2c576"


async def main() -> int:
    async with AsyncSessionLocal() as db:
        att = (
            await db.execute(select(Attachment).where(Attachment.id == ATTACHMENT_ID))
        ).scalar_one_or_none()
        if not att:
            print("attachment not found:", ATTACHMENT_ID)
            return 1
        user = (
            await db.execute(select(User).where(User.id == att.uploader_id))
        ).scalar_one()
        token, _, _ = await create_auth_session(user.id, user.role or "user")
        print("file:", att.original_name[:70])
        print("mime:", att.mime, "size:", att.size)

    headers = {"Authorization": f"Bearer {token}", "Range": "bytes=0-1023"}
    async with httpx.AsyncClient(base_url="http://127.0.0.1:8000", timeout=20.0) as client:
        response = await client.get(f"/api/files/{ATTACHMENT_ID}", headers=headers)

    cd = response.headers.get("content-disposition", "")
    print("status:", response.status_code)
    print("bytes:", len(response.content))
    print("content-range:", response.headers.get("content-range"))
    print("disposition utf8:", "filename*=" in cd)

    ok = response.status_code == 206 and len(response.content) == 1024 and "filename*=" in cd
    return 0 if ok else 2


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
