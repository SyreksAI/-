# app/recaptcha.py
import requests
import os
from dotenv import load_dotenv

load_dotenv()

RECAPTCHA_SECRET_KEY = os.getenv("SECRET_KEY_RE_CAPTCHA")

def verify_recaptcha(token: str) -> bool:
    if not token:
        return False
    
    url = "https://www.google.com/recaptcha/api/siteverify"
    data = {
        "secret": RECAPTCHA_SECRET_KEY,
        "response": token
    }
    
    try:
        response = requests.post(
            url, 
            data={'secret': RECAPTCHA_SECRET_KEY, 'response': token},
            timeout=5)
        result = response.json()
        print(f"🔍 Полный ответ от Google: {result}")
        print(f"🔍 reCAPTCHA Google response: {result}")  # 👈 ДОБАВЬТЕ ЭТО
        return result.get("success", False)
    except Exception as e:
        print(f"❌ Ошибка проверки reCAPTCHA: {e}")
        return False