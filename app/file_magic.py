"""MIME detection via magic bytes — never trust client Content-Type alone."""
from __future__ import annotations

# (mime, extensions)
SIGNATURES: list[tuple[bytes, str, tuple[str, ...]]] = [
    (b"\xff\xd8\xff", "image/jpeg", (".jpg", ".jpeg")),
    (b"\x89PNG\r\n\x1a\n", "image/png", (".png",)),
    (b"GIF87a", "image/gif", (".gif",)),
    (b"GIF89a", "image/gif", (".gif",)),
    (b"RIFF", "image/webp", (".webp",)),  # checked further for WEBP
    (b"%PDF", "application/pdf", (".pdf",)),
    (b"ID3", "audio/mpeg", (".mp3",)),
    (b"\xff\xfb", "audio/mpeg", (".mp3",)),
    (b"\xff\xf3", "audio/mpeg", (".mp3",)),
    (b"\xff\xf2", "audio/mpeg", (".mp3",)),
    (b"OggS", "audio/ogg", (".ogg",)),
    (b"RIFF", "audio/wav", (".wav",)),  # checked further for WAVE
    (b"\x00\x00\x00", "video/mp4", (".mp4",)),  # ftyp at offset 4
    (b"\x1a\x45\xdf\xa3", "video/webm", (".webm",)),
]

ALLOWED_MIMES = {
    "image/jpeg",
    "image/png",
    "image/gif",
    "image/webp",
    "video/mp4",
    "video/webm",
    "video/quicktime",
    "audio/mpeg",
    "audio/wav",
    "audio/ogg",
    "audio/mp4",
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "text/plain",
    "application/zip",
}

EXT_TO_MIME = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".gif": "image/gif",
    ".webp": "image/webp",
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
    ".txt": "text/plain",
    ".zip": "application/zip",
}


def _is_webp(header: bytes) -> bool:
    return len(header) >= 12 and header[:4] == b"RIFF" and header[8:12] == b"WEBP"


def _is_wav(header: bytes) -> bool:
    return len(header) >= 12 and header[:4] == b"RIFF" and header[8:12] == b"WAVE"


def _is_mp4(header: bytes) -> bool:
    return len(header) >= 12 and header[4:8] == b"ftyp"


def detect_mime(header: bytes, extension: str) -> str | None:
    ext = extension.lower()
    if not ext.startswith("."):
        ext = f".{ext}"

    for sig, mime, exts in SIGNATURES:
        if ext not in exts:
            continue
        if mime == "image/webp" and _is_webp(header):
            return mime
        if mime == "audio/wav" and _is_wav(header):
            return mime
        if mime == "video/mp4" and _is_mp4(header):
            return mime
        if header.startswith(sig) and mime not in ("image/webp", "audio/wav", "video/mp4"):
            return mime

    # Office Open XML (zip-based) — PK\x03\x04
    if ext in (".docx", ".xlsx", ".pptx") and header[:2] == b"PK":
        return EXT_TO_MIME.get(ext)

    if ext == ".txt" and header:
        try:
            header[:512].decode("utf-8")
            return "text/plain"
        except UnicodeDecodeError:
            return None

    return None


def mime_to_kind(mime: str) -> str:
    if mime.startswith("image/"):
        return "image"
    if mime.startswith("video/"):
        return "video"
    if mime.startswith("audio/"):
        return "audio"
    return "file"


def max_size_for_kind(kind: str, settings) -> int:
    if kind == "image":
        return settings.MAX_UPLOAD_IMAGE_SIZE
    if kind == "video":
        return settings.MAX_UPLOAD_VIDEO_SIZE
    if kind == "audio":
        return settings.MAX_UPLOAD_AUDIO_SIZE
    return settings.MAX_UPLOAD_FILE_SIZE
