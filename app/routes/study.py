# app/routes/study.py
from fastapi import APIRouter, Depends, HTTPException, Header
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from typing import Optional, List
from app.database import get_db
from app.models import Technology, StudyTopic, StudySubtopic, User
from app.html_sanitize import sanitize_html
from app.dependencies import get_current_user
from pydantic import BaseModel
from app.redis_client import cache, invalidate_cache

router = APIRouter()

# ===== СХЕМЫ =====
class TechnologyCreate(BaseModel):
    name: str
    icon: str = "fas fa-code"
    description: Optional[str] = None
    sort_order: int = 0

class TopicCreate(BaseModel):
    title: str
    description: Optional[str] = None
    technology_id: int
    sort_order: int = 0

class SubtopicCreate(BaseModel):
    title: str
    description: Optional[str] = None
    topic_id: Optional[int] = None
    sort_order: int = 0


# ===== ТЕХНОЛОГИИ =====
@router.get("/technologies")
@cache(ttl=300, key_prefix="study_technologies")
async def get_technologies(db: AsyncSession = Depends(get_db)):
    technologies = (
        await db.execute(
            select(Technology)
            .options(selectinload(Technology.topics).selectinload(StudyTopic.subtopics))
            .where(Technology.is_active == True)
            .order_by(Technology.sort_order)
        )
    ).scalars().all()

    return [
        {
            "id": tech.id,
            "name": tech.name,
            "icon": tech.icon,
            "description": tech.description,
            "sort_order": tech.sort_order,
            "is_active": tech.is_active,
            "created_at": tech.created_at,
            "updated_at": tech.updated_at,
            "topics": [
                {
                    "id": topic.id,
                    "title": topic.title,
                    "description": topic.description,
                    "sort_order": topic.sort_order,
                    "subtopics": [
                        {
                            "id": subtopic.id,
                            "title": subtopic.title,
                            "description": subtopic.description,
                            "sort_order": subtopic.sort_order,
                        }
                        for subtopic in sorted(topic.subtopics, key=lambda s: s.sort_order)
                    ],
                }
                for topic in sorted(tech.topics, key=lambda t: t.sort_order)
            ],
        }
        for tech in technologies
    ]

@router.post("/technologies")
async def create_technology(
    tech: TechnologyCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    if current_user.role != 'admin':
        raise HTTPException(status_code=403, detail="Доступ запрещен")
    
    new_tech = Technology(
        name=tech.name,
        icon=tech.icon,
        description=sanitize_html(tech.description) if tech.description else None,
        sort_order=tech.sort_order,
    )
    db.add(new_tech)
    await db.commit()
    await db.refresh(new_tech)
    
    await invalidate_cache("study_technologies*")
    
    return new_tech

@router.put("/technologies/{tech_id}")
async def update_technology(
    tech_id: int,
    tech_data: TechnologyCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    if current_user.role != 'admin':
        raise HTTPException(status_code=403, detail="Доступ запрещен")
    
    db_tech = (
        await db.execute(select(Technology).where(Technology.id == tech_id))
    ).scalar_one_or_none()
    if not db_tech:
        raise HTTPException(status_code=404, detail="Технология не найдена")
    
    db_tech.name = tech_data.name
    db_tech.icon = tech_data.icon
    db_tech.description = sanitize_html(tech_data.description) if tech_data.description else None
    db_tech.sort_order = tech_data.sort_order
    
    await db.commit()
    await db.refresh(db_tech)
    
    await invalidate_cache("study_technologies*")
    
    return db_tech

@router.delete("/technologies/{tech_id}")
async def delete_technology(
    tech_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    if current_user.role != 'admin':
        raise HTTPException(status_code=403, detail="Доступ запрещен")
    
    db_tech = (
        await db.execute(select(Technology).where(Technology.id == tech_id))
    ).scalar_one_or_none()
    if not db_tech:
        raise HTTPException(status_code=404, detail="Технология не найдена")
    
    await db.delete(db_tech)
    await db.commit()
    
    await invalidate_cache("study_technologies*")
    
    return {"message": "Технология удалена"}


# ===== ТЕМЫ =====
@router.get("/technologies/{tech_id}/topics")
async def get_topics(tech_id: int, db: AsyncSession = Depends(get_db)):
    return (
        await db.execute(
            select(StudyTopic)
            .where(StudyTopic.technology_id == tech_id)
            .order_by(StudyTopic.sort_order)
        )
    ).scalars().all()

@router.post("/topics")
async def create_topic(
    topic: TopicCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    if current_user.role != 'admin':
        raise HTTPException(status_code=403, detail="Доступ запрещен")
    
    new_topic = StudyTopic(
        title=topic.title,
        description=sanitize_html(topic.description) if topic.description else None,
        technology_id=topic.technology_id,
        sort_order=topic.sort_order,
    )
    db.add(new_topic)
    await db.commit()
    await db.refresh(new_topic)
    
    await invalidate_cache("study_technologies*")
    
    return new_topic

@router.put("/topics/{topic_id}")
async def update_topic(
    topic_id: int,
    topic_data: TopicCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    if current_user.role != 'admin':
        raise HTTPException(status_code=403, detail="Доступ запрещен")
    
    db_topic = (
        await db.execute(select(StudyTopic).where(StudyTopic.id == topic_id))
    ).scalar_one_or_none()
    if not db_topic:
        raise HTTPException(status_code=404, detail="Тема не найдена")
    
    db_topic.title = topic_data.title
    db_topic.description = sanitize_html(topic_data.description) if topic_data.description else None
    db_topic.technology_id = topic_data.technology_id
    db_topic.sort_order = topic_data.sort_order
    
    await db.commit()
    await db.refresh(db_topic)
    
    await invalidate_cache("study_technologies*")
    
    return db_topic

@router.delete("/topics/{topic_id}")
async def delete_topic(
    topic_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    if current_user.role != 'admin':
        raise HTTPException(status_code=403, detail="Доступ запрещен")
    
    db_topic = (
        await db.execute(select(StudyTopic).where(StudyTopic.id == topic_id))
    ).scalar_one_or_none()
    if not db_topic:
        raise HTTPException(status_code=404, detail="Тема не найдена")
    
    await db.delete(db_topic)
    await db.commit()
    
    await invalidate_cache("study_technologies*")
    
    return {"message": "Тема удалена"}


# ===== ПОДТЕМЫ =====
@router.get("/topics/{topic_id}/subtopics")
async def get_subtopics(topic_id: int, db: AsyncSession = Depends(get_db)):
    return (
        await db.execute(
            select(StudySubtopic)
            .where(StudySubtopic.topic_id == topic_id)
            .order_by(StudySubtopic.sort_order)
        )
    ).scalars().all()

@router.post("/subtopics")
async def create_subtopic(
    subtopic: SubtopicCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    if current_user.role != 'admin':
        raise HTTPException(status_code=403, detail="Доступ запрещен")
    
    new_subtopic = StudySubtopic(
        title=subtopic.title,
        description=sanitize_html(subtopic.description) if subtopic.description else None,
        topic_id=subtopic.topic_id,
        sort_order=subtopic.sort_order,
    )
    db.add(new_subtopic)
    await db.commit()
    await db.refresh(new_subtopic)
    
    await invalidate_cache("study_technologies*")
    
    return new_subtopic

@router.put("/subtopics/{subtopic_id}")
async def update_subtopic(
    subtopic_id: int,
    subtopic_data: SubtopicCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    if current_user.role != 'admin':
        raise HTTPException(status_code=403, detail="Доступ запрещен")
    
    db_subtopic = (
        await db.execute(select(StudySubtopic).where(StudySubtopic.id == subtopic_id))
    ).scalar_one_or_none()
    if not db_subtopic:
        raise HTTPException(status_code=404, detail="Подтема не найдена")
    
    if subtopic_data.title is not None:
        db_subtopic.title = subtopic_data.title
    if subtopic_data.description is not None:
        db_subtopic.description = sanitize_html(subtopic_data.description) if subtopic_data.description else None
    if subtopic_data.topic_id is not None:
        db_subtopic.topic_id = subtopic_data.topic_id
    if subtopic_data.sort_order is not None:
        db_subtopic.sort_order = subtopic_data.sort_order
    
    await db.commit()
    await db.refresh(db_subtopic)
    
    await invalidate_cache("study_technologies*")
    
    return db_subtopic

@router.delete("/subtopics/{subtopic_id}")
async def delete_subtopic(
    subtopic_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    if current_user.role != 'admin':
        raise HTTPException(status_code=403, detail="Доступ запрещен")
    
    db_subtopic = (
        await db.execute(select(StudySubtopic).where(StudySubtopic.id == subtopic_id))
    ).scalar_one_or_none()
    if not db_subtopic:
        raise HTTPException(status_code=404, detail="Подтема не найдена")
    
    await db.delete(db_subtopic)
    await db.commit()
    
    await invalidate_cache("study_technologies*")
    
    return {"message": "Подтема удалена"}
