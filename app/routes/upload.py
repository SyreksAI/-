from fastapi import APIRouter, File, UploadFile, HTTPException, Header
from fastapi.responses import JSONResponse
import os
import shutil
from datetime import datetime
from typing import Optional

router = APIRouter()

UPLOAD_DIR = "uploads"

# Создаем папку для загрузок
os.makedirs(UPLOAD_DIR, exist_ok=True)

@router.post("/upload")
async def upload_file(
    file: UploadFile = File(...),
    chat_id: str = None,
    user_id: int = None,
    x_user_id: Optional[int] = Header(None)
):
    """Загрузка файла на сервер"""
    
    try:
        # Генерируем уникальное имя файла
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        
        # ✅ ЗАМЕНЯЕМ ПРОБЕЛЫ И СПЕЦСИМВОЛЫ
        clean_filename = file.filename.replace(' ', '_').replace('(', '_').replace(')', '_')
        safe_filename = f"{timestamp}_{clean_filename}"
        file_path = os.path.join(UPLOAD_DIR, safe_filename)
        
        # Сохраняем файл
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        
        # Определяем тип файла
        content_type = file.content_type or "application/octet-stream"
        
        return {
            "success": True,
            "filename": safe_filename,
            "originalName": file.filename,  # Оригинальное имя сохраняем
            "cleanName": clean_filename,    # Очищенное имя
            "size": os.path.getsize(file_path),
            "type": content_type,
            "path": f"/uploads/{safe_filename}",
            "url": f"/uploads/{safe_filename}"
        }
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))