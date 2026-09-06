# app/schemas.py
from pydantic import BaseModel, EmailStr, Field, validator
from typing import Optional, List, Any, Dict
from datetime import datetime
import re


# ===== USER SCHEMAS =====
class UserCreate(BaseModel):
    name: str = Field(..., min_length=2, max_length=100)
    username: str = Field(..., min_length=3, max_length=30, pattern="^[a-zA-Z0-9_]+$")
    email: EmailStr
    password: str = Field(..., min_length=8)
    recaptcha_token: Optional[str] = None
    
    @validator('password')
    def validate_password(cls, v):
        if not any(c.isupper() for c in v):
            raise ValueError('Пароль должен содержать заглавную букву')
        if not any(c.islower() for c in v):
            raise ValueError('Пароль должен содержать строчную букву')
        if not any(c.isdigit() for c in v):
            raise ValueError('Пароль должен содержать цифру')
        if not any(c in "!@#$%^&*()_+-=[]{}|;:,.<>?" for c in v):
            raise ValueError('Пароль должен содержать спецсимвол')
        return v


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
    is_active: bool = True
    is_banned: bool = False

    class Config:
        from_attributes = True


class UserUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=2, max_length=100)
    username: Optional[str] = Field(None, min_length=3, max_length=30, pattern="^[a-zA-Z0-9_]+$")
    email: Optional[EmailStr] = None
    password: Optional[str] = Field(None, min_length=8)
    role: Optional[str] = None  # ✅ Для админ-панели
    is_active: Optional[bool] = None  # ✅ Для админ-панели
    is_banned: Optional[bool] = None  # ✅ Для админ-панели


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
class MessageCreate(BaseModel):
    text: str
    chat_id: str = "general"
    recipient_id: Optional[int] = None
    files: List[Dict[str, Any]] = []
    reply_to: Optional[Dict[str, Any]] = None


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
    reply_to: Optional[Dict[str, Any]] = None
    is_deleted: bool = False
    edited_at: Optional[datetime] = None

    class Config:
        from_attributes = True


# ===== CATEGORY SCHEMAS =====
class CategoryCreate(BaseModel):
    name: str
    icon: str = "fas fa-code"
    topics: List[Any] = []


class CategoryResponse(BaseModel):
    id: int
    name: str
    icon: str
    topics: List[Any]
    is_active: bool = True

    class Config:
        from_attributes = True


# ===== GROUP SCHEMAS =====
class GroupCreate(BaseModel):
    name: str
    member_ids: List[int]


class GroupResponse(BaseModel):
    id: str
    name: str
    creatorId: int
    members: List[int]
    isGroup: bool = True
    is_active: bool = True

    class Config:
        from_attributes = True


# ===== ADMIN SCHEMAS =====
class AdminLogResponse(BaseModel):
    id: int
    admin_id: int
    admin_name: str
    action: str
    target_type: str
    target_id: str
    details: Dict[str, Any]
    created_at: datetime

    class Config:
        from_attributes = True


class AdminUserUpdate(BaseModel):
    role: Optional[str] = None
    is_active: Optional[bool] = None
    is_banned: Optional[bool] = None
    reason: Optional[str] = None