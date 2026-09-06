# app/routes/study.py
from fastapi import APIRouter, Depends, HTTPException, Header
from sqlalchemy.orm import Session
from typing import Optional, List
from app.database import get_db
from app.models import Technology, StudyTopic, StudySubtopic, User
from app.dependencies import get_current_user
from pydantic import BaseModel
from app.redis_client import cache, invalidate_cache  # 👈 ИМПОРТ

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
@cache(ttl=300, key_prefix="study_technologies")  # ✅ КЭШИРУЕМ
async def get_technologies(db: Session = Depends(get_db)):
    technologies = db.query(Technology).filter(Technology.is_active == True).order_by(Technology.sort_order).all()
    
    result = []
    for tech in technologies:
        topics = db.query(StudyTopic).filter(StudyTopic.technology_id == tech.id).all()
        tech_data = {
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
                            "description": subtopic.description
                        }
                        for subtopic in topic.subtopics
                    ]
                }
                for topic in topics
            ]
        }
        result.append(tech_data)
    
    return result

@router.post("/technologies")
async def create_technology(
    tech: TechnologyCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    if current_user.role != 'admin':
        raise HTTPException(status_code=403, detail="Доступ запрещен")
    
    new_tech = Technology(**tech.dict())
    db.add(new_tech)
    db.commit()
    db.refresh(new_tech)
    
    # ✅ Очищаем кэш
    await invalidate_cache("study_technologies*")
    
    return new_tech

@router.put("/technologies/{tech_id}")
async def update_technology(
    tech_id: int,
    tech_data: TechnologyCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    if current_user.role != 'admin':
        raise HTTPException(status_code=403, detail="Доступ запрещен")
    
    db_tech = db.query(Technology).filter(Technology.id == tech_id).first()
    if not db_tech:
        raise HTTPException(status_code=404, detail="Технология не найдена")
    
    db_tech.name = tech_data.name
    db_tech.icon = tech_data.icon
    db_tech.description = tech_data.description
    db_tech.sort_order = tech_data.sort_order
    
    db.commit()
    db.refresh(db_tech)
    
    # ✅ Очищаем кэш
    await invalidate_cache("study_technologies*")
    
    return db_tech

@router.delete("/technologies/{tech_id}")
async def delete_technology(
    tech_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    if current_user.role != 'admin':
        raise HTTPException(status_code=403, detail="Доступ запрещен")
    
    db_tech = db.query(Technology).filter(Technology.id == tech_id).first()
    if not db_tech:
        raise HTTPException(status_code=404, detail="Технология не найдена")
    
    db.delete(db_tech)
    db.commit()
    
    # ✅ Очищаем кэш
    await invalidate_cache("study_technologies*")
    
    return {"message": "Технология удалена"}


# ===== ТЕМЫ =====
@router.get("/technologies/{tech_id}/topics")
async def get_topics(tech_id: int, db: Session = Depends(get_db)):
    return db.query(StudyTopic).filter(StudyTopic.technology_id == tech_id).order_by(StudyTopic.sort_order).all()

@router.post("/topics")
async def create_topic(
    topic: TopicCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    if current_user.role != 'admin':
        raise HTTPException(status_code=403, detail="Доступ запрещен")
    
    new_topic = StudyTopic(**topic.dict())
    db.add(new_topic)
    db.commit()
    db.refresh(new_topic)
    
    # ✅ Очищаем кэш технологий
    await invalidate_cache("study_technologies*")
    
    return new_topic

@router.put("/topics/{topic_id}")
async def update_topic(
    topic_id: int,
    topic_data: TopicCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    if current_user.role != 'admin':
        raise HTTPException(status_code=403, detail="Доступ запрещен")
    
    db_topic = db.query(StudyTopic).filter(StudyTopic.id == topic_id).first()
    if not db_topic:
        raise HTTPException(status_code=404, detail="Тема не найдена")
    
    db_topic.title = topic_data.title
    db_topic.description = topic_data.description
    db_topic.technology_id = topic_data.technology_id
    db_topic.sort_order = topic_data.sort_order
    
    db.commit()
    db.refresh(db_topic)
    
    # ✅ Очищаем кэш технологий
    await invalidate_cache("study_technologies*")
    
    return db_topic

@router.delete("/topics/{topic_id}")
async def delete_topic(
    topic_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    if current_user.role != 'admin':
        raise HTTPException(status_code=403, detail="Доступ запрещен")
    
    db_topic = db.query(StudyTopic).filter(StudyTopic.id == topic_id).first()
    if not db_topic:
        raise HTTPException(status_code=404, detail="Тема не найдена")
    
    db.delete(db_topic)
    db.commit()
    
    # ✅ Очищаем кэш технологий
    await invalidate_cache("study_technologies*")
    
    return {"message": "Тема удалена"}


# ===== ПОДТЕМЫ =====
@router.get("/topics/{topic_id}/subtopics")
async def get_subtopics(topic_id: int, db: Session = Depends(get_db)):
    return db.query(StudySubtopic).filter(StudySubtopic.topic_id == topic_id).order_by(StudySubtopic.sort_order).all()

@router.post("/subtopics")
async def create_subtopic(
    subtopic: SubtopicCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    if current_user.role != 'admin':
        raise HTTPException(status_code=403, detail="Доступ запрещен")
    
    new_subtopic = StudySubtopic(**subtopic.dict())
    db.add(new_subtopic)
    db.commit()
    db.refresh(new_subtopic)
    
    # ✅ Очищаем кэш технологий
    await invalidate_cache("study_technologies*")
    
    return new_subtopic

@router.put("/subtopics/{subtopic_id}")
async def update_subtopic(
    subtopic_id: int,
    subtopic_data: SubtopicCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    if current_user.role != 'admin':
        raise HTTPException(status_code=403, detail="Доступ запрещен")
    
    db_subtopic = db.query(StudySubtopic).filter(StudySubtopic.id == subtopic_id).first()
    if not db_subtopic:
        raise HTTPException(status_code=404, detail="Подтема не найдена")
    
    if subtopic_data.title is not None:
        db_subtopic.title = subtopic_data.title
    if subtopic_data.description is not None:
        db_subtopic.description = subtopic_data.description
    if subtopic_data.topic_id is not None:
        db_subtopic.topic_id = subtopic_data.topic_id
    if subtopic_data.sort_order is not None:
        db_subtopic.sort_order = subtopic_data.sort_order
    
    db.commit()
    db.refresh(db_subtopic)
    
    # ✅ Очищаем кэш технологий
    await invalidate_cache("study_technologies*")
    
    return db_subtopic

@router.delete("/subtopics/{subtopic_id}")
async def delete_subtopic(
    subtopic_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    if current_user.role != 'admin':
        raise HTTPException(status_code=403, detail="Доступ запрещен")
    
    db_subtopic = db.query(StudySubtopic).filter(StudySubtopic.id == subtopic_id).first()
    if not db_subtopic:
        raise HTTPException(status_code=404, detail="Подтема не найдена")
    
    db.delete(db_subtopic)
    db.commit()
    
    # ✅ Очищаем кэш технологий
    await invalidate_cache("study_technologies*")
    
    return {"message": "Подтема удалена"}