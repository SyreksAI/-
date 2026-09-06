# app/schemas_forum.py
from pydantic import BaseModel, Field, validator
from typing import Optional, List
from datetime import datetime


# ============================================================
# 📁 КАТЕГОРИИ ФОРУМА
# ============================================================

class ForumCategoryCreate(BaseModel):
    """Создание категории"""
    name: str = Field(..., min_length=2, max_length=100, description="Название категории")
    description: Optional[str] = Field(None, max_length=500, description="Описание категории")
    icon: str = Field("fas fa-folder", description="Иконка Font Awesome")
    order: int = Field(0, description="Порядок отображения")

    @validator('name')
    def validate_name(cls, v):
        if not v.strip():
            raise ValueError('Название категории не может быть пустым')
        return v.strip()


class ForumCategoryUpdate(BaseModel):
    """Обновление категории"""
    name: Optional[str] = Field(None, min_length=2, max_length=100)
    description: Optional[str] = Field(None, max_length=500)
    icon: Optional[str] = None
    order: Optional[int] = None
    is_active: Optional[bool] = None


class ForumCategoryResponse(BaseModel):
    """Ответ с данными категории"""
    id: int
    name: str
    description: Optional[str]
    icon: str
    order: int
    is_active: bool
    topics_count: int = 0
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


# ============================================================
# 📄 ТЕМЫ ФОРУМА
# ============================================================

class ForumTopicCreate(BaseModel):
    """Создание темы"""
    title: str = Field(..., min_length=3, max_length=200, description="Заголовок темы")
    content: str = Field(..., min_length=10, description="Содержание темы (можно с HTML)")
    category_id: int = Field(..., description="ID категории")
    is_pinned: bool = False
    is_locked: bool = False

    @validator('title')
    def validate_title(cls, v):
        if not v.strip():
            raise ValueError('Заголовок не может быть пустым')
        return v.strip()

    @validator('content')
    def validate_content(cls, v):
        if not v.strip():
            raise ValueError('Содержание не может быть пустым')
        return v.strip()


class ForumTopicUpdate(BaseModel):
    """Обновление темы"""
    title: Optional[str] = Field(None, min_length=3, max_length=200)
    content: Optional[str] = Field(None, min_length=10)
    is_pinned: Optional[bool] = None
    is_locked: Optional[bool] = None


class ForumTopicResponse(BaseModel):
    """Ответ с данными темы"""
    id: int
    title: str
    content: str
    category_id: int
    category_name: str
    user_id: int
    username: str
    user_name: str
    views: int
    is_pinned: bool
    is_locked: bool
    posts_count: int = 0
    votes: int = 0
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


# ============================================================
# 💬 ПОСТЫ (ОТВЕТЫ) В ТЕМЕ
# ============================================================

class ForumPostCreate(BaseModel):
    """Создание поста (ответа)"""
    content: str = Field(..., min_length=1, max_length=5000, description="Текст ответа")

    @validator('content')
    def validate_content(cls, v):
        if not v.strip():
            raise ValueError('Текст ответа не может быть пустым')
        return v.strip()


class ForumPostUpdate(BaseModel):
    """Обновление поста"""
    content: Optional[str] = Field(None, min_length=1, max_length=5000)
    is_solution: Optional[bool] = None


class ForumPostResponse(BaseModel):
    """Ответ с данными поста"""
    id: int
    content: str
    topic_id: int
    user_id: int
    username: str
    user_name: str
    votes: int
    is_solution: bool
    comments_count: int = 0
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


# ============================================================
# 💬 КОММЕНТАРИИ К ПОСТАМ
# ============================================================

class ForumCommentCreate(BaseModel):
    """Создание комментария"""
    content: str = Field(..., min_length=1, max_length=1000, description="Текст комментария")

    @validator('content')
    def validate_content(cls, v):
        if not v.strip():
            raise ValueError('Текст комментария не может быть пустым')
        return v.strip()


class ForumCommentResponse(BaseModel):
    """Ответ с данными комментария"""
    id: int
    content: str
    post_id: int
    user_id: int
    username: str
    user_name: str
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


# ============================================================
# 📊 СТАТИСТИКА
# ============================================================

class ForumStatistics(BaseModel):
    """Статистика форума"""
    total_categories: int
    total_topics: int
    total_posts: int
    total_comments: int
    total_users: int
    online_users: int