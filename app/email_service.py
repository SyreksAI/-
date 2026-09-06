# app/email_service.py
import smtplib
import os
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from dotenv import load_dotenv
import logging

load_dotenv()

logger = logging.getLogger(__name__)

SMTP_HOST = os.getenv("SMTP_HOST", "smtp.gmail.com")
SMTP_PORT = int(os.getenv("SMTP_PORT", 587))
SMTP_USER = os.getenv("SMTP_USER")
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD")
FROM_EMAIL = os.getenv("FROM_EMAIL", SMTP_USER)


def send_email(to_email: str, subject: str, html_content: str, text_content: str = None):
    """Отправка email"""
    try:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"] = FROM_EMAIL
        msg["To"] = to_email

        if text_content:
            part_text = MIMEText(text_content, "plain")
            msg.attach(part_text)

        part_html = MIMEText(html_content, "html")
        msg.attach(part_html)

        if SMTP_PORT == 465:
            with smtplib.SMTP_SSL(SMTP_HOST, SMTP_PORT) as server:
                server.login(SMTP_USER, SMTP_PASSWORD)
                server.send_message(msg)
        else:
            with smtplib.SMTP(SMTP_HOST, SMTP_PORT) as server:
                server.starttls()
                server.login(SMTP_USER, SMTP_PASSWORD)
                server.send_message(msg)

        logger.info(f"✅ Email отправлен на {to_email}")
        return True
    except Exception as e:
        logger.error(f"❌ Ошибка отправки email: {e}")
        return False

def send_verification_email(to_email: str, username: str, token: str):
    """Подтверждение email"""
    link = f"http://localhost:8080/verify-email?token={token}"
    html = f"""
    <html>
    <body style="font-family: Arial, sans-serif; max-width: 600px;">
        <div style="background: #7c3aed; padding: 20px; text-align: center; color: white; border-radius: 10px 10px 0 0;">
            <h1 style="margin: 0;">ДубльПар.рф</h1>
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
    return send_email(to_email, "Подтверждение email на ДубльПар.рф", html, text)


def send_password_reset_email(to_email: str, username: str, token: str):
    """Сброс пароля"""
    link = f"http://localhost:8080/reset-password?token={token}"
    html = f"""
    <html>
    <body style="font-family: Arial, sans-serif; max-width: 600px;">
        <div style="background: #7c3aed; padding: 20px; text-align: center; color: white; border-radius: 10px 10px 0 0;">
            <h1 style="margin: 0;">ДубльПар.рф</h1>
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
    return send_email(to_email, "Сброс пароля на ДубльПар.рф", html, text)


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
                <a href="http://localhost:8080/forum" style="background: #7c3aed; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px;">Перейти в чат</a>
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
                <a href="http://localhost:8080/forum" style="background: #7c3aed; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px;">Посмотреть ответ</a>
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
                <a href="http://localhost:8080/profile" style="background: #7c3aed; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px;">Перейти в профиль</a>
            </p>
            """
        }
    }

    template = templates.get(notification_type, templates["new_message"])
    html = f"""
    <html>
    <body style="font-family: Arial, sans-serif; max-width: 600px;">
        <div style="background: #7c3aed; padding: 20px; text-align: center; color: white; border-radius: 10px 10px 0 0;">
            <h1 style="margin: 0;">ДубльПар.рф</h1>
        </div>
        <div style="padding: 20px; background: #f8fafc; border-radius: 0 0 10px 10px;">
            {template["html"]}
            <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 20px 0;">
            <p style="color: #94a3b8; font-size: 12px; text-align: center;">ДубльПар.рф — образовательная платформа</p>
        </div>
    </body>
    </html>
    """
    text = f"ДубльПар.рф: {template['subject']}. Перейдите на сайт для подробностей."
    return send_email(to_email, template["subject"], html, text)