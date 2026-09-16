"""Role hierarchy and permission checks."""
from __future__ import annotations

from enum import Enum
from typing import FrozenSet

from fastapi import Depends, HTTPException

ROLE_ALIASES = {"student": "user"}


class Role(str, Enum):
    USER = "user"
    MODERATOR = "moderator"
    ADMIN = "admin"
    SUPERADMIN = "superadmin"


ROLE_RANK = {
    Role.USER.value: 0,
    Role.MODERATOR.value: 1,
    Role.ADMIN.value: 2,
    Role.SUPERADMIN.value: 3,
}

ADMIN_PANEL_ROLES: FrozenSet[str] = frozenset({Role.ADMIN.value, Role.SUPERADMIN.value})
STAFF_ROLES: FrozenSet[str] = frozenset(
    {Role.MODERATOR.value, Role.ADMIN.value, Role.SUPERADMIN.value}
)

PERMISSIONS: dict[str, FrozenSet[str]] = {
    "users.ban": frozenset({Role.ADMIN.value, Role.SUPERADMIN.value}),
    "users.role_change": frozenset({Role.ADMIN.value, Role.SUPERADMIN.value}),
    "users.reset_sessions": frozenset({Role.ADMIN.value, Role.SUPERADMIN.value}),
    "audit.read": frozenset({Role.ADMIN.value, Role.SUPERADMIN.value}),
    "stats.read": frozenset({Role.ADMIN.value, Role.SUPERADMIN.value}),
}


def normalize_role(role: str | None) -> str:
    if not role:
        return Role.USER.value
    lowered = role.strip().lower()
    return ROLE_ALIASES.get(lowered, lowered)


def role_at_least(role: str | None, minimum: str) -> bool:
    current = normalize_role(role)
    minimum_norm = normalize_role(minimum)
    return ROLE_RANK.get(current, 0) >= ROLE_RANK.get(minimum_norm, 0)


def has_permission(role: str | None, permission: str) -> bool:
    allowed = PERMISSIONS.get(permission)
    if not allowed:
        return False
    return normalize_role(role) in allowed


def require_role(minimum_role: str):
    """FastAPI dependency factory — checks DB role via injected user."""

    async def _checker(current_user=Depends(_get_user_dep())):
        if not role_at_least(current_user.role, minimum_role):
            raise HTTPException(status_code=403, detail="Недостаточно прав")
        return current_user

    return _checker


def require_permission(permission: str):
    async def _checker(current_user=Depends(_get_user_dep())):
        if not has_permission(current_user.role, permission):
            raise HTTPException(status_code=403, detail="Недостаточно прав")
        return current_user

    return _checker


def _get_user_dep():
    # Lazy import avoids circular dependency at module load time.
    from app.dependencies import get_current_user

    return get_current_user
