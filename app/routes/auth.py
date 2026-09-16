# app/routes/auth.py
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, Request, Response
from fastapi.responses import RedirectResponse
import secrets
from urllib.parse import urlencode
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
import logging
from datetime import datetime

from app.database import get_db
from app.models import User
from app.schemas import UserCreate, UserLogin, UserResponse, Token, ResetPasswordRequest
from app.turnstile import verify_turnstile
from app.email_service import (
    send_login_notice_email,
    send_password_reset_email,
    send_registration_notice_email,
    send_verification_email,
)
from app.dependencies import get_current_user, security
from app.session_store import (
    consume_password_reset_token,
    create_email_verify_token,
    create_password_reset_token,
    get_user_id_from_token,
    revoke_access_session,
)
from app.config import settings
from app.site_settings import is_registration_enabled
from app.password_utils import hash_password, verify_and_update_password
from app.jwt_auth import (
    clear_auth_cookies,
    create_auth_session,
    invalidate_user_sessions,
    refresh_access_token,
    revoke_session,
    resolve_token_session,
    set_csrf_cookie,
    set_media_access_cookie,
    set_refresh_cookie,
)
from app.roles import normalize_role
from app.time_utils import format_registered
from app.yandex_oauth import (
    build_authorize_url,
    consume_oauth_state,
    exchange_code_for_token,
    fetch_yandex_profile,
    resolve_yandex_user,
    store_oauth_state,
    yandex_oauth_enabled,
)

router = APIRouter()
logger = logging.getLogger(__name__)


async def authenticate_user(db: AsyncSession, email: str, password: str) -> User | None:
    login = email.strip()
    db_user = (
        await db.execute(
            select(User).where(
                (func.lower(User.email) == login.lower()) | (User.username == login)
            )
        )
    ).scalar_one_or_none()
    if not db_user:
        return None

    verified, new_hash = verify_and_update_password(password, db_user.password)
    if not verified:
        return None

    if new_hash:
        db_user.password = new_hash
        await db.commit()
        await db.refresh(db_user)

    db_user.role = normalize_role(db_user.role)
    return db_user


def build_user_response(user: User, *, hide_email: bool = False, hide_ban: bool = False) -> UserResponse:
    return UserResponse(
        id=user.id,
        username=user.username,
        name=user.name,
        email="" if hide_email else user.email,
        role=normalize_role(user.role),
        registered=format_registered(user.registered),
        languages=user.languages or [],
        topics_count=user.topics_count or 0,
        progress=user.progress or 0,
        is_online=bool(user.is_online),
        is_active=user.is_active if user.is_active is not None else True,
        is_banned=False if hide_ban else bool(user.is_banned),
    )


async def _issue_tokens(user: User, response: Response) -> Token:
    access_token, refresh_token, csrf_token = await create_auth_session(user.id, user.role)
    set_refresh_cookie(response, refresh_token)
    set_csrf_cookie(response, csrf_token)
    set_media_access_cookie(response, access_token)
    return Token(access_token=access_token, token_type="bearer", user=build_user_response(user))


def _safe_next_path(value: str | None) -> str:
    if not value or not value.startswith("/") or value.startswith("//"):
        return "/"
    return value


def _resolve_frontend_url(origin: str | None) -> str:
    candidate = (origin or "").strip().rstrip("/")
    if candidate and candidate in settings.ALLOWED_ORIGINS:
        return candidate
    return settings.frontend_url


def _client_context(request: Request) -> dict[str, str]:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        ip = forwarded.split(",")[0].strip()
    elif request.client:
        ip = request.client.host
    else:
        ip = "неизвестно"
    user_agent = request.headers.get("user-agent", "неизвестно")
    return {"ip": ip, "user_agent": user_agent[:500]}


def _notify_auth_event(
    email: str,
    username: str,
    *,
    is_registration: bool,
    method: str,
    ip: str,
    user_agent: str,
) -> None:
    if not email:
        return
    try:
        if is_registration:
            send_registration_notice_email(
                email,
                username,
                ip=ip,
                user_agent=user_agent,
                method=method,
            )
        else:
            send_login_notice_email(
                email,
                username,
                ip=ip,
                user_agent=user_agent,
                method=method,
            )
    except Exception:
        logger.exception("Failed to send auth notice email to %s", email)


def _oauth_error_redirect(
    message: str,
    next_path: str = "/",
    frontend_url: str | None = None,
) -> RedirectResponse:
    params = urlencode({"error": message, "next": next_path})
    base = (frontend_url or settings.frontend_url).rstrip("/")
    return RedirectResponse(f"{base}/auth/oauth?{params}", status_code=302)


def _oauth_success_redirect(access_token: str, next_path: str, frontend_url: str) -> str:
    params = urlencode({
        "access_token": access_token,
        "token_type": "bearer",
        "next": next_path,
    })
    base = frontend_url.rstrip("/")
    return f"{base}/auth/oauth?{params}"


@router.get("/yandex/login")
async def yandex_login(
    next: str = Query("/", alias="next"),
    origin: str | None = Query(None),
):
    if not yandex_oauth_enabled():
        raise HTTPException(status_code=404, detail="Yandex OAuth не настроен")

    state = secrets.token_urlsafe(32)
    next_path = _safe_next_path(next)
    frontend_url = _resolve_frontend_url(origin)
    await store_oauth_state(state, {"next": next_path, "frontend": frontend_url})
    return RedirectResponse(build_authorize_url(state), status_code=302)


@router.get("/yandex/callback")
async def yandex_callback(
    request: Request,
    background_tasks: BackgroundTasks,
    code: str | None = None,
    state: str | None = None,
    error: str | None = None,
    db: AsyncSession = Depends(get_db),
):
    next_path = "/"
    frontend_url = settings.frontend_url

    if error:
        return _oauth_error_redirect(error, next_path, frontend_url)

    if not code or not state:
        return _oauth_error_redirect("Отсутствует код или state", next_path, frontend_url)

    stored = await consume_oauth_state(state)
    if not stored:
        return _oauth_error_redirect("Недействительный или просроченный state", next_path, frontend_url)

    next_path = _safe_next_path(stored.get("next"))
    frontend_url = _resolve_frontend_url(stored.get("frontend"))

    try:
        yandex_access_token = await exchange_code_for_token(code)
        profile = await fetch_yandex_profile(yandex_access_token)
        user, is_new_account = await resolve_yandex_user(db, profile)

        if user.is_banned:
            return _oauth_error_redirect(
                "Ваш аккаунт был заблокирован. Для разблокировки обратитесь к администратору.",
                next_path,
                frontend_url,
            )

        ctx = _client_context(request)
        background_tasks.add_task(
            _notify_auth_event,
            user.email,
            user.username,
            is_registration=is_new_account,
            method="yandex",
            ip=ctx["ip"],
            user_agent=ctx["user_agent"],
        )

        redirect = RedirectResponse(frontend_url, status_code=302)
        token_data = await _issue_tokens(user, redirect)
        redirect.headers["location"] = _oauth_success_redirect(
            token_data.access_token,
            next_path,
            frontend_url,
        )
        return redirect
    except HTTPException as exc:
        detail = exc.detail if isinstance(exc.detail, str) else "Не удалось войти через Яндекс"
        return _oauth_error_redirect(detail, next_path, frontend_url)
    except Exception:
        logger.exception("Yandex OAuth callback failed")
        return _oauth_error_redirect("Не удалось войти через Яндекс", next_path, frontend_url)


@router.post("/register", response_model=Token)
async def register(
    user: UserCreate,
    request: Request,
    background_tasks: BackgroundTasks,
    response: Response,
    db: AsyncSession = Depends(get_db),
):
    if not await is_registration_enabled(db):
        raise HTTPException(status_code=403, detail="Регистрация новых пользователей временно отключена")

    if settings.turnstile_required:
        if not user.recaptcha_token:
            raise HTTPException(status_code=400, detail="Требуется подтверждение captcha")
        if not verify_turnstile(user.recaptcha_token):
            raise HTTPException(status_code=400, detail="Ошибка проверки. Попробуйте снова.")
    elif user.recaptcha_token and not verify_turnstile(user.recaptcha_token):
        raise HTTPException(status_code=400, detail="Ошибка проверки. Попробуйте снова.")

    if (await db.execute(select(User).where(User.username == user.username))).scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Имя пользователя уже занято")

    if (await db.execute(select(User).where(User.email == user.email))).scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Email уже зарегистрирован")

    db_user = User(
        username=user.username,
        name=user.name,
        email=user.email,
        password=hash_password(user.password),
        role="user",
        registered=datetime.now(),
        legal_consents={
            "privacy_policy": {
                "accepted": True,
                "version": user.legal_docs_version,
                "accepted_at": datetime.now().isoformat(),
            },
            "data_processing": {
                "accepted": True,
                "version": user.legal_docs_version,
                "accepted_at": datetime.now().isoformat(),
            },
            "public_offer": {
                "accepted": True,
                "version": user.legal_docs_version,
                "accepted_at": datetime.now().isoformat(),
            },
        },
    )
    db.add(db_user)
    await db.commit()
    await db.refresh(db_user)

    ctx = _client_context(request)
    background_tasks.add_task(
        _notify_auth_event,
        db_user.email,
        db_user.username,
        is_registration=True,
        method="email",
        ip=ctx["ip"],
        user_agent=ctx["user_agent"],
    )

    return await _issue_tokens(db_user, response)


@router.post("/login", response_model=Token)
async def login(
    user: UserLogin,
    request: Request,
    background_tasks: BackgroundTasks,
    response: Response,
    db: AsyncSession = Depends(get_db),
):
    db_user = await authenticate_user(db, user.email, user.password)
    if not db_user:
        raise HTTPException(status_code=401, detail="Неверный email или пароль")

    if db_user.is_banned:
        raise HTTPException(
            status_code=403,
            detail="Ваш аккаунт был заблокирован. Для разблокировки обратитесь к администратору.",
        )

    ctx = _client_context(request)
    background_tasks.add_task(
        _notify_auth_event,
        db_user.email,
        db_user.username,
        is_registration=False,
        method="email",
        ip=ctx["ip"],
        user_agent=ctx["user_agent"],
    )

    return await _issue_tokens(db_user, response)


@router.post("/refresh", response_model=Token)
async def refresh_session(request: Request, response: Response, db: AsyncSession = Depends(get_db)):
    access_token, user_id, _sid = await refresh_access_token(request, response)
    db_user = (await db.execute(select(User).where(User.id == user_id))).scalar_one_or_none()
    if not db_user or db_user.is_banned or not db_user.is_active:
        clear_auth_cookies(response)
        raise HTTPException(status_code=401, detail="Сессия недействительна")

    db_user.role = normalize_role(db_user.role)
    set_media_access_cookie(response, access_token)
    return Token(access_token=access_token, token_type="bearer", user=build_user_response(db_user))


@router.post("/logout")
async def logout(response: Response, credentials=Depends(security)):
    if credentials and credentials.credentials:
        token = credentials.credentials
        try:
            user_id, sid = await resolve_token_session(token)
            await revoke_session(user_id, sid)
        except HTTPException:
            await revoke_access_session(token)
    clear_auth_cookies(response)
    return {"message": "Выход выполнен"}


@router.get("/me", response_model=UserResponse)
async def get_me(current_user: User = Depends(get_current_user)):
    return build_user_response(current_user)


@router.post("/forgot-password")
async def forgot_password(email: str, db: AsyncSession = Depends(get_db)):
    user = (
        await db.execute(select(User).where(User.email == email))
    ).scalar_one_or_none()
    if user:
        token = await create_password_reset_token(user.id)
        send_password_reset_email(user.email, user.username, token)

    return {"message": "Если email зарегистрирован, инструкции отправлены на почту"}


@router.post("/reset-password")
async def reset_password(body: ResetPasswordRequest, db: AsyncSession = Depends(get_db)):
    user_id = await consume_password_reset_token(body.token)

    user = (
        await db.execute(select(User).where(User.id == user_id))
    ).scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="Пользователь не найден")

    user.password = hash_password(body.new_password)
    await db.commit()
    await invalidate_user_sessions(user_id)
    return {"message": "Пароль успешно изменён"}


@router.post("/send-verification")
async def send_verification_email_endpoint(
    current_user: User = Depends(get_current_user),
):
    token = await create_email_verify_token(current_user.id)
    send_verification_email(current_user.email, current_user.username, token)
    return {"message": "Письмо с подтверждением отправлено"}


@router.post("/verify-email")
async def verify_email(
    token: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    user_id = await get_user_id_from_token(token, allow_verify=True)
    if user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Неверный пользователь")

    current_user.is_verified = True
    await db.commit()
    return {"message": "Email успешно подтверждён"}
