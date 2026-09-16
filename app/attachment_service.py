"""Upload processing, metadata extraction, serialization."""
from __future__ import annotations

import io
import logging
import subprocess
import uuid
from pathlib import Path

from fastapi import HTTPException
from sqlalchemy import select

try:
    from PIL import Image
except ImportError:  # pragma: no cover - optional in slim Docker images
    Image = None
from sqlalchemy.ext.asyncio import AsyncSession

from app.chat_utils import user_has_chat_access
from app.config import settings
from app.file_magic import ALLOWED_MIMES, detect_mime, max_size_for_kind, mime_to_kind
from app.models import Attachment, User
from app.storage import get_media_storage

logger = logging.getLogger(__name__)

THUMB_MAX = 480


def _safe_original_name(name: str | None) -> str:
    base = Path(name or "file").name
    return base[:255] if base else "file"


def _extension_for_mime(mime: str) -> str:
    mapping = {
        "image/jpeg": ".jpg",
        "image/png": ".png",
        "image/gif": ".gif",
        "image/webp": ".webp",
        "video/mp4": ".mp4",
        "video/webm": ".webm",
        "video/quicktime": ".mov",
        "audio/mpeg": ".mp3",
        "audio/wav": ".wav",
        "audio/ogg": ".ogg",
        "audio/mp4": ".m4a",
        "application/pdf": ".pdf",
        "text/plain": ".txt",
    }
    return mapping.get(mime, ".bin")


async def read_upload_with_limit(file, max_size: int) -> bytes:
    chunks: list[bytes] = []
    total = 0
    while True:
        chunk = await file.read(1024 * 1024)
        if not chunk:
            break
        total += len(chunk)
        if total > max_size:
            raise HTTPException(
                status_code=413,
                detail=f"Файл превышает лимит {max_size // (1024 * 1024)} MB",
            )
        chunks.append(chunk)
    return b"".join(chunks)


def _image_meta_and_thumb(data: bytes, src_path: Path, thumb_path: Path) -> tuple[int | None, int | None]:
    width = height = None
    if Image is None:
        logger.warning("Pillow not installed — image thumbnails disabled")
        return width, height
    try:
        with Image.open(io.BytesIO(data)) as img:
            width, height = img.size
            img.thumbnail((THUMB_MAX, THUMB_MAX))
            if img.mode not in ("RGB", "L"):
                img = img.convert("RGB")
            thumb_path.parent.mkdir(parents=True, exist_ok=True)
            img.save(thumb_path, "JPEG", quality=85)
    except Exception as exc:
        logger.warning("Image thumb failed: %s", exc)
    return width, height


def _ffprobe_duration(path: Path) -> float | None:
    try:
        result = subprocess.run(
            [
                "ffprobe",
                "-v",
                "error",
                "-show_entries",
                "format=duration",
                "-of",
                "default=noprint_wrappers=1:nokey=1",
                str(path),
            ],
            capture_output=True,
            text=True,
            timeout=30,
            check=False,
        )
        if result.returncode == 0 and result.stdout.strip():
            return float(result.stdout.strip())
    except (FileNotFoundError, ValueError, subprocess.TimeoutExpired):
        pass
    return None


def _video_thumb_and_meta(path: Path, thumb_path: Path) -> tuple[int | None, int | None, float | None]:
    duration = _ffprobe_duration(path)
    width = height = None
    try:
        result = subprocess.run(
            [
                "ffprobe",
                "-v",
                "error",
                "-select_streams",
                "v:0",
                "-show_entries",
                "stream=width,height",
                "-of",
                "csv=s=x:p=0",
                str(path),
            ],
            capture_output=True,
            text=True,
            timeout=30,
            check=False,
        )
        if result.returncode == 0 and "x" in result.stdout:
            w, h = result.stdout.strip().split("x", 1)
            width, height = int(w), int(h)
    except (FileNotFoundError, ValueError, subprocess.TimeoutExpired):
        pass

    try:
        thumb_path.parent.mkdir(parents=True, exist_ok=True)
        subprocess.run(
            [
                "ffmpeg",
                "-y",
                "-i",
                str(path),
                "-ss",
                "00:00:01",
                "-vframes",
                "1",
                "-vf",
                f"scale={THUMB_MAX}:-1",
                str(thumb_path),
            ],
            capture_output=True,
            timeout=60,
            check=False,
        )
    except (FileNotFoundError, subprocess.TimeoutExpired):
        pass

    return width, height, duration


async def process_upload(
    db: AsyncSession,
    *,
    uploader: User,
    chat_id: str,
    data: bytes,
    original_name: str,
    caption: str | None = None,
    client_duration: float | None = None,
    client_width: int | None = None,
    client_height: int | None = None,
) -> Attachment:
    if not await user_has_chat_access(uploader.id, chat_id, db):
        raise HTTPException(status_code=403, detail="Доступ запрещен")

    media = get_media_storage()
    ext = Path(original_name).suffix.lower() or ".bin"
    mime = detect_mime(data[:512], ext)
    if not mime or mime not in ALLOWED_MIMES:
        raise HTTPException(status_code=400, detail="Тип файла не разрешен или не совпадает с содержимым")

    kind = mime_to_kind(mime)
    max_size = max_size_for_kind(kind, settings)
    if len(data) > max_size:
        raise HTTPException(
            status_code=413,
            detail=f"Файл превышает лимит {max_size // (1024 * 1024)} MB",
        )

    storage_key = media.generate_key(_extension_for_mime(mime))
    work_path = media.write_temp(data, _extension_for_mime(mime))
    thumb_path: Path | None = None

    width = height = None
    duration = None
    thumb_key = None

    try:
        if kind == "image":
            thumb_key = media.thumb_key_for(storage_key)
            thumb_path = media.temp_thumb_path()
            width, height = _image_meta_and_thumb(data, work_path, thumb_path)
        elif kind == "video":
            thumb_key = media.thumb_key_for(storage_key)
            thumb_path = media.temp_thumb_path()
            width, height, duration = _video_thumb_and_meta(work_path, thumb_path)
            if duration is None and client_duration is not None:
                duration = client_duration
            if width is None and client_width is not None:
                width = client_width
            if height is None and client_height is not None:
                height = client_height
        elif kind == "audio":
            duration = _ffprobe_duration(work_path)
            if duration is None and client_duration is not None:
                duration = client_duration

        media.put_bytes(storage_key, data)

        if thumb_key and thumb_path and thumb_path.is_file():
            media.put_bytes(thumb_key, thumb_path.read_bytes())
        elif thumb_key:
            thumb_key = None
    finally:
        work_path.unlink(missing_ok=True)
        if thumb_path and thumb_path.is_file():
            thumb_path.unlink(missing_ok=True)

    attachment = Attachment(
        id=uuid.uuid4().hex,
        message_id=None,
        uploader_id=uploader.id,
        chat_id=chat_id,
        kind=kind,
        mime=mime,
        size=len(data),
        width=width,
        height=height,
        duration=duration,
        storage_key=storage_key,
        thumb_key=thumb_key if thumb_key and media.exists(thumb_key) else None,
        original_name=_safe_original_name(original_name),
        caption=(caption or "").strip() or None,
    )
    db.add(attachment)
    await db.commit()
    await db.refresh(attachment)
    return attachment


async def link_attachments(
    db: AsyncSession,
    message_id: int,
    chat_id: str,
    uploader_id: int,
    attachment_ids: list[str],
) -> list[Attachment]:
    if not attachment_ids:
        return []

    rows = (
        await db.execute(
            select(Attachment).where(Attachment.id.in_(attachment_ids))
        )
    ).scalars().all()
    by_id = {att.id: att for att in rows}

    linked: list[Attachment] = []
    for att_id in attachment_ids:
        att = by_id.get(att_id)
        if not att:
            continue
        if att.uploader_id != uploader_id:
            raise HTTPException(status_code=403, detail="Вложение принадлежит другому пользователю")
        if att.chat_id != chat_id:
            raise HTTPException(status_code=400, detail="Вложение из другого чата")
        if att.message_id is not None and att.message_id != message_id:
            raise HTTPException(status_code=400, detail="Вложение уже привязано к сообщению")
        att.message_id = message_id
        linked.append(att)

    if len(linked) != len(attachment_ids):
        raise HTTPException(status_code=400, detail="Не все вложения найдены")

    await db.commit()
    return linked


async def get_attachment_for_user(
    db: AsyncSession,
    attachment_id: str,
    user: User,
) -> Attachment:
    att = (
        await db.execute(select(Attachment).where(Attachment.id == attachment_id))
    ).scalar_one_or_none()
    if not att:
        raise HTTPException(status_code=404, detail="Файл не найден")

    if att.uploader_id == user.id and att.message_id is None:
        return att

    if not await user_has_chat_access(user.id, att.chat_id, db):
        raise HTTPException(status_code=403, detail="Доступ запрещен")
    return att


def serialize_attachment(att: Attachment) -> dict:
    return {
        "id": att.id,
        "kind": att.kind,
        "mime": att.mime,
        "size": att.size,
        "width": att.width,
        "height": att.height,
        "duration": att.duration,
        "original_name": att.original_name,
        "url": f"/api/files/{att.id}",
        "thumb_url": f"/api/files/{att.id}/thumb" if att.thumb_key else None,
        # Legacy fields for existing UI
        "type": att.mime,
        "name": att.original_name,
        "isImage": att.kind == "image",
        "isVideo": att.kind == "video",
        "isAudio": att.kind == "audio",
    }


def attachments_to_legacy_files(attachments: list[Attachment]) -> list[dict]:
    return [serialize_attachment(a) for a in attachments]


async def load_message_attachments(db: AsyncSession, message_id: int) -> list[Attachment]:
    return (
        await db.execute(
            select(Attachment)
            .where(Attachment.message_id == message_id)
            .order_by(Attachment.created_at.asc(), Attachment.id.asc())
        )
    ).scalars().all()


async def load_attachments_for_messages(
    db: AsyncSession, message_ids: list[int]
) -> dict[int, list[Attachment]]:
    if not message_ids:
        return {}
    rows = (
        await db.execute(
            select(Attachment)
            .where(Attachment.message_id.in_(message_ids))
            .order_by(Attachment.created_at.asc(), Attachment.id.asc())
        )
    ).scalars().all()
    grouped: dict[int, list[Attachment]] = {}
    for att in rows:
        grouped.setdefault(att.message_id, []).append(att)
    return grouped


async def cleanup_orphan_upload(path: Path) -> None:
    try:
        if path.is_file():
            path.unlink()
    except OSError:
        pass
