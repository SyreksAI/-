# app/routes/auth.py
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session
from datetime import datetime, timedelta
from jose import jwt
from passlib.context import CryptContext
import os
from dotenv import load_dotenv

from app.database import get_db
from app.models import User
from app.schemas import UserCreate, UserLogin, UserResponse, Token
from app.recaptcha import verify_recaptcha
from app.turnstile import verify_turnstile
from app.email_service import send_password_reset_email, send_verification_email
from app.dependencies import get_current_user

load_dotenv()

router = APIRouter()
pwd_context = CryptContext(schemes=['pbkdf2_sha256'], deprecated='auto')

SECRET_KEY = os.getenv('SECRET_KEY', 'your-super-secret-key-2026')
ALGORITHM = 'HS256'
ACCESS_TOKEN_EXPIRE_MINUTES = 10080


# ===== ✅ ВАЛИДАЦИЯ ПАРОЛЯ =====
def validate_password(password: str) -> bool:
    """Проверка сложности пароля"""
    if len(password) < 8:
        return False
    if not any(c.isupper() for c in password):
        return False
    if not any(c.islower() for c in password):
        return False
    if not any(c.isdigit() for c in password):
        return False
    if not any(c in "!@#$%^&*()_+-=[]{}|;:,.<>?" for c in password):
        return False
    return True
# ===============================


def get_password_hash(password):
    return pwd_context.hash(password)


def verify_password(plain_password, hashed_password):
    return pwd_context.verify(plain_password, hashed_password)


def format_registered(value) -> str:
    if value is None:
        return ""
    if hasattr(value, "strftime"):
        return value.strftime("%d.%m.%Y")
    return str(value)


def create_access_token(data: dict):
    to_encode = data.copy()
    expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({'exp': expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


@router.post('/register', response_model=Token)
async def register(
    user: UserCreate,
    db: Session = Depends(get_db)
):
    try:
        # ✅ ЛОГИРУЕМ ВСЁ, ЧТО ПРИШЛО
        print("=" * 60)
        print("📥 REGISTER REQUEST RECEIVED")
        print(f"📥 user: {user}")
        print(f"📥 user.dict(): {user.dict()}")
        print("=" * 60)
        
        # ✅ БЕРЁМ ТОКЕН ИЗ СХЕМЫ
        recaptcha_token = user.recaptcha_token
        print(f"🔑 recaptcha_token: {recaptcha_token}")
        
        if not recaptcha_token:
            raise HTTPException(status_code=400, detail="Требуется подтверждение reCAPTCHA")
        
        if not verify_turnstile(recaptcha_token):
            raise HTTPException(status_code=400, detail="Ошибка проверки. Попробуйте снова.")
        
        # ===== ✅ ВАЛИДАЦИЯ ПАРОЛЯ =====
        if not validate_password(user.password):
            raise HTTPException(
                status_code=400,
                detail="Пароль должен содержать минимум 8 символов, включая заглавную и строчную буквы, цифру и спецсимвол"
            )
        # ================================
        
        # Проверка уникальности username
        db_user_by_username = db.query(User).filter(User.username == user.username).first()
        if db_user_by_username:
            raise HTTPException(status_code=400, detail='Username already taken')
        
        # Проверка уникальности email
        db_user_by_email = db.query(User).filter(User.email == user.email).first()
        if db_user_by_email:
            raise HTTPException(status_code=400, detail='Email already registered')
        
        hashed_password = get_password_hash(user.password)
        db_user = User(
            username=user.username,
            name=user.name,
            email=user.email,
            password=hashed_password,
        )
        db.add(db_user)
        db.commit()
        db.refresh(db_user)
        
        token = create_access_token({'sub': str(db_user.id)})
        
        return Token(
            access_token=token,
            token_type='bearer',
            user=UserResponse(
                id=db_user.id,
                username=db_user.username,
                name=db_user.name,
                email=db_user.email,
                role=db_user.role,
                registered=format_registered(db_user.registered),
                languages=db_user.languages or [],
                topics_count=db_user.topics_count or 0,
                progress=db_user.progress or 0,
                is_online=db_user.is_online
            )
        )
    except HTTPException:
        raise
    except Exception as e:
        print(f'Register error: {e}')
        raise HTTPException(status_code=500, detail=str(e))


@router.post('/login', response_model=Token)
async def login(
    user: UserLogin,
    db: Session = Depends(get_db)
):
    try:
        db_user = db.query(User).filter(
            (User.email == user.email) | (User.username == user.email)
        ).first()
        
        if not db_user:
            raise HTTPException(status_code=401, detail='Invalid credentials')
        
        if not verify_password(user.password, db_user.password):
            raise HTTPException(status_code=401, detail='Invalid credentials')
        
        if db_user.is_banned:
            raise HTTPException(
                status_code=403,
                detail="Ваш аккаунт был заблокирован. Для разблокировки обратитесь к администратору."
            )
        
        token = create_access_token({'sub': str(db_user.id)})
        
        return Token(
            access_token=token,
            token_type='bearer',
            user=UserResponse(
                id=db_user.id,
                username=db_user.username,
                name=db_user.name,
                email=db_user.email,
                role=db_user.role,
                registered=format_registered(db_user.registered),
                languages=db_user.languages or [],
                topics_count=db_user.topics_count or 0,
                progress=db_user.progress or 0,
                is_online=db_user.is_online,
                is_banned=db_user.is_banned
            )
        )
    except HTTPException:
        raise
    except Exception as e:
        print(f'Login error: {e}')
        raise HTTPException(status_code=500, detail=str(e))


# ===== ВОССТАНОВЛЕНИЕ ПАРОЛЯ =====
@router.post("/forgot-password")
async def forgot_password(
    email: str,
    db: Session = Depends(get_db)
):
    user = db.query(User).filter(User.email == email).first()
    if not user:
        raise HTTPException(status_code=404, detail="Пользователь с таким email не найден")

    token = create_access_token({"sub": str(user.id), "reset": True})
    
    # ✅ ВРЕМЕННО ОТКЛЮЧАЕМ EMAIL
    print(f"🔑 ТОКЕН ДЛЯ СБРОСА ПАРОЛЯ: {token}")
    print(f"📧 Для пользователя: {user.email}")
    
    return {"message": "Токен сброса создан (см. логи)", "token": token}


@router.post("/reset-password")
async def reset_password(
    token: str,
    new_password: str,
    db: Session = Depends(get_db)
):
    """Сброс пароля по токену"""
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id = payload.get("sub")
        if not payload.get("reset"):
            raise HTTPException(status_code=400, detail="Неверный токен")
    except:
        raise HTTPException(status_code=400, detail="Неверный или истёкший токен")

    user = db.query(User).filter(User.id == int(user_id)).first()
    if not user:
        raise HTTPException(status_code=404, detail="Пользователь не найден")

    # Валидация пароля
    if not validate_password(new_password):
        raise HTTPException(
            status_code=400,
            detail="Пароль должен содержать минимум 8 символов, включая заглавную и строчную буквы, цифру и спецсимвол"
        )

    user.password = get_password_hash(new_password)
    db.commit()
    
    return {"message": "Пароль успешно изменён"}


# ===== ПОДТВЕРЖДЕНИЕ EMAIL =====
@router.post("/send-verification")
async def send_verification_email_endpoint(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Отправить письмо для подтверждения email"""
    token = create_access_token({"sub": str(current_user.id), "verify": True})
    send_verification_email(current_user.email, current_user.username, token)
    return {"message": "Письмо с подтверждением отправлено"}


@router.post("/verify-email")
async def verify_email(
    token: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Подтверждение email по токену"""
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id = payload.get("sub")
        if not payload.get("verify"):
            raise HTTPException(status_code=400, detail="Неверный токен")
        if int(user_id) != current_user.id:
            raise HTTPException(status_code=403, detail="Неверный пользователь")
    except:
        raise HTTPException(status_code=400, detail="Неверный или истёкший токен")

    current_user.is_verified = True
    db.commit()

    return {"message": "Email успешно подтверждён"}