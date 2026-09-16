# app/routes/upload.py
import os
import shutil
import uuid
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile

from app.config import settings
from app.dependencies import get_current_user
from app.models import User

router = APIRouter()

UPLOAD_DIR = settings.UPLOAD_DIR
os.makedirs(UPLOAD_DIR, exist_ok=True)

ALLOWED_EXTENSIONS = {
    ".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp",
    ".mp4", ".webm", ".mov",
    ".mp3", ".wav", ".ogg", ".m4a",
    ".pdf", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx",
    ".txt", ".md", ".csv",
    ".zip", ".rar", ".7z",
}

MIME_TYPES = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".bmp": "image/bmp",
    ".mp4": "video/mp4",
    ".webm": "video/webm",
    ".mov": "video/quicktime",
    ".mp3": "audio/mpeg",
    ".wav": "audio/wav",
    ".ogg": "audio/ogg",
    ".m4a": "audio/mp4",
    ".pdf": "application/pdf",
    ".doc": "application/msword",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".xls": "application/vnd.ms-excel",
    ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ".ppt": "application/vnd.ms-powerpoint",
    ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    ".txt": "text/plain",
    ".md": "text/markdown",
    ".csv": "text/csv",
    ".zip": "application/zip",
    ".rar": "application/x-rar-compressed",
    ".7z": "application/x-7z-compressed",
}


def _safe_upload_path(filename: str) -> tuple[str, str]:
    basename = os.path.basename(filename.replace("\\", "/"))
    basename = basename.replace(" ", "_").replace("(", "_").replace(")", "_")
    extension = os.path.splitext(basename)[1].lower()
    if extension not in ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=400, detail="Тип файла не разрешён")

    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    safe_filename = f"{timestamp}_{uuid.uuid4().hex[:8]}{extension}"
    file_path = os.path.join(UPLOAD_DIR, safe_filename)
    resolved = os.path.abspath(file_path)
    upload_root = os.path.abspath(UPLOAD_DIR)
    if not resolved.startswith(upload_root):
        raise HTTPException(status_code=400, detail="Недопустимое имя файла")
    return safe_filename, file_path


@router.post("/upload")
async def upload_file(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
):
    try:
        safe_filename, file_path = _safe_upload_path(file.filename or "file")
        extension = os.path.splitext(safe_filename)[1].lower()
        content_type = MIME_TYPES.get(extension, "application/octet-stream")

        total_size = 0
        with open(file_path, "wb") as buffer:
            while True:
                chunk = await file.read(1024 * 1024)
                if not chunk:
                    break
                total_size += len(chunk)
                if total_size > settings.MAX_UPLOAD_SIZE:
                    buffer.close()
                    if os.path.exists(file_path):
                        os.remove(file_path)
                    raise HTTPException(
                        status_code=413,
                        detail=f"Файл превышает лимит {settings.MAX_UPLOAD_SIZE // (1024 * 1024)} MB",
                    )
                buffer.write(chunk)

        return {
            "success": True,
            "filename": safe_filename,
            "originalName": os.path.basename(file.filename or safe_filename),
            "size": total_size,
            "type": content_type,
            "path": f"/uploads/{safe_filename}",
            "url": f"/uploads/{safe_filename}",
            "isImage": content_type.startswith("image/"),
            "isVideo": content_type.startswith("video/"),
            "isAudio": content_type.startswith("audio/"),
            "uploaded_by": current_user.id,
        }
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail="Ошибка загрузки файла") from exc
