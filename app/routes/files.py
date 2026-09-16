"""Authenticated file delivery with Range support."""
from __future__ import annotations

from typing import AsyncIterator, Optional
from urllib.parse import quote, unquote

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import Response, StreamingResponse
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession

from app.attachment_service import get_attachment_for_user
from app.config import settings
from app.database import get_db
from app.dependencies import get_ws_current_user
from app.models import User
from app.storage import get_media_storage

router = APIRouter()
security = HTTPBearer(auto_error=False)

CHUNK = 1024 * 256


def _content_disposition(filename: str, *, inline: bool = True) -> str:
    """ASCII-safe header; HTTP headers must be latin-1 (RFC 5987 for UTF-8 names)."""
    kind = "inline" if inline else "attachment"
    ascii_name = "".join(
        ch if ch.isascii() and ch not in {'"', "\\"} else "_"
        for ch in (filename or "file")
    ) or "file"
    utf8_name = quote(filename or "file", safe="")
    return f'{kind}; filename="{ascii_name}"; filename*=UTF-8\'\'{utf8_name}'


async def get_file_user(
    request: Request,
    token: Optional[str] = Query(None),
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
    db: AsyncSession = Depends(get_db),
) -> User:
    cookie_token = request.cookies.get(settings.MEDIA_ACCESS_COOKIE_NAME)
    if cookie_token:
        cookie_token = unquote(cookie_token)
    raw = (credentials.credentials if credentials else None) or token or cookie_token
    if not raw:
        raise HTTPException(status_code=401, detail="Необходима аутентификация")
    user = await get_ws_current_user(raw, db)
    if not user:
        raise HTTPException(status_code=401, detail="Недействительный токен")
    return user


def _parse_range(range_header: str, file_size: int) -> tuple[int, int] | None:
    if not range_header.startswith("bytes="):
        return None
    spec = range_header[6:].strip()
    if "," in spec:
        return None
    if spec.startswith("-"):
        suffix = int(spec[1:])
        start = max(file_size - suffix, 0)
        return start, file_size - 1
    start_str, end_str = spec.split("-", 1)
    start = int(start_str) if start_str else 0
    end = int(end_str) if end_str else file_size - 1
    if start > end or start >= file_size:
        return None
    return start, min(end, file_size - 1)


async def _stream_storage(key: str, start: int, end: int) -> AsyncIterator[bytes]:
    media = get_media_storage()
    for chunk in media.iter_bytes(key, start, end):
        yield chunk


@router.get("/{attachment_id}")
async def get_file(
    attachment_id: str,
    request: Request,
    current_user: User = Depends(get_file_user),
    db: AsyncSession = Depends(get_db),
):
    att = await get_attachment_for_user(db, attachment_id, current_user)
    media = get_media_storage()
    if not media.exists(att.storage_key):
        raise HTTPException(status_code=404, detail="Файл не найден в хранилище")

    file_size = media.get_size(att.storage_key)
    etag = media.etag(att.storage_key)
    if request.headers.get("if-none-match") == etag:
        return Response(status_code=304)

    range_header = request.headers.get("range")
    parsed = _parse_range(range_header, file_size) if range_header else None
    headers = {
        "Accept-Ranges": "bytes",
        "Cache-Control": "public, max-age=31536000, immutable",
        "ETag": etag,
        "Content-Disposition": _content_disposition(att.original_name),
    }

    if parsed:
        start, end = parsed
        headers["Content-Range"] = f"bytes {start}-{end}/{file_size}"
        headers["Content-Length"] = str(end - start + 1)
        return StreamingResponse(
            _stream_storage(att.storage_key, start, end),
            status_code=206,
            media_type=att.mime,
            headers=headers,
        )

    headers["Content-Length"] = str(file_size)
    return StreamingResponse(
        _stream_storage(att.storage_key, 0, file_size - 1),
        media_type=att.mime,
        headers=headers,
    )


@router.get("/{attachment_id}/thumb")
async def get_thumbnail(
    attachment_id: str,
    request: Request,
    current_user: User = Depends(get_file_user),
    db: AsyncSession = Depends(get_db),
):
    att = await get_attachment_for_user(db, attachment_id, current_user)
    if not att.thumb_key:
        raise HTTPException(status_code=404, detail="Превью недоступно")

    media = get_media_storage()
    if not media.exists(att.thumb_key):
        raise HTTPException(status_code=404, detail="Превью не найдено")

    file_size = media.get_size(att.thumb_key)
    etag = media.etag(att.thumb_key)
    if request.headers.get("if-none-match") == etag:
        return Response(status_code=304)

    return StreamingResponse(
        _stream_storage(att.thumb_key, 0, file_size - 1),
        media_type="image/jpeg",
        headers={
            "Cache-Control": "public, max-age=31536000, immutable",
            "ETag": etag,
            "Content-Length": str(file_size),
        },
    )
