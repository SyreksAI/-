"""Chat attachment upload — POST /api/chat/upload"""
from typing import Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession

from app.attachment_service import process_upload, read_upload_with_limit, serialize_attachment
from app.config import settings
from app.database import get_db
from app.dependencies import get_current_user
from app.file_magic import detect_mime, max_size_for_kind, mime_to_kind
from app.models import User

router = APIRouter()


@router.post("/upload")
async def upload_chat_file(
    file: UploadFile = File(...),
    chat_id: str = Form(...),
    caption: Optional[str] = Form(None),
    duration: Optional[float] = Form(None),
    width: Optional[int] = Form(None),
    height: Optional[int] = Form(None),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if not chat_id.strip():
        raise HTTPException(status_code=400, detail="chat_id обязателен")

    # Peek header for size limit before full read
    header = await file.read(512)
    await file.seek(0)
    ext = (file.filename or "file").rsplit(".", 1)[-1] if "." in (file.filename or "") else "bin"
    mime = detect_mime(header, f".{ext}") if header else None
    kind = mime_to_kind(mime) if mime else "file"
    max_size = max_size_for_kind(kind, settings)

    data = await read_upload_with_limit(file, max_size)
    attachment = await process_upload(
        db,
        uploader=current_user,
        chat_id=chat_id.strip(),
        data=data,
        original_name=file.filename or "file",
        caption=caption,
        client_duration=duration,
        client_width=width,
        client_height=height,
    )
    payload = serialize_attachment(attachment)
    payload["caption"] = attachment.caption
    return payload
