import pytest
from fastapi import HTTPException

from app.session_store import (
    create_access_session,
    create_email_verify_token,
    create_password_reset_token,
    get_user_id_from_token,
)


@pytest.mark.asyncio
async def test_access_token_cannot_be_used_for_reset():
    token = await create_access_session(1)
    with pytest.raises(HTTPException) as exc_info:
        await get_user_id_from_token(token, allow_reset=True)
    assert exc_info.value.status_code == 400


@pytest.mark.asyncio
async def test_reset_token_cannot_be_used_as_access():
    token = await create_password_reset_token(1)
    with pytest.raises(HTTPException) as exc_info:
        await get_user_id_from_token(token)
    assert exc_info.value.status_code == 401


@pytest.mark.asyncio
async def test_reset_and_verify_tokens_work_with_flags():
    reset_token = await create_password_reset_token(42)
    assert await get_user_id_from_token(reset_token, allow_reset=True) == 42

    verify_token = await create_email_verify_token(7)
    assert await get_user_id_from_token(verify_token, allow_verify=True) == 7
