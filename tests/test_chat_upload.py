"""Chat attachment upload and file delivery tests."""
import io
import tempfile
from datetime import datetime, timedelta

import pytest

pytest.importorskip("PIL")
from PIL import Image

from app.attachment_service import link_attachments, process_upload
from app.config import settings
from app.message_payload import build_message_payload
from app.models import Message, User
from tests.conftest import run_async

CHAT_ID = "general"


def _make_png_bytes() -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", (32, 24), color=(120, 80, 200)).save(buf, format="PNG")
    return buf.getvalue()


def _make_pdf_bytes() -> bytes:
    return b"%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF"


@pytest.fixture
def upload_dir(monkeypatch):
    from app.storage import reset_media_storage

    with tempfile.TemporaryDirectory() as tmp:
        monkeypatch.setattr(settings, "UPLOAD_DIR", tmp)
        monkeypatch.setattr(settings, "MEDIA_STORAGE", "local")
        monkeypatch.setattr(settings, "MAX_UPLOAD_IMAGE_SIZE", 1024 * 1024)
        reset_media_storage()
        yield tmp
        reset_media_storage()


def test_upload_valid_png_returns_metadata(client, auth_headers, upload_dir):
    png = _make_png_bytes()
    response = client.post(
        "/api/chat/upload",
        headers=auth_headers,
        data={"chat_id": CHAT_ID},
        files={"file": ("photo.png", png, "image/png")},
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["kind"] == "image"
    assert body["mime"] == "image/png"
    assert body["size"] == len(png)
    assert body["width"] == 32
    assert body["height"] == 24
    assert body["url"].startswith("/api/files/")
    assert body["thumb_url"]


def test_upload_valid_pdf(client, auth_headers, upload_dir):
    pdf = _make_pdf_bytes()
    response = client.post(
        "/api/chat/upload",
        headers=auth_headers,
        data={"chat_id": CHAT_ID},
        files={"file": ("doc.pdf", pdf, "application/pdf")},
    )
    assert response.status_code == 200
    assert response.json()["kind"] == "file"
    assert response.json()["mime"] == "application/pdf"


def test_upload_oversized_image_returns_413(client, auth_headers, upload_dir, monkeypatch):
    png = _make_png_bytes()
    # Test PNG is ~107 bytes; limit must be below actual payload size.
    monkeypatch.setattr(settings, "MAX_UPLOAD_IMAGE_SIZE", len(png) - 1)
    response = client.post(
        "/api/chat/upload",
        headers=auth_headers,
        data={"chat_id": CHAT_ID},
        files={"file": ("big.png", png, "image/png")},
    )
    assert response.status_code == 413


def test_upload_fake_mime_returns_400(client, auth_headers, upload_dir):
    exe_disguised = b"MZ" + b"\x00" * 128
    response = client.post(
        "/api/chat/upload",
        headers=auth_headers,
        data={"chat_id": CHAT_ID},
        files={"file": ("evil.jpg", exe_disguised, "image/jpeg")},
    )
    assert response.status_code == 400


def test_file_access_with_media_cookie(client, auth_headers, upload_dir):
    payload = _make_pdf_bytes()
    upload = client.post(
        "/api/chat/upload",
        headers=auth_headers,
        data={"chat_id": CHAT_ID},
        files={"file": ("cookie.pdf", payload, "application/pdf")},
    ).json()
    token = auth_headers["Authorization"].split(" ", 1)[1]
    response = client.get(
        f"/api/files/{upload['id']}",
        cookies={"media_access": token},
    )
    assert response.status_code == 200
    assert response.content == payload


def test_file_cyrillic_filename_returns_200(client, auth_headers, upload_dir):
    png = _make_png_bytes()
    upload = client.post(
        "/api/chat/upload",
        headers=auth_headers,
        data={"chat_id": CHAT_ID},
        files={"file": ("видео клип.png", png, "image/png")},
    )
    assert upload.status_code == 200, upload.text
    file_id = upload.json()["id"]
    response = client.get(f"/api/files/{file_id}", headers=auth_headers)
    assert response.status_code == 200
    assert "filename*=" in response.headers.get("content-disposition", "")


def test_file_range_request_returns_206(client, auth_headers, upload_dir):
    payload = _make_pdf_bytes()
    upload = client.post(
        "/api/chat/upload",
        headers=auth_headers,
        data={"chat_id": CHAT_ID},
        files={"file": ("range.pdf", payload, "application/pdf")},
    ).json()
    file_id = upload["id"]

    response = client.get(
        f"/api/files/{file_id}",
        headers={**auth_headers, "Range": "bytes=0-9"},
    )
    assert response.status_code == 206
    assert response.headers.get("content-range", "").startswith("bytes 0-9/")
    assert response.headers.get("accept-ranges") == "bytes"
    assert len(response.content) == 10


def test_attachment_message_order_preserved(db_session, test_user):
    async def _setup():
        base = datetime(2026, 9, 8, 10, 0, 0)
        m1 = Message(user_id=test_user.id, text="A1", chat_id=CHAT_ID, timestamp=base)
        m2 = Message(user_id=test_user.id, text="B1", chat_id=CHAT_ID, timestamp=base + timedelta(minutes=1))
        db_session.add_all([m1, m2])
        await db_session.commit()
        await db_session.refresh(m1)
        await db_session.refresh(m2)

        att = await process_upload(
            db_session,
            uploader=test_user,
            chat_id=CHAT_ID,
            data=_make_png_bytes(),
            original_name="pic.png",
        )
        m3 = Message(user_id=test_user.id, text="caption", chat_id=CHAT_ID, timestamp=base + timedelta(hours=24))
        db_session.add(m3)
        await db_session.commit()
        await db_session.refresh(m3)
        await link_attachments(db_session, m3.id, CHAT_ID, test_user.id, [att.id])

        payloads = [
            await build_message_payload(m1, db_session),
            await build_message_payload(m2, db_session),
            await build_message_payload(m3, db_session),
        ]
        return [p["id"] for p in payloads], payloads[-1]

    ids, last = run_async(_setup())
    assert ids == sorted(ids)
    assert len(last["attachments"]) == 1
    assert last["attachments"][0]["kind"] == "image"
    assert last["text"] == "caption"
