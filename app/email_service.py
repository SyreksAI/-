import logging
import smtplib
from datetime import datetime
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from zoneinfo import ZoneInfo

from app.config import settings

logger = logging.getLogger(__name__)


def _site_link(path: str) -> str:
    base = settings.site_url
    if not path.startswith("/"):
        path = f"/{path}"
    return f"{base}{path}"


def send_email(to_email: str, subject: str, html_content: str, text_content: str = None):
    """Отправка email"""
    if not settings.SMTP_USER or not settings.SMTP_PASSWORD:
        logger.warning("SMTP credentials not configured — email to %s skipped", to_email)
        return False

    from_email = settings.FROM_EMAIL or settings.SMTP_USER

    try:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"] = from_email
        msg["To"] = to_email

        if text_content:
            msg.attach(MIMEText(text_content, "plain"))

        msg.attach(MIMEText(html_content, "html"))

        if settings.SMTP_PORT == 465:
            with smtplib.SMTP_SSL(settings.SMTP_HOST, settings.SMTP_PORT) as server:
                server.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
                server.send_message(msg)
        else:
            with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT) as server:
                server.starttls()
                server.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
                server.send_message(msg)

        logger.info("Email sent to %s", to_email)
        return True
    except Exception as e:
        logger.error("Email send error: %s", e)
        return False


def send_verification_email(to_email: str, username: str, token: str):
    """Подтверждение email"""
    link = _site_link(f"verify-email?token={token}")
    html = f"""
    <html>
    <body style="font-family: Arial, sans-serif; max-width: 600px;">
        <div style="background: #7c3aed; padding: 20px; text-align: center; color: white; border-radius: 10px 10px 0 0;">
            <h1 style="margin: 0;">{settings.LEGAL_PLATFORM_NAME}</h1>
        </div>
        <div style="padding: 20px; background: #f8fafc; border-radius: 0 0 10px 10px;">
            <h2>Подтверждение email</h2>
            <p>Привет, <strong>{username}</strong>!</p>
            <p>Перейдите по ссылке для подтверждения email:</p>
            <p style="text-align: center; margin: 20px 0;">
                <a href="{link}" style="background: #7c3aed; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px;">Подтвердить email</a>
            </p>
            <p style="color: #94a3b8; font-size: 12px;">Ссылка действительна 24 часа. Если вы не регистрировались, проигнорируйте это письмо.</p>
        </div>
    </body>
    </html>
    """
    text = f"Привет, {username}!\n\nПодтвердите email: {link}"
    return send_email(to_email, f"Подтверждение email на {settings.LEGAL_PLATFORM_NAME}", html, text)


def send_password_reset_email(to_email: str, username: str, token: str):
    """Сброс пароля"""
    link = _site_link(f"reset-password?token={token}")
    html = f"""
    <html>
    <body style="font-family: Arial, sans-serif; max-width: 600px;">
        <div style="background: #7c3aed; padding: 20px; text-align: center; color: white; border-radius: 10px 10px 0 0;">
            <h1 style="margin: 0;">{settings.LEGAL_PLATFORM_NAME}</h1>
        </div>
        <div style="padding: 20px; background: #f8fafc; border-radius: 0 0 10px 10px;">
            <h2>Сброс пароля</h2>
            <p>Привет, <strong>{username}</strong>!</p>
            <p>Вы запросили сброс пароля. Перейдите по ссылке:</p>
            <p style="text-align: center; margin: 20px 0;">
                <a href="{link}" style="background: #7c3aed; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px;">Сбросить пароль</a>
            </p>
            <p style="color: #94a3b8; font-size: 12px;">Ссылка действительна 1 час. Если вы не запрашивали сброс, проигнорируйте это письмо.</p>
        </div>
    </body>
    </html>
    """
    text = f"Привет, {username}!\n\nСброс пароля: {link}"
    return send_email(to_email, f"Сброс пароля на {settings.LEGAL_PLATFORM_NAME}", html, text)


def _security_notice_time() -> str:
    try:
        tz = ZoneInfo("Europe/Moscow")
    except Exception:
        tz = ZoneInfo("UTC")
    return datetime.now(tz).strftime("%d.%m.%Y %H:%M (%Z)")


def _security_email_shell(title: str, inner_html: str) -> str:
    return f"""
    <html>
    <body style="font-family: Arial, sans-serif; max-width: 600px;">
        <div style="background: #7c3aed; padding: 20px; text-align: center; color: white; border-radius: 10px 10px 0 0;">
            <h1 style="margin: 0;">{settings.LEGAL_PLATFORM_NAME}</h1>
        </div>
        <div style="padding: 20px; background: #f8fafc; border-radius: 0 0 10px 10px;">
            <h2>{title}</h2>
            {inner_html}
            <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 20px 0;">
            <p style="color: #94a3b8; font-size: 12px;">
                Если это были не вы, немедленно смените пароль и обратитесь в поддержку:
                <a href="mailto:{settings.LEGAL_SUPPORT_EMAIL}">{settings.LEGAL_SUPPORT_EMAIL}</a>
            </p>
            <p style="color: #94a3b8; font-size: 12px; text-align: center;">
                © {datetime.now().year} {settings.LEGAL_PLATFORM_NAME}. {settings.LEGAL_OPERATOR_NAME}.
            </p>
        </div>
    </body>
    </html>
    """


def _method_label(method: str) -> str:
    labels = {
        "email": "email и пароль",
        "yandex": "Яндекс ID",
    }
    return labels.get(method, method)


def send_registration_notice_email(
    to_email: str,
    username: str,
    *,
    ip: str,
    user_agent: str,
    method: str = "email",
) -> bool:
    when = _security_notice_time()
    method_text = _method_label(method)
    html = _security_email_shell(
        "Аккаунт зарегистрирован",
        f"""
        <p>Здравствуйте, <strong>{username}</strong>!</p>
        <p>На {settings.LEGAL_PLATFORM_NAME} успешно создан аккаунт.</p>
        <ul style="padding-left: 18px; line-height: 1.7;">
            <li><strong>Способ:</strong> {method_text}</li>
            <li><strong>IP-адрес:</strong> {ip}</li>
            <li><strong>Устройство:</strong> {user_agent}</li>
            <li><strong>Дата и время:</strong> {when}</li>
        </ul>
        <p style="text-align: center; margin: 20px 0;">
            <a href="{_site_link('login')}" style="background: #7c3aed; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px;">Войти на сайт</a>
        </p>
        """,
    )
    text = (
        f"Аккаунт на {settings.LEGAL_PLATFORM_NAME} зарегистрирован.\n"
        f"Способ: {method_text}\nIP: {ip}\nВремя: {when}"
    )
    return send_email(
        to_email,
        f"Регистрация на {settings.LEGAL_PLATFORM_NAME}",
        html,
        text,
    )


def send_login_notice_email(
    to_email: str,
    username: str,
    *,
    ip: str,
    user_agent: str,
    method: str = "email",
) -> bool:
    when = _security_notice_time()
    method_text = _method_label(method)
    html = _security_email_shell(
        "Выполнен вход в аккаунт",
        f"""
        <p>Здравствуйте, <strong>{username}</strong>!</p>
        <p>В ваш аккаунт на {settings.LEGAL_PLATFORM_NAME} выполнен вход.</p>
        <ul style="padding-left: 18px; line-height: 1.7;">
            <li><strong>Способ:</strong> {method_text}</li>
            <li><strong>IP-адрес:</strong> {ip}</li>
            <li><strong>Устройство:</strong> {user_agent}</li>
            <li><strong>Дата и время:</strong> {when}</li>
        </ul>
        <p style="text-align: center; margin: 20px 0;">
            <a href="{_site_link('profile')}" style="background: #7c3aed; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px;">Открыть профиль</a>
        </p>
        """,
    )
    text = (
        f"Вход в аккаунт на {settings.LEGAL_PLATFORM_NAME}.\n"
        f"Способ: {method_text}\nIP: {ip}\nВремя: {when}"
    )
    return send_email(
        to_email,
        f"Вход в аккаунт {settings.LEGAL_PLATFORM_NAME}",
        html,
        text,
    )


def send_notification_email(to_email: str, username: str, notification_type: str, data: dict):
    """Уведомления (новые сообщения, ответы на форуме)"""
    templates = {
        "new_message": {
            "subject": "Новое сообщение в чате",
            "html": f"""
            <h2>Новое сообщение</h2>
            <p>Привет, {username}!</p>
            <p>Вам пришло новое сообщение от <strong>{data.get('from_user')}</strong>.</p>
            <p style="text-align: center; margin: 20px 0;">
                <a href="{_site_link('forum')}" style="background: #7c3aed; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px;">Перейти в чат</a>
            </p>
            """
        },
        "forum_reply": {
            "subject": "Ответ на вашу тему на форуме",
            "html": f"""
            <h2>Новый ответ на форуме</h2>
            <p>Привет, {username}!</p>
            <p>Пользователь <strong>{data.get('from_user')}</strong> ответил в теме:</p>
            <p style="background: #f1f5f9; padding: 12px; border-radius: 8px;"><strong>"{data.get('topic_title')}"</strong></p>
            <p style="text-align: center; margin: 20px 0;">
                <a href="{_site_link('forum')}" style="background: #7c3aed; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px;">Посмотреть ответ</a>
            </p>
            """
        },
        "subscription": {
            "subject": "Новый подписчик!",
            "html": f"""
            <h2>Новый подписчик</h2>
            <p>Привет, {username}!</p>
            <p>Пользователь <strong>{data.get('from_user')}</strong> подписался на вас.</p>
            <p style="text-align: center; margin: 20px 0;">
                <a href="{_site_link('profile')}" style="background: #7c3aed; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px;">Перейти в профиль</a>
            </p>
            """
        }
    }

    template = templates.get(notification_type, templates["new_message"])
    html = f"""
    <html>
    <body style="font-family: Arial, sans-serif; max-width: 600px;">
        <div style="background: #7c3aed; padding: 20px; text-align: center; color: white; border-radius: 10px 10px 0 0;">
            <h1 style="margin: 0;">{settings.LEGAL_PLATFORM_NAME}</h1>
        </div>
        <div style="padding: 20px; background: #f8fafc; border-radius: 0 0 10px 10px;">
            {template["html"]}
            <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 20px 0;">
            <p style="color: #94a3b8; font-size: 12px; text-align: center;">© 2026 {settings.LEGAL_PLATFORM_NAME}. Все права защищены компанией {settings.LEGAL_OPERATOR_NAME}.</p>
        </div>
    </body>
    </html>
    """
    text = f"{settings.LEGAL_PLATFORM_NAME}: {template['subject']}. Перейдите на сайт для подробностей."
    return send_email(to_email, template["subject"], html, text)
