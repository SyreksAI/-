"""
Маршруты аутентификации DubPar
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from passlib.context import CryptContext
from jose import jwt, JWTError
from datetime import datetime, timedelta
import logging

from ..config import get_settings
from ..database import get_db
from ..models import User
from ..schemas import UserCreate, UserLogin, UserResponse, Token, AdminLogin, AdminResponse

logger = logging.getLogger(__name__)

router = APIRouter()
pwd_context = CryptContext(schemes=['pbkdf2_sha256'], deprecated='auto')
settings = get_settings()


def get_password_hash(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)


def create_access_token(data: dict, expires_delta: timedelta = None) -> str:
    to_encode = data.copy()
    expire = datetime.utcnow() + (expires_delta or timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES))
    to_encode.update({'exp': expire})
    return jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


async def get_current_user_from_token(token: str, db: Session = Depends(get_db)) -> User:
    """Получить текущего пользователя из JWT токена"""
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        user_id = int(payload.get('sub'))
        if user_id is None:
            raise HTTPException(status_code=401, detail="Неверный токен")
    except JWTError:
        raise HTTPException(status_code=401, detail="Неверный токен")
    
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=401, detail="Пользователь не найден")
    return user


@router.post('/register', response_model=Token)
async def register(user: UserCreate, db: Session = Depends(get_db)):
    """Регистрация нового пользователя"""
    # Проверка уникальности username
    db_user_by_username = db.query(User).filter(User.username == user.username).first()
    if db_user_by_username:
        raise HTTPException(status_code=400, detail='Username уже занят')
    
    # Проверка уникальности email
    db_user_by_email = db.query(User).filter(User.email == user.email).first()
    if db_user_by_email:
        raise HTTPException(status_code=400, detail='Email уже зарегистрирован')
    
    hashed_password = get_password_hash(user.password)
    db_user = User(
        username=user.username,
        name=user.name,
        email=user.email.lower(),
        password=hashed_password,
        registered=datetime.now().strftime('%d.%m.%Y')
    )
    db.add(db_user)
    db.commit()
    db.refresh(db_user)
    
    token = create_access_token({'sub': str(db_user.id)})
    
    logger.info(f"Зарегистрирован новый пользователь: {db_user.username} (ID: {db_user.id})")
    
    return Token(
        access_token=token,
        token_type='bearer',
        user=UserResponse(
            id=db_user.id,
            username=db_user.username,
            name=db_user.name,
            email=db_user.email,
            role=db_user.role,
            registered=db_user.registered,
            languages=db_user.languages or [],
            topics_count=db_user.topics_count or 0,
            progress=db_user.progress or 0,
            is_online=db_user.is_online
        )
    )


@router.post('/login', response_model=Token)
async def login(user: UserLogin, db: Session = Depends(get_db)):
    """Вход пользователя"""
    db_user = db.query(User).filter(User.email == user.email.lower()).first()
    if not db_user:
        raise HTTPException(status_code=401, detail='Неверный email или пароль')
    
    if not verify_password(user.password, db_user.password):
        raise HTTPException(status_code=401, detail='Неверный email или пароль')
    
    token = create_access_token({'sub': str(db_user.id)})
    
    logger.info(f"Пользователь {db_user.username} вошел в систему")
    
    return Token(
        access_token=token,
        token_type='bearer',
        user=UserResponse(
            id=db_user.id,
            username=db_user.username,
            name=db_user.name,
            email=db_user.email,
            role=db_user.role,
            registered=db_user.registered,
            languages=db_user.languages or [],
            topics_count=db_user.topics_count or 0,
            progress=db_user.progress or 0,
            is_online=db_user.is_online
        )
    )


@router.post('/admin/login', response_model=AdminResponse)
async def admin_login(admin: AdminLogin):
    """Вход администратора"""
    if admin.username != settings.ADMIN_USERNAME:
        raise HTTPException(status_code=401, detail='Неверные учетные данные администратора')
    
    if not verify_password(admin.password, get_password_hash(settings.ADMIN_PASSWORD)):
        raise HTTPException(status_code=401, detail='Неверные учетные данные администратора')
    
    logger.info(f"Администратор {admin.username} вошел в панель управления")
    
    return AdminResponse(
        username=settings.ADMIN_USERNAME,
        email=settings.ADMIN_EMAIL,
        role="admin",
        logged_in=True
    )