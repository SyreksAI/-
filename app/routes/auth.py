from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from passlib.context import CryptContext
from jose import jwt
from datetime import datetime, timedelta
import os
from dotenv import load_dotenv

from ..database import get_db
from ..models import User
from ..schemas import UserCreate, UserLogin, UserResponse, Token

load_dotenv()

router = APIRouter()
pwd_context = CryptContext(schemes=['pbkdf2_sha256'], deprecated='auto')

SECRET_KEY = os.getenv('SECRET_KEY', 'your-super-secret-key-2026')
ALGORITHM = 'HS256'
ACCESS_TOKEN_EXPIRE_MINUTES = 10080


def get_password_hash(password):
    return pwd_context.hash(password)


def verify_password(plain_password, hashed_password):
    return pwd_context.verify(plain_password, hashed_password)


def create_access_token(data: dict):
    to_encode = data.copy()
    expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({'exp': expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


@router.post('/register', response_model=Token)
async def register(user: UserCreate, db: Session = Depends(get_db)):
    try:
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
            registered=datetime.now().strftime('%d.%m.%Y')
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
                registered=db_user.registered,
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
async def login(user: UserLogin, db: Session = Depends(get_db)):
    try:
        db_user = db.query(User).filter(User.email == user.email).first()
        if not db_user:
            raise HTTPException(status_code=401, detail='Invalid credentials')
        
        if not verify_password(user.password, db_user.password):
            raise HTTPException(status_code=401, detail='Invalid credentials')
        
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
                registered=db_user.registered,
                languages=db_user.languages or [],
                topics_count=db_user.topics_count or 0,
                progress=db_user.progress or 0,
                is_online=db_user.is_online
            )
        )
    except HTTPException:
        raise
    except Exception as e:
        print(f'Login error: {e}')
        raise HTTPException(status_code=500, detail=str(e))