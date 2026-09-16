"""Утилита для обслуживания базы данных.

Примеры:
  python -m app.manage_db wipe --yes
  python -m app.manage_db wipe-messages --yes
  python -m app.manage_db stats
"""
from __future__ import annotations

import argparse
import shutil
import sys
from pathlib import Path

from sqlalchemy import text

from app.database import Base, SessionLocal, engine
from app.main import seed_forum_categories
from app.models import User


def table_stats() -> dict[str, int]:
    counts: dict[str, int] = {}
    db = SessionLocal()
    try:
        for table in Base.metadata.sorted_tables:
            result = db.execute(text(f'SELECT COUNT(*) FROM "{table.name}"'))
            counts[table.name] = int(result.scalar() or 0)
    finally:
        db.close()
    return counts


def print_stats() -> None:
    counts = table_stats()
    total = sum(counts.values())
    print(f"Всего записей: {total}")
    for name, count in counts.items():
        if count:
            print(f"  {name}: {count}")


def wipe_database() -> None:
    tables = [table.name for table in Base.metadata.sorted_tables]
    if not tables:
        print("Таблицы не найдены")
        return

    quoted = ", ".join(f'"{name}"' for name in tables)

    with engine.begin() as conn:
        if engine.dialect.name == "postgresql":
            conn.execute(text(f"TRUNCATE TABLE {quoted} RESTART IDENTITY CASCADE"))
        else:
            for table in reversed(Base.metadata.sorted_tables):
                conn.execute(table.delete())

    seed_forum_categories()
    print("База данных очищена.")
    print("Созданы категории форума по умолчанию (если их не было).")


def purge_media() -> bool:
    """Удалить все медиафайлы (MinIO + локальная папка uploads/)."""
    from app.config import settings

    upload_root = Path(settings.UPLOAD_DIR)
    if upload_root.exists():
        removed = 0
        for child in upload_root.iterdir():
            if child.is_dir():
                shutil.rmtree(child)
            else:
                child.unlink()
            removed += 1
        print(f"Локальные файлы удалены ({removed} элементов в {upload_root}).")
    else:
        print(f"Папка {upload_root} не найдена — пропуск.")

    backend = (settings.MEDIA_STORAGE or "local").lower()
    if backend not in ("minio",):
        return True

    try:
        from minio import Minio

        client = Minio(
            settings.MINIO_ENDPOINT,
            access_key=settings.MINIO_ACCESS_KEY,
            secret_key=settings.MINIO_SECRET_KEY,
            secure=settings.MINIO_SECURE,
        )
        bucket = settings.MINIO_BUCKET
        if not client.bucket_exists(bucket):
            print(f"MinIO bucket '{bucket}' не существует — пропуск.")
            return True

        deleted = 0
        for obj in client.list_objects(bucket, recursive=True):
            client.remove_object(bucket, obj.object_name)
            deleted += 1
        print(f"MinIO bucket '{bucket}' очищен ({deleted} объектов).")
        return True
    except Exception as exc:
        print(f"MinIO не очищен: {exc}", file=sys.stderr)
        return False


def wipe_chat_messages(*, purge_files: bool = True) -> None:
    """Удалить все сообщения чатов, вложения и групповые чаты."""
    with engine.begin() as conn:
        if engine.dialect.name == "postgresql":
            conn.execute(
                text(
                    'TRUNCATE TABLE "attachments", "messages", "groups" '
                    "RESTART IDENTITY CASCADE"
                )
            )
        else:
            conn.execute(text("DELETE FROM attachments"))
            conn.execute(text("DELETE FROM messages"))
            conn.execute(text("DELETE FROM groups"))

    flush_redis()
    if purge_files:
        purge_media()

    print("Все сообщения чатов удалены (messages, attachments, groups).")
    print("Общий чат (general) пуст — можно писать заново.")


def flush_redis() -> bool:
    try:
        import asyncio

        from app.redis_client import get_redis_client

        async def _flush():
            redis = await get_redis_client()
            await redis.flushdb()

        asyncio.run(_flush())
        print("Redis очищен.")
        return True
    except Exception as exc:
        print(f"Redis не очищен: {exc}", file=sys.stderr)
        return False


def main() -> int:
    parser = argparse.ArgumentParser(description="Обслуживание базы данных DubPar")
    sub = parser.add_subparsers(dest="command", required=True)

    sub.add_parser("stats", help="Показать количество записей по таблицам")

    wipe_parser = sub.add_parser("wipe", help="Полностью очистить все таблицы")
    wipe_parser.add_argument(
        "--yes",
        action="store_true",
        help="Подтвердить удаление всех данных",
    )
    wipe_parser.add_argument(
        "--redis",
        action="store_true",
        default=True,
        help="Также очистить Redis (по умолчанию: да)",
    )
    wipe_parser.add_argument(
        "--no-redis",
        action="store_true",
        help="Не очищать Redis",
    )
    wipe_parser.add_argument(
        "--media",
        action="store_true",
        default=True,
        help="Также удалить все медиафайлы (MinIO + uploads/, по умолчанию: да)",
    )
    wipe_parser.add_argument(
        "--no-media",
        action="store_true",
        help="Не удалять медиафайлы",
    )

    msg_parser = sub.add_parser(
        "wipe-messages",
        help="Удалить все сообщения чатов (сохранить пользователей и форум)",
    )
    msg_parser.add_argument(
        "--yes",
        action="store_true",
        help="Подтвердить удаление всех сообщений",
    )
    msg_parser.add_argument(
        "--no-media",
        action="store_true",
        help="Не удалять медиафайлы вложений",
    )

    args = parser.parse_args()

    if args.command == "stats":
        print_stats()
        return 0

    if args.command == "wipe":
        if not args.yes:
            print("⚠️  Это удалит ВСЕ данные из базы без возможности восстановления.")
            print("    Повторите с флагом --yes")
            db = SessionLocal()
            try:
                user_count = db.query(User).count()
            finally:
                db.close()
            print(f"    Сейчас пользователей: {user_count}")
            return 1

        wipe_database()
        if args.redis and not args.no_redis:
            flush_redis()
        if args.media and not args.no_media:
            purge_media()

        print("Общий чат (general) доступен — пустой, без пользователей и сообщений.")
        print_stats()
        return 0

    if args.command == "wipe-messages":
        if not args.yes:
            db = SessionLocal()
            try:
                from app.models import Attachment, Message

                msg_count = db.query(Message).count()
                attach_count = db.query(Attachment).count()
            finally:
                db.close()
            print("⚠️  Это удалит ВСЕ сообщения чатов без восстановления.")
            print("    Повторите с флагом --yes")
            print(f"    Сейчас сообщений: {msg_count}, вложений: {attach_count}")
            return 1

        wipe_chat_messages(purge_files=not args.no_media)
        print_stats()
        return 0

    return 1


if __name__ == "__main__":
    raise SystemExit(main())
