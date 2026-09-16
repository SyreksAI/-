import logging

import httpx

from app.config import settings

logger = logging.getLogger(__name__)


def verify_turnstile(token: str) -> bool:
    if not token:
        return False

    if settings.SKIP_TURNSTILE_VERIFY:
        logger.warning("Turnstile verification skipped (SKIP_TURNSTILE_VERIFY=true)")
        return True

    if not settings.TURNSTILE_SECRET_KEY:
        if settings.DEBUG:
            logger.warning("Turnstile secret not configured — skipping verification in dev mode")
            return True
        logger.error("Turnstile secret key is not configured")
        return False

    url = "https://challenges.cloudflare.com/turnstile/v0/siteverify"
    data = {
        "secret": settings.TURNSTILE_SECRET_KEY,
        "response": token,
    }

    try:
        with httpx.Client(timeout=5.0) as client:
            response = client.post(url, data=data)
            result = response.json()
        logger.debug("Turnstile response: %s", result)
        return bool(result.get("success", False))
    except Exception as e:
        logger.error("Turnstile verification error: %s", e)
        return False
