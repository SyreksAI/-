# app/models.py
from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey, Text, JSON
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from .database import Base


class User(Base):
    __tablename__ = "users"
    
    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True, nullable=False)
    name = Column(String, nullable=False)
    email = Column(String, unique=True, index=True, nullable=False)
    password = Column(String, nullable=False)
    role = Column(String, default="student")  # 'student', 'admin', 'moderator'
    registered = Column(DateTime, server_default=func.now())
    languages = Column(JSON, default=[])
    topics_count = Column(Integer, default=0)
    progress = Column(Integer, default=0)
    is_online = Column(Boolean, default=False)
    last_activity = Column(DateTime, default=func.now())
    last_seen = Column(DateTime, default=func.now())
    created_at = Column(DateTime, server_default=func.now())
    is_active = Column(Boolean, default=True)
    is_banned = Column(Boolean, default=False)
    is_verified = Column(Boolean, default=False)
    bookmarks = Column(JSON, default=[])  # [{topic_id: 1}, {subtopic_id: 2}]
    email_notifications = Column(Boolean, default=True)  # Настройка уведомлений
    
    # Связи
    messages_sent = relationship("Message", foreign_keys="Message.user_id", back_populates="sender")
    messages_received = relationship("Message", foreign_keys="Message.recipient_id", back_populates="recipient")
    subscriptions_sent = relationship("Subscription", foreign_keys="Subscription.follower_id", back_populates="follower")
    subscriptions_received = relationship("Subscription", foreign_keys="Subscription.following_id", back_populates="following")
    
    # ✅ НОВОЕ: связь с темами форума
    forum_topics = relationship("ForumTopic", back_populates="author")
    forum_posts = relationship("ForumPost", back_populates="author")
    forum_comments = relationship("ForumComment", back_populates="author")


class Subscription(Base):
    __tablename__ = "subscriptions"
    
    id = Column(Integer, primary_key=True, index=True)
    follower_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    following_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    status = Column(String, default="pending")  # 'pending', 'approved', 'rejected'
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())
    
    follower = relationship("User", foreign_keys=[follower_id], back_populates="subscriptions_sent")
    following = relationship("User", foreign_keys=[following_id], back_populates="subscriptions_received")


class Message(Base):
    __tablename__ = "messages"
    
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    recipient_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    text = Column(Text, nullable=False)
    chat_id = Column(String, default="general")
    is_admin = Column(Boolean, default=False)
    is_system = Column(Boolean, default=False)
    read = Column(Boolean, default=False)
    timestamp = Column(DateTime, server_default=func.now())
    files = Column(JSON, default=[])
    reply_to_id = Column(Integer, ForeignKey("messages.id"), nullable=True)
    order = Column(Integer, default=0)
    is_deleted = Column(Boolean, default=False)
    deleted_at = Column(DateTime, nullable=True)
    edited_at = Column(DateTime, nullable=True)
    
    reply_to = relationship("Message", remote_side=[id], foreign_keys=[reply_to_id])
    sender = relationship("User", foreign_keys=[user_id], back_populates="messages_sent")
    recipient = relationship("User", foreign_keys=[recipient_id], back_populates="messages_received")


class Group(Base):
    __tablename__ = "groups"
    
    id = Column(String, primary_key=True, index=True)
    name = Column(String, nullable=False)
    creator_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    members = Column(JSON, nullable=False)
    created_at = Column(DateTime, server_default=func.now())
    is_active = Column(Boolean, default=True)
    
    creator = relationship("User", foreign_keys=[creator_id])


# ============================================================
# 🆕 НОВЫЕ МОДЕЛИ ДЛЯ ФОРУМА
# ============================================================

class ForumCategory(Base):
    """Категория форума (например: Python, Docker, C++)"""
    __tablename__ = "forum_categories"
    
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), unique=True, nullable=False)
    description = Column(Text, nullable=True)
    icon = Column(String(50), default="fas fa-folder")
    order = Column(Integer, default=0)  # Порядок отображения
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())
    
    # Связи
    topics = relationship("ForumTopic", back_populates="category", cascade="all, delete-orphan")


class ForumTopic(Base):
    """Тема форума (например: FastAPI, Django)"""
    __tablename__ = "forum_topics"
    
    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(200), nullable=False)
    content = Column(Text, nullable=True)  # Объяснение темы (легкими словами)
    category_id = Column(Integer, ForeignKey("forum_categories.id"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    
    # Статистика
    views = Column(Integer, default=0)
    is_pinned = Column(Boolean, default=False)  # Закрепленная тема
    is_locked = Column(Boolean, default=False)  # Закрытая для комментариев
    
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())
    
    # Связи
    category = relationship("ForumCategory", back_populates="topics")
    author = relationship("User", back_populates="forum_topics")
    posts = relationship("ForumPost", back_populates="topic", cascade="all, delete-orphan")


class ForumPost(Base):
    """Ответ/пост в теме форума"""
    __tablename__ = "forum_posts"
    
    id = Column(Integer, primary_key=True, index=True)
    content = Column(Text, nullable=False)
    topic_id = Column(Integer, ForeignKey("forum_topics.id"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    
    # Голосование
    votes = Column(Integer, default=0)  # Сумма голосов (лайки - дизлайки)
    is_solution = Column(Boolean, default=False)  # Отмечено как решение
    
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())
    
    # Связи
    topic = relationship("ForumTopic", back_populates="posts")
    author = relationship("User", back_populates="forum_posts")
    comments = relationship("ForumComment", back_populates="post", cascade="all, delete-orphan")


class ForumComment(Base):
    """Комментарий к посту (для обсуждения)"""
    __tablename__ = "forum_comments"
    
    id = Column(Integer, primary_key=True, index=True)
    content = Column(Text, nullable=False)
    post_id = Column(Integer, ForeignKey("forum_posts.id"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())
    
    # Связи
    post = relationship("ForumPost", back_populates="comments")
    author = relationship("User", back_populates="forum_comments")


# ============================================================
# СТАРЫЕ МОДЕЛИ (оставляем для совместимости)
# ============================================================

class Category(Base):
    """⚠️ СТАРАЯ МОДЕЛЬ - скоро будет удалена. Используйте ForumCategory"""
    __tablename__ = "categories"
    
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, nullable=False)
    icon = Column(String, default="fas fa-code")
    topics = Column(JSON, default=[])  # ⚠️ Временное решение
    is_active = Column(Boolean, default=True)


class AdminLog(Base):
    """Логи действий администраторов"""
    __tablename__ = "admin_logs"
    
    id = Column(Integer, primary_key=True, index=True)
    admin_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    action = Column(String, nullable=False)
    target_type = Column(String, nullable=False)
    target_id = Column(String, nullable=False)
    details = Column(JSON, default={})
    created_at = Column(DateTime, server_default=func.now())
    
    admin = relationship("User", foreign_keys=[admin_id])

# app/models.py - добавить после существующих моделей

class Technology(Base):
    """Технология (Python, Docker, C++)"""
    __tablename__ = "technologies"
    
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), unique=True, nullable=False)
    icon = Column(String(50), default="fas fa-code")
    description = Column(Text, nullable=True)
    sort_order = Column(Integer, default=0)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())
    
    topics = relationship("StudyTopic", back_populates="technology", cascade="all, delete-orphan")


class StudyTopic(Base):
    """Тема (FastAPI, Django, STL)"""
    __tablename__ = "study_topics"
    
    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(200), nullable=False)
    description = Column(Text, nullable=True)  # Содержание с форматированием
    technology_id = Column(Integer, ForeignKey("technologies.id"), nullable=False)
    sort_order = Column(Integer, default=0)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())
    
    technology = relationship("Technology", back_populates="topics")
    subtopics = relationship("StudySubtopic", back_populates="topic", cascade="all, delete-orphan")


class StudySubtopic(Base):
    """Подтема (GET запросы, Модели, Векторы)"""
    __tablename__ = "study_subtopics"
    
    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(200), nullable=False)
    description = Column(Text, nullable=True)  # Содержание с форматированием
    topic_id = Column(Integer, ForeignKey("study_topics.id"), nullable=False)
    sort_order = Column(Integer, default=0)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())
    
    topic = relationship("StudyTopic", back_populates="subtopics")


class Settings(Base):
    __tablename__ = "settings"
    
    id = Column(Integer, primary_key=True, index=True)
    key = Column(String, unique=True, nullable=False, index=True)
    value = Column(Text, nullable=True)
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())



class Comment(Base):
    __tablename__ = "comments"
    
    id = Column(Integer, primary_key=True, index=True)
    content = Column(Text, nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    topic_id = Column(Integer, ForeignKey("study_topics.id"), nullable=True)
    subtopic_id = Column(Integer, ForeignKey("study_subtopics.id"), nullable=True)
    parent_id = Column(Integer, ForeignKey("comments.id"), nullable=True)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())
    is_active = Column(Boolean, default=True)
    
    # ✅ ДОБАВИТЬ СВЯЗЬ С ПОЛЬЗОВАТЕЛЕМ
    author = relationship("User", foreign_keys=[user_id])
    topic = relationship("StudyTopic", foreign_keys=[topic_id])
    subtopic = relationship("StudySubtopic", foreign_keys=[subtopic_id])
    replies = relationship("Comment", remote_side=[id], backref="parent")


class UserProgress(Base):
    __tablename__ = "user_progress"
    
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    topic_id = Column(Integer, ForeignKey("study_topics.id"), nullable=True)
    subtopic_id = Column(Integer, ForeignKey("study_subtopics.id"), nullable=True)
    is_completed = Column(Boolean, default=False)
    completed_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())
    
    user = relationship("User", foreign_keys=[user_id])
    topic = relationship("StudyTopic", foreign_keys=[topic_id])
    subtopic = relationship("StudySubtopic", foreign_keys=[subtopic_id])


class SupportRequest(Base):
    __tablename__ = "support_requests"
    
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    email = Column(String, nullable=False)
    subject = Column(String, nullable=False)
    message = Column(Text, nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    status = Column(String, default="new")  # new, in_progress, resolved, closed
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())
    
    user = relationship("User", foreign_keys=[user_id])