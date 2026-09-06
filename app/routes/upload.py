# app/routes/upload.py
from fastapi import APIRouter, File, UploadFile, HTTPException, Header
from fastapi.responses import JSONResponse
import os
import shutil
from datetime import datetime
from typing import Optional

router = APIRouter()

UPLOAD_DIR = "uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)

# ===== MIME-ТИПЫ ПО РАСШИРЕНИЮ =====
MIME_TYPES = {
    # Изображения
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.webp': 'image/webp',
    '.bmp': 'image/bmp',
    '.ico': 'image/x-icon',
    
    # Видео
    '.mp4': 'video/mp4',
    '.avi': 'video/x-msvideo',
    '.mov': 'video/quicktime',
    '.wmv': 'video/x-ms-wmv',
    '.flv': 'video/x-flv',
    '.mkv': 'video/x-matroska',
    '.webm': 'video/webm',
    '.m4v': 'video/mp4',
    
    # Аудио
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav',
    '.flac': 'audio/flac',
    '.aac': 'audio/aac',
    '.ogg': 'audio/ogg',
    '.wma': 'audio/x-ms-wma',
    '.m4a': 'audio/mp4',
    
    # Документы
    '.pdf': 'application/pdf',
    '.doc': 'application/msword',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.xls': 'application/vnd.ms-excel',
    '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    '.ppt': 'application/vnd.ms-powerpoint',
    '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    '.txt': 'text/plain',
    '.md': 'text/markdown',
    '.csv': 'text/csv',
    
    # Архивы
    '.zip': 'application/zip',
    '.rar': 'application/x-rar-compressed',
    '.7z': 'application/x-7z-compressed',
    '.tar': 'application/x-tar',
    '.gz': 'application/gzip',
    
    # Другое
    '.json': 'application/json',
    '.xml': 'application/xml',
    '.js': 'application/javascript',
    '.css': 'text/css',
    '.html': 'text/html',
}


@router.post("/upload")
async def upload_file(
    file: UploadFile = File(...),
    chat_id: str = None,
    user_id: int = None,
    x_user_id: Optional[int] = Header(None)
):
    """Загрузка файла на сервер"""
    
    try:
        # Получаем расширение файла
        filename = file.filename or 'file'
        extension = os.path.splitext(filename)[1].lower()
        
        # Определяем MIME-тип
        content_type = MIME_TYPES.get(extension, file.content_type or 'application/octet-stream')
        
        # Генерируем уникальное имя файла
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        clean_filename = filename.replace(' ', '_').replace('(', '_').replace(')', '_')
        safe_filename = f"{timestamp}_{clean_filename}"
        file_path = os.path.join(UPLOAD_DIR, safe_filename)
        
        # Сохраняем файл
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        
        file_size = os.path.getsize(file_path)
        
        # ===== ОПРЕДЕЛЯЕМ ТИП ДЛЯ ФРОНТЕНДА =====
        is_image = content_type.startswith('image/')
        is_video = content_type.startswith('video/')
        is_audio = content_type.startswith('audio/')
        
        return {
            "success": True,
            "filename": safe_filename,
            "originalName": filename,
            "cleanName": clean_filename,
            "size": file_size,
            "type": content_type,
            "path": f"/uploads/{safe_filename}",
            "url": f"/uploads/{safe_filename}",
            "isImage": is_image,
            "isVideo": is_video,
            "isAudio": is_audio
        }
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))