#!/usr/bin/env python3
"""Migrate local uploads/ files to MinIO. PostgreSQL metadata (storage_key) stays unchanged."""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session

from app.config import settings
from app.database import normalize_database_url
from app.models import Attachment
from app.storage import LocalMediaStorage, MinioMediaStorage, reset_media_storage


def migrate(*, dry_run: bool = False) -> int:
    if settings.MEDIA_STORAGE.lower() != "minio":
        print("Set MEDIA_STORAGE=minio in .env before migration.")
        return 1

    reset_media_storage()
    local = LocalMediaStorage()
    minio = MinioMediaStorage()
    engine = create_engine(normalize_database_url(settings.DATABASE_URL))

    migrated = 0
    skipped = 0
    missing = 0

    with Session(engine) as db:
        attachments = db.execute(select(Attachment)).scalars().all()
        keys: set[str] = set()
        for att in attachments:
            keys.add(att.storage_key)
            if att.thumb_key:
                keys.add(att.thumb_key)

        for key in sorted(keys):
            if minio.exists(key):
                skipped += 1
                continue
            local_path = local.absolute_path(key)
            if not local_path.is_file():
                print(f"MISSING local: {key}")
                missing += 1
                continue
            data = local_path.read_bytes()
            if dry_run:
                print(f"DRY-RUN upload: {key} ({len(data)} bytes)")
            else:
                minio.put_bytes(key, data)
                print(f"OK: {key} ({len(data)} bytes)")
            migrated += 1

    print(f"\nDone. migrated={migrated}, skipped={skipped}, missing={missing}")
    return 0 if missing == 0 else 2


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Copy uploads/ blobs into MinIO")
    parser.add_argument("--dry-run", action="store_true", help="List actions without uploading")
    raise SystemExit(migrate(dry_run=parser.parse_args().dry_run))
