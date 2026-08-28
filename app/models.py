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
    role = Column(String, default="student")
    registered = Column(String, default=lambda: func.current_date())
    languages = Column(JSON, default=[])
    topics_count = Column(Integer, default=0)
    progress = Column(Integer, default=0)
    is_online = Column(Boolean, default=False)
    last_seen = Column(DateTime, default=func.now())
    created_at = Column(DateTime, server_default=func.now())
    
    messages_sent = relationship("Message", foreign_keys="Message.user_id", back_populates="sender")
    messages_received = relationship("Message", foreign_keys="Message.recipient_id", back_populates="recipient")
    
    subscriptions_sent = relationship("Subscription", foreign_keys="Subscription.follower_id", back_populates="follower")
    subscriptions_received = relationship("Subscription", foreign_keys="Subscription.following_id", back_populates="following")


class Subscription(Base):
    __tablename__ = "subscriptions"
    
    id = Column(Integer, primary_key=True, index=True)
    follower_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    following_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    status = Column(String, default="pending")
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
    files = Column(JSON, default=[])  # ✅ ДОБАВИТЬ ЭТУ СТРОКУ
    
    sender = relationship("User", foreign_keys=[user_id], back_populates="messages_sent")
    recipient = relationship("User", foreign_keys=[recipient_id], back_populates="messages_received")


class Group(Base):
    __tablename__ = "groups"
    
    id = Column(String, primary_key=True, index=True)
    name = Column(String, nullable=False)
    creator_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    members = Column(JSON, nullable=False)
    created_at = Column(DateTime, server_default=func.now())
    
    creator = relationship("User", foreign_keys=[creator_id])


class Category(Base):
    __tablename__ = "categories"
    
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, nullable=False)
    icon = Column(String, default="fas fa-code")
    topics = Column(JSON, default=[])