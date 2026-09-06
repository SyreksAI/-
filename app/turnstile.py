import requests
import os
from dotenv import load_dotenv

load_dotenv()

TURNSTILE_SECRET_KEY = os.getenv("RECAPTCHA_SECRET_KEY")  # 👈 используем ту же переменную

def verify_turnstile(token: str) -> bool:
    if not token:
        return False
    
    url = "https://challenges.cloudflare.com/turnstile/v0/siteverify"
    data = {
        "secret": TURNSTILE_SECRET_KEY,
        "response": token
    }
    
    try:
        response = requests.post(url, data=data, timeout=5)
        result = response.json()
        print(f"🔍 Turnstile response: {result}")
        return result.get("success", False)
    except Exception as e:
        print(f"❌ Ошибка проверки Turnstile: {e}")
        return False