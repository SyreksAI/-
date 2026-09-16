"""Timestamp serialization helpers.

Message timestamps are stored as naive DateTime columns filled by the database
clock, which runs in UTC. Clients need an explicit offset, otherwise JavaScript
parses the value as local time and message ordering/display drifts by the
browser's timezone offset.
"""
from __future__ import annotations

from datetime import datetime, timezone


def as_utc(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def iso_utc(value: datetime | None) -> str | None:
    utc_value = as_utc(value)
    return utc_value.isoformat() if utc_value else None


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def format_registered(value: datetime | str | None) -> str:
    """Return registration date as DD.MM.YYYY without time."""
    if value is None:
        return ""

    if isinstance(value, datetime):
        return value.strftime("%d.%m.%Y")

    if isinstance(value, str):
        raw = value.strip()
        if not raw:
            return ""
        if len(raw) == 10 and raw[2] == "." and raw[5] == ".":
            return raw
        date_part = raw.replace("T", " ").split(" ", 1)[0][:10]
        try:
            if len(date_part) == 10 and date_part[4] == "-":
                return datetime.strptime(date_part, "%Y-%m-%d").strftime("%d.%m.%Y")
        except ValueError:
            pass
        return date_part

    if hasattr(value, "strftime"):
        return value.strftime("%d.%m.%Y")

    text = str(value).strip()
    return text.replace("T", " ").split(" ", 1)[0][:10]
