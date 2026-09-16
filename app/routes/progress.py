from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel
from typing import Optional
from app.database import get_db
from app.models import User, UserProgress, StudyTopic, StudySubtopic, Technology
from app.dependencies import get_current_user
from app.redis_client import invalidate_cache

router = APIRouter()


# ===== ПРОГРЕСС =====

@router.post("/topic/{topic_id}/toggle")
async def toggle_topic_progress(
    topic_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Отметить/снять отметку изучения темы"""
    progress = (
        await db.execute(
            select(UserProgress).where(
                UserProgress.user_id == current_user.id,
                UserProgress.topic_id == topic_id
            )
        )
    ).scalar_one_or_none()

    if progress:
        progress.is_completed = not progress.is_completed
        if progress.is_completed:
            progress.completed_at = func.now()
        else:
            progress.completed_at = None
    else:
        progress = UserProgress(
            user_id=current_user.id,
            topic_id=topic_id,
            is_completed=True,
            completed_at=func.now()
        )
        db.add(progress)

    await db.commit()
    await db.refresh(progress)

    total_topics = (await db.execute(select(func.count()).select_from(StudyTopic))).scalar()
    completed_topics = (
        await db.execute(
            select(func.count()).select_from(UserProgress).where(
                UserProgress.user_id == current_user.id,
                UserProgress.is_completed == True,
                UserProgress.topic_id.isnot(None)
            )
        )
    ).scalar()
    
    current_user.progress = int((completed_topics / total_topics) * 100) if total_topics > 0 else 0
    await db.commit()
    await db.refresh(current_user)

    await invalidate_cache(f"user_profile:{current_user.id}")

    return {"progress": current_user.progress, "is_completed": progress.is_completed}


@router.post("/subtopic/{subtopic_id}/toggle")
async def toggle_subtopic_progress(
    subtopic_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Отметить/снять отметку изучения подтемы"""
    progress = (
        await db.execute(
            select(UserProgress).where(
                UserProgress.user_id == current_user.id,
                UserProgress.subtopic_id == subtopic_id
            )
        )
    ).scalar_one_or_none()

    if progress:
        progress.is_completed = not progress.is_completed
        if progress.is_completed:
            progress.completed_at = func.now()
        else:
            progress.completed_at = None
    else:
        progress = UserProgress(
            user_id=current_user.id,
            subtopic_id=subtopic_id,
            is_completed=True,
            completed_at=func.now()
        )
        db.add(progress)

    await db.commit()
    await db.refresh(progress)

    await invalidate_cache(f"user_profile:{current_user.id}")

    return {"is_completed": progress.is_completed}


@router.get("/my-progress")
async def get_my_progress(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Получить прогресс пользователя"""
    progress = (
        await db.execute(
            select(UserProgress).where(UserProgress.user_id == current_user.id)
        )
    ).scalars().all()

    result = {
        "total": len(progress),
        "completed": len([p for p in progress if p.is_completed]),
        "topics": [],
        "subtopics": []
    }

    for p in progress:
        if p.topic_id:
            topic = (
                await db.execute(select(StudyTopic).where(StudyTopic.id == p.topic_id))
            ).scalar_one_or_none()
            result["topics"].append({
                "id": topic.id if topic else None,
                "title": topic.title if topic else None,
                "completed": p.is_completed
            })
        if p.subtopic_id:
            subtopic = (
                await db.execute(select(StudySubtopic).where(StudySubtopic.id == p.subtopic_id))
            ).scalar_one_or_none()
            result["subtopics"].append({
                "id": subtopic.id if subtopic else None,
                "title": subtopic.title if subtopic else None,
                "completed": p.is_completed
            })

    return result


# ===== ИЗБРАННОЕ (ЗАКЛАДКИ) =====

class BookmarkCreate(BaseModel):
    topic_id: Optional[int] = None
    subtopic_id: Optional[int] = None


@router.post("/bookmarks")
async def add_bookmark(
    bookmark: BookmarkCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Добавить в избранное"""
    if not bookmark.topic_id and not bookmark.subtopic_id:
        raise HTTPException(status_code=400, detail="Укажите topic_id или subtopic_id")

    if bookmark.topic_id:
        content = (
            await db.execute(select(StudyTopic).where(StudyTopic.id == bookmark.topic_id))
        ).scalar_one_or_none()
    else:
        content = (
            await db.execute(select(StudySubtopic).where(StudySubtopic.id == bookmark.subtopic_id))
        ).scalar_one_or_none()

    if not content:
        raise HTTPException(status_code=404, detail="Контент не найден")

    bookmarks = current_user.bookmarks or []
    new_bookmark = {"topic_id": bookmark.topic_id, "subtopic_id": bookmark.subtopic_id}
    if new_bookmark in bookmarks:
        return {"message": "Уже в избранном"}

    bookmarks.append(new_bookmark)
    current_user.bookmarks = bookmarks
    await db.commit()

    return {"message": "Добавлено в избранное"}


@router.delete("/bookmarks")
async def remove_bookmark(
    bookmark: BookmarkCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Удалить из избранного"""
    bookmarks = current_user.bookmarks or []
    to_remove = {"topic_id": bookmark.topic_id, "subtopic_id": bookmark.subtopic_id}
    
    if to_remove in bookmarks:
        bookmarks.remove(to_remove)
        current_user.bookmarks = bookmarks
        await db.commit()
        return {"message": "Удалено из избранного"}
    
    return {"message": "Не найдено в избранном"}


@router.get("/bookmarks")
async def get_bookmarks(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Получить все избранные темы"""
    bookmarks = current_user.bookmarks or []
    result = []

    for b in bookmarks:
        if b.get("topic_id"):
            topic = (
                await db.execute(select(StudyTopic).where(StudyTopic.id == b["topic_id"]))
            ).scalar_one_or_none()
            if topic:
                result.append({
                    "type": "topic",
                    "id": topic.id,
                    "title": topic.title,
                    "description": topic.description
                })
        if b.get("subtopic_id"):
            subtopic = (
                await db.execute(select(StudySubtopic).where(StudySubtopic.id == b["subtopic_id"]))
            ).scalar_one_or_none()
            if subtopic:
                result.append({
                    "type": "subtopic",
                    "id": subtopic.id,
                    "title": subtopic.title,
                    "description": subtopic.description,
                    "topic_id": subtopic.topic_id
                })

    return result


# ===== РЕКОМЕНДАЦИИ =====

@router.get("/recommendations")
async def get_recommendations(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    limit: int = 5
):
    """Рекомендации тем на основе прогресса"""
    completed_topic_ids = (
        await db.execute(
            select(UserProgress.topic_id).where(
                UserProgress.user_id == current_user.id,
                UserProgress.is_completed == True,
                UserProgress.topic_id.isnot(None)
            )
        )
    ).all()
    completed_ids = [c[0] for c in completed_topic_ids]

    technologies = (await db.execute(select(Technology))).scalars().all()
    recommendations = []

    for tech in technologies:
        stmt = select(StudyTopic).where(StudyTopic.technology_id == tech.id)
        if completed_ids:
            stmt = stmt.where(StudyTopic.id.notin(completed_ids))
        topics = (await db.execute(stmt)).scalars().all()
        
        for topic in topics[:limit]:
            recommendations.append({
                "topic_id": topic.id,
                "title": topic.title,
                "technology": tech.name,
                "icon": tech.icon,
                "description": topic.description[:200] + "..." if topic.description else ""
            })

    return recommendations[:limit]
