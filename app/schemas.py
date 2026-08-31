"""
Схемы Pydantic для DubPar API
"""
from pydantic import BaseModel, EmailStr, Field, field_validator
from typing import Optional, List, Any, Dict
from datetime import datetime
import re


# ===== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ВАЛИДАЦИИ =====
def validate_password_strength(password: str) -> str:
    """Проверка сложности пароля"""
    if len(password) < 8:
        raise ValueError("Пароль должен содержать минимум 8 символов")
    if not re.search(r"[A-Z]", password):
        raise ValueError("Пароль должен содержать хотя бы одну заглавную букву")
    if not re.search(r"\d", password):
        raise ValueError("Пароль должен содержать хотя бы одну цифру")
    return password


# ===== USER SCHEMAS =====
class UserCreate(BaseModel):
    name: str = Field(..., min_length=2, max_length=100)
    username: str = Field(..., min_length=3, max_length=30, pattern="^[a-zA-Z0-9_]+$")
    email: EmailStr
    password: str
    
    @field_validator('password')
    @classmethod
    def validate_password(cls, v):
        return validate_password_strength(v)


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class UserResponse(BaseModel):
    id: int
    username: str
    name: str
    email: str
    role: str
    registered: str
    languages: List[str]
    topics_count: int
    progress: int
    is_online: bool

    class Config:
        from_attributes = True


class UserUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=2, max_length=100)
    username: Optional[str] = Field(None, min_length=3, max_length=30, pattern="^[a-zA-Z0-9_]+$")
    email: Optional[EmailStr] = None
    password: Optional[str] = None
    
    @field_validator('password')
    @classmethod
    def validate_password(cls, v):
        if v is not None:
            return validate_password_strength(v)
        return v


class Token(BaseModel):
    access_token: str
    token_type: str
    user: UserResponse


# ===== SUBSCRIPTION SCHEMAS =====
class SubscriptionRequest(BaseModel):
    following_id: int


class SubscriptionResponse(BaseModel):
    id: int
    follower_id: int
    follower_username: str
    follower_name: str
    following_id: int
    following_username: str
    following_name: str
    status: str
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class SubscriptionStatus(BaseModel):
    status: str


# ===== MESSAGE SCHEMAS =====
class ReplyToInfo(BaseModel):
    """Информация о сообщении, на которое отвечаем"""
    message_id: int
    text: str
    username: str
    user_id: int


class MessageCreate(BaseModel):
    text: str = Field(..., min_length=1, max_length=5000)
    chat_id: str = "general"
    recipient_id: Optional[int] = None
    files: List[Dict[str, Any]] = []
    reply_to: Optional[ReplyToInfo] = None


class MessageResponse(BaseModel):
    id: int
    user_id: int
    username: str
    user_name: str
    recipient_id: Optional[int]
    recipient_name: Optional[str]
    text: str
    chat_id: str
    is_admin: bool
    is_system: bool
    read: bool
    timestamp: datetime
    files: List[Dict[str, Any]] = []
    reply_to: Optional[ReplyToInfo] = None

    class Config:
        from_attributes = True


# ===== CATEGORY SCHEMAS =====
class CategoryCreate(BaseModel):
    name: str = Field(..., min_length=2, max_length=100)
    icon: str = "fas fa-code"
    topics: List[Any] = []


class CategoryResponse(BaseModel):
    id: int
    name: str
    icon: str
    topics: List[Any]

    class Config:
        from_attributes = True


# ===== GROUP SCHEMAS =====
class GroupCreate(BaseModel):
    name: str = Field(..., min_length=2, max_length=100)
    member_ids: List[int]


class GroupResponse(BaseModel):
    id: str
    name: str
    creatorId: int
    members: List[int]
    isGroup: bool = True

    class Config:
        from_attributes = True


# ===== ADMIN SCHEMAS =====
class AdminLogin(BaseModel):
    username: str
    password: str


class AdminResponse(BaseModel):
    username: str
    email: str
    role: str = "admin"
    logged_in: bool = True