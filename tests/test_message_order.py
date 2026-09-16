from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import BigInteger, select

from app.models import Message
from app.routes.messages import _load_recent_page, next_chat_order
from app.time_utils import as_utc, iso_utc

CHAT_ID = "general"
BASE = datetime(2026, 9, 8, 9, 0, 0)
INT32_MAX = 2**31 - 1
# Значение `order` из старых строк: микросекундный timestamp.
LEGACY_ORDER = 1788860493601142


def test_iso_utc_marks_naive_timestamps_as_utc():
    naive = datetime(2026, 9, 8, 9, 42, 23)
    assert iso_utc(naive) == "2026-09-08T09:42:23+00:00"
    assert as_utc(naive).tzinfo == timezone.utc
    assert iso_utc(None) is None


def test_iso_utc_converts_aware_timestamps():
    aware = datetime(2026, 9, 8, 12, 42, 23, tzinfo=timezone(timedelta(hours=3)))
    assert iso_utc(aware) == "2026-09-08T09:42:23+00:00"


async def _seed(db, count: int, *, chat_id: str = CHAT_ID, start: int = 0) -> list[Message]:
    created = []
    for i in range(count):
        msg = Message(
            user_id=1,
            text=f"msg-{start + i}",
            chat_id=chat_id,
            timestamp=BASE + timedelta(minutes=start + i),
            order=start + i + 1,
        )
        db.add(msg)
        created.append(msg)
    await db.commit()
    return created


@pytest.mark.asyncio
async def test_history_returns_newest_page_oldest_first(db_session):
    await _seed(db_session, 5)

    page = await _load_recent_page(CHAT_ID, db_session, limit=3, before_id=None)

    assert [m.text for m in page] == ["msg-2", "msg-3", "msg-4"]
    assert page == sorted(page, key=lambda m: (m.timestamp, m.id))


@pytest.mark.asyncio
async def test_history_pagination_walks_backwards(db_session):
    await _seed(db_session, 5)

    newest = await _load_recent_page(CHAT_ID, db_session, limit=2, before_id=None)
    older = await _load_recent_page(CHAT_ID, db_session, limit=2, before_id=newest[0].id)

    assert [m.text for m in newest] == ["msg-3", "msg-4"]
    assert [m.text for m in older] == ["msg-1", "msg-2"]


@pytest.mark.asyncio
async def test_identical_timestamps_fall_back_to_id(db_session):
    same_time = BASE
    for text in ("first", "second", "third"):
        db_session.add(
            Message(user_id=1, text=text, chat_id=CHAT_ID, timestamp=same_time, order=0)
        )
    await db_session.commit()

    page = await _load_recent_page(CHAT_ID, db_session, limit=10, before_id=None)

    assert [m.text for m in page] == ["first", "second", "third"]


@pytest.mark.asyncio
async def test_deleted_messages_are_excluded(db_session):
    messages = await _seed(db_session, 3)
    messages[1].is_deleted = True
    await db_session.commit()

    page = await _load_recent_page(CHAT_ID, db_session, limit=10, before_id=None)

    assert [m.text for m in page] == ["msg-0", "msg-2"]


@pytest.mark.asyncio
async def test_next_chat_order_is_sequential_per_chat(db_session):
    await _seed(db_session, 2, chat_id="general")
    await _seed(db_session, 1, chat_id="private_1_2")

    assert await next_chat_order("general", db_session) == 3
    assert await next_chat_order("private_1_2", db_session) == 2
    assert await next_chat_order("empty_chat", db_session) == 1


def test_order_column_is_bigint():
    """Микросекундный `order` не влезает в int4 — иначе INSERT падает с out of range."""
    assert LEGACY_ORDER > INT32_MAX
    assert isinstance(Message.__table__.c["order"].type, BigInteger)


@pytest.mark.asyncio
async def test_next_chat_order_stays_above_int32_for_legacy_chats(db_session):
    db_session.add(
        Message(user_id=1, text="old", chat_id=CHAT_ID, timestamp=BASE, order=LEGACY_ORDER)
    )
    await db_session.commit()

    assert await next_chat_order(CHAT_ID, db_session) == LEGACY_ORDER + 1


@pytest.mark.asyncio
async def test_legacy_microsecond_order_does_not_break_time_ordering(db_session):
    """Old rows carry microsecond-epoch `order`, new rows a small counter."""
    db_session.add(
        Message(
            user_id=1,
            text="old",
            chat_id=CHAT_ID,
            timestamp=BASE,
            order=LEGACY_ORDER,
        )
    )
    db_session.add(
        Message(
            user_id=1,
            text="new",
            chat_id=CHAT_ID,
            timestamp=BASE + timedelta(days=3),
            order=1,
        )
    )
    await db_session.commit()

    page = await _load_recent_page(CHAT_ID, db_session, limit=10, before_id=None)

    assert [m.text for m in page] == ["old", "new"]

    by_order = (
        await db_session.execute(select(Message.text).order_by(Message.order.asc()))
    ).scalars().all()
    assert by_order == ["new", "old"], "sorting by `order` would invert the history"
