# app/routes/comments.py (добавлен Redis)
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from pydantic import BaseModel
from typing import Optional

from app.database import get_db
from app.models import Comment, User, StudyTopic, StudySubtopic
from app.dependencies import get_current_user
from app.redis_client import cache, invalidate_cache


async def _invalidate_comment_cache(topic_id: int | None = None, subtopic_id: int | None = None) -> None:
    if topic_id is not None:
        await invalidate_cache(f"comments_topic:*topic_id={topic_id}*")
        await invalidate_cache(f"comments_topic:{topic_id}*")
    if subtopic_id is not None:
        await invalidate_cache(f"comments_subtopic:*subtopic_id={subtopic_id}*")
        await invalidate_cache(f"comments_subtopic:{subtopic_id}*")

router = APIRouter()

class CommentCreate(BaseModel):
    content: str
    topic_id: Optional[int] = None
    subtopic_id: Optional[int] = None
    parent_id: Optional[int] = None

class CommentResponse(BaseModel):
    id: int
    content: str
    user_id: int
    topic_id: Optional[int] = None
    subtopic_id: Optional[int] = None
    parent_id: Optional[int] = None
    created_at: str
    updated_at: str
    is_active: bool
    author: Optional[dict] = None


@router.post("/")
async def create_comment(
    comment: CommentCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    if not comment.topic_id and not comment.subtopic_id:
        raise HTTPException(status_code=400, detail="Укажите topic_id или subtopic_id")
    
    if comment.topic_id:
        topic = (
            await db.execute(select(StudyTopic).where(StudyTopic.id == comment.topic_id))
        ).scalar_one_or_none()
        if not topic:
            raise HTTPException(status_code=404, detail="Тема не найдена")
    
    if comment.subtopic_id:
        subtopic = (
            await db.execute(select(StudySubtopic).where(StudySubtopic.id == comment.subtopic_id))
        ).scalar_one_or_none()
        if not subtopic:
            raise HTTPException(status_code=404, detail="Подтема не найдена")
    
    new_comment = Comment(
        content=comment.content,
        user_id=current_user.id,
        topic_id=comment.topic_id,
        subtopic_id=comment.subtopic_id,
        parent_id=comment.parent_id
    )
    db.add(new_comment)
    await db.commit()
    await db.refresh(new_comment)
    
    await _invalidate_comment_cache(comment.topic_id, comment.subtopic_id)
    
    return {
        "id": new_comment.id,
        "content": new_comment.content,
        "user_id": new_comment.user_id,
        "topic_id": new_comment.topic_id,
        "subtopic_id": new_comment.subtopic_id,
        "parent_id": new_comment.parent_id,
        "created_at": new_comment.created_at.isoformat(),
        "updated_at": new_comment.updated_at.isoformat(),
        "is_active": new_comment.is_active,
        "author": {
            "id": current_user.id,
            "name": current_user.name,
            "username": current_user.username
        }
    }


@router.get("/topic/{topic_id}")
@cache(ttl=60, key_prefix="comments_topic")
async def get_topic_comments(
    topic_id: int,
    db: AsyncSession = Depends(get_db),
    skip: int = 0,
    limit: int = 50
):
    comments = (
        await db.execute(
            select(Comment)
            .options(selectinload(Comment.author))
            .where(
                Comment.topic_id == topic_id,
                Comment.is_active == True,
                Comment.parent_id == None
            )
            .order_by(Comment.created_at.desc())
            .offset(skip)
            .limit(limit)
        )
    ).scalars().all()
    
    result = []
    for comment in comments:
        result.append({
            "id": comment.id,
            "content": comment.content,
            "user_id": comment.user_id,
            "topic_id": comment.topic_id,
            "subtopic_id": comment.subtopic_id,
            "parent_id": comment.parent_id,
            "created_at": comment.created_at.isoformat(),
            "updated_at": comment.updated_at.isoformat(),
            "is_active": comment.is_active,
            "author": {
                "id": comment.author.id,
                "name": comment.author.name,
                "username": comment.author.username
            } if comment.author else None
        })
    
    return result


@router.get("/subtopic/{subtopic_id}")
@cache(ttl=60, key_prefix="comments_subtopic")
async def get_subtopic_comments(
    subtopic_id: int,
    db: AsyncSession = Depends(get_db),
    skip: int = 0,
    limit: int = 50
):
    comments = (
        await db.execute(
            select(Comment)
            .options(selectinload(Comment.author))
            .where(
                Comment.subtopic_id == subtopic_id,
                Comment.is_active == True,
                Comment.parent_id == None
            )
            .order_by(Comment.created_at.desc())
            .offset(skip)
            .limit(limit)
        )
    ).scalars().all()
    
    result = []
    for comment in comments:
        result.append({
            "id": comment.id,
            "content": comment.content,
            "user_id": comment.user_id,
            "topic_id": comment.topic_id,
            "subtopic_id": comment.subtopic_id,
            "parent_id": comment.parent_id,
            "created_at": comment.created_at.isoformat(),
            "updated_at": comment.updated_at.isoformat(),
            "is_active": comment.is_active,
            "author": {
                "id": comment.author.id,
                "name": comment.author.name,
                "username": comment.author.username
            } if comment.author else None
        })
    
    return result
