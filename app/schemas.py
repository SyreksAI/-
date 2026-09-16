# app/schemas.py
from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator, model_validator
from typing import Optional, List, Any, Dict
from datetime import datetime

from app.password_utils import get_password_validation_error


# ===== USER SCHEMAS =====
class UserCreate(BaseModel):
    name: str = Field(..., min_length=2, max_length=100)
    username: str = Field(..., min_length=3, max_length=30, pattern="^[a-zA-Z0-9_]+$")
    email: EmailStr
    password: str = Field(..., min_length=8)
    recaptcha_token: Optional[str] = None
    accept_privacy_policy: bool = False
    accept_data_processing: bool = False
    accept_public_offer: bool = False
    legal_docs_version: str = "07.09.2026"
    
    @model_validator(mode='after')
    def validate_legal_consents(self):
        if not self.accept_privacy_policy:
            raise ValueError('Необходимо принять политику обработки персональных данных')
        if not self.accept_data_processing:
            raise ValueError('Необходимо дать согласие на обработку персональных данных')
        if not self.accept_public_offer:
            raise ValueError('Необходимо принять условия публичной оферты')
        return self
    
    @field_validator('password')
    @classmethod
    def validate_password(cls, v):
        error = get_password_validation_error(v)
        if error:
            raise ValueError(error)
        return v


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class UserPublicResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    username: str
    name: str
    role: str
    progress: int = 0
    is_online: bool = False


class UserResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

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


class UserUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=2, max_length=100)
    username: Optional[str] = Field(None, min_length=3, max_length=30, pattern="^[a-zA-Z0-9_]+$")
    email: Optional[EmailStr] = None
    password: Optional[str] = Field(None, min_length=8)
    role: Optional[str] = None  # ✅ Для админ-панели
    is_active: Optional[bool] = None  # ✅ Для админ-панели
    is_banned: Optional[bool] = None  # ✅ Для админ-панели

    @model_validator(mode='before')
    @classmethod
    def normalize_fields(cls, data):
        if not isinstance(data, dict):
            return data
        cleaned = dict(data)
        for key in ('name', 'username', 'email', 'password'):
            value = cleaned.get(key)
            if isinstance(value, str):
                value = value.strip()
                if key == 'password' and not value:
                    cleaned[key] = None
                else:
                    cleaned[key] = value
        return cleaned

    @field_validator('password')
    @classmethod
    def validate_password(cls, v):
        if v is None:
            return v
        error = get_password_validation_error(v)
        if error:
            raise ValueError(error)
        return v


class Token(BaseModel):
    access_token: str
    token_type: str
    user: UserResponse


class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str = Field(..., min_length=8)

    @field_validator('new_password')
    @classmethod
    def validate_new_password(cls, v):
        error = get_password_validation_error(v)
        if error:
            raise ValueError(error)
        return v


# ===== SUBSCRIPTION SCHEMAS =====
class SubscriptionRequest(BaseModel):
    following_id: int


class SubscriptionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

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
    model_config = ConfigDict(from_attributes=True)

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


# ===== CATEGORY SCHEMAS =====
class CategoryCreate(BaseModel):
    name: str
    icon: str = "fas fa-code"
    topics: List[Any] = []


class CategoryResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    icon: str
    topics: List[Any]
    is_active: bool = True


# ===== GROUP SCHEMAS =====
class GroupCreate(BaseModel):
    name: str
    member_ids: List[int]


class GroupResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    creatorId: int
    members: List[int]
    isGroup: bool = True
    is_active: bool = True


# ===== ADMIN SCHEMAS =====
class AdminLogResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    admin_id: int
    admin_name: str
    action: str
    target_type: str
    target_id: str
    details: Dict[str, Any]
    created_at: datetime


class AdminUserUpdate(BaseModel):
    role: Optional[str] = None
    is_active: Optional[bool] = None
    is_banned: Optional[bool] = None
    reason: Optional[str] = None


class AdminRoleUpdate(BaseModel):
    role: str


class AdminUserListResponse(BaseModel):
    items: List[UserResponse]
    total: int
    page: int
    page_size: int


class AdminAuditItem(BaseModel):
    id: int
    admin_id: int
    admin_name: str
    action: str
    target_type: str
    target_id: str
    payload: Dict[str, Any]
    created_at: datetime


class AdminAuditListResponse(BaseModel):
    items: List[AdminAuditItem]
    total: int
    page: int
    page_size: int


class AdminStatsResponse(BaseModel):
    total_users: int
    banned_users: int
    online_users: int
    users_by_role: Dict[str, int]
