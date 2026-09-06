# app/routes/forum.py
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import desc, func
from typing import List, Optional
from app.database import get_db
from app.models import User, ForumCategory, ForumTopic, ForumPost, ForumComment
from app.schemas_forum import (
    ForumCategoryCreate, ForumCategoryUpdate, ForumCategoryResponse,
    ForumTopicCreate, ForumTopicUpdate, ForumTopicResponse,
    ForumPostCreate, ForumPostUpdate, ForumPostResponse,
    ForumCommentCreate, ForumCommentResponse,
    ForumStatistics
)
from app.dependencies import get_current_user, get_current_admin

router = APIRouter()


# ============================================================
# 📁 КАТЕГОРИИ
# ============================================================

@router.get("/categories", response_model=List[ForumCategoryResponse])
async def get_categories(db: Session = Depends(get_db)):
    """Получить все активные категории"""
    categories = db.query(ForumCategory).filter(
        ForumCategory.is_active == True
    ).order_by(ForumCategory.order.asc()).all()
    
    result = []
    for cat in categories:
        topics_count = db.query(ForumTopic).filter(
            ForumTopic.category_id == cat.id
        ).count()
        # Превращаем объект в словарь
        cat_dict = {
            "id": cat.id,
            "name": cat.name,
            "description": cat.description,
            "icon": cat.icon,
            "order": cat.order,
            "is_active": cat.is_active,
            "topics_count": topics_count,
            "created_at": cat.created_at,
            "updated_at": cat.updated_at
        }
        result.append(cat_dict)
    
    return result


@router.post("/categories", response_model=ForumCategoryResponse)
async def create_category(
    category: ForumCategoryCreate,
    current_user: User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """Создать категорию (только админ)"""
    existing = db.query(ForumCategory).filter(
        ForumCategory.name == category.name
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="Категория с таким названием уже существует")
    
    new_category = ForumCategory(
        name=category.name,
        description=category.description,
        icon=category.icon,
        order=category.order
    )
    db.add(new_category)
    db.commit()
    db.refresh(new_category)
    
    return {
        "id": new_category.id,
        "name": new_category.name,
        "description": new_category.description,
        "icon": new_category.icon,
        "order": new_category.order,
        "is_active": new_category.is_active,
        "topics_count": 0,
        "created_at": new_category.created_at,
        "updated_at": new_category.updated_at
    }


@router.put("/categories/{category_id}", response_model=ForumCategoryResponse)
async def update_category(
    category_id: int,
    category: ForumCategoryUpdate,
    current_user: User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """Обновить категорию (только админ)"""
    db_category = db.query(ForumCategory).filter(ForumCategory.id == category_id).first()
    if not db_category:
        raise HTTPException(status_code=404, detail="Категория не найдена")
    
    if category.name is not None:
        existing = db.query(ForumCategory).filter(
            ForumCategory.name == category.name,
            ForumCategory.id != category_id
        ).first()
        if existing:
            raise HTTPException(status_code=400, detail="Категория с таким названием уже существует")
        db_category.name = category.name
    
    if category.description is not None:
        db_category.description = category.description
    if category.icon is not None:
        db_category.icon = category.icon
    if category.order is not None:
        db_category.order = category.order
    if category.is_active is not None:
        db_category.is_active = category.is_active
    
    db.commit()
    db.refresh(db_category)
    
    topics_count = db.query(ForumTopic).filter(
        ForumTopic.category_id == db_category.id
    ).count()
    
    return {
        "id": db_category.id,
        "name": db_category.name,
        "description": db_category.description,
        "icon": db_category.icon,
        "order": db_category.order,
        "is_active": db_category.is_active,
        "topics_count": topics_count,
        "created_at": db_category.created_at,
        "updated_at": db_category.updated_at
    }


@router.delete("/categories/{category_id}")
async def delete_category(
    category_id: int,
    current_user: User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """Удалить категорию (только админ)"""
    db_category = db.query(ForumCategory).filter(ForumCategory.id == category_id).first()
    if not db_category:
        raise HTTPException(status_code=404, detail="Категория не найдена")
    
    db.delete(db_category)
    db.commit()
    
    return {"message": f"Категория '{db_category.name}' удалена"}


# ============================================================
# 📄 ТЕМЫ
# ============================================================

@router.get("/categories/{category_id}/topics", response_model=List[ForumTopicResponse])
async def get_topics_by_category(
    category_id: int,
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db)
):
    """Получить темы в категории"""
    category = db.query(ForumCategory).filter(ForumCategory.id == category_id).first()
    if not category:
        raise HTTPException(status_code=404, detail="Категория не найдена")
    
    topics = db.query(ForumTopic).filter(
        ForumTopic.category_id == category_id
    ).order_by(
        ForumTopic.is_pinned.desc(),
        ForumTopic.created_at.desc()
    ).offset(offset).limit(limit).all()
    
    result = []
    for topic in topics:
        author = db.query(User).filter(User.id == topic.user_id).first()
        posts_count = db.query(ForumPost).filter(ForumPost.topic_id == topic.id).count()
        votes = db.query(ForumPost).filter(ForumPost.topic_id == topic.id).with_entities(func.sum(ForumPost.votes)).scalar() or 0
        
        result.append({
            "id": topic.id,
            "title": topic.title,
            "content": topic.content[:200] + "..." if topic.content and len(topic.content) > 200 else topic.content or "",
            "category_id": topic.category_id,
            "category_name": category.name,
            "user_id": topic.user_id,
            "username": author.username if author else "unknown",
            "user_name": author.name if author else "Неизвестный",
            "views": topic.views,
            "is_pinned": topic.is_pinned,
            "is_locked": topic.is_locked,
            "posts_count": posts_count,
            "votes": votes,
            "created_at": topic.created_at,
            "updated_at": topic.updated_at
        })
    
    return result


@router.get("/topics/{topic_id}", response_model=ForumTopicResponse)
async def get_topic(
    topic_id: int,
    db: Session = Depends(get_db)
):
    """Получить тему по ID (увеличивает счётчик просмотров)"""
    topic = db.query(ForumTopic).filter(ForumTopic.id == topic_id).first()
    if not topic:
        raise HTTPException(status_code=404, detail="Тема не найдена")
    
    # Увеличиваем просмотры
    topic.views += 1
    db.commit()
    
    category = db.query(ForumCategory).filter(ForumCategory.id == topic.category_id).first()
    author = db.query(User).filter(User.id == topic.user_id).first()
    posts_count = db.query(ForumPost).filter(ForumPost.topic_id == topic.id).count()
    votes = db.query(ForumPost).filter(ForumPost.topic_id == topic.id).with_entities(func.sum(ForumPost.votes)).scalar() or 0
    
    return {
        "id": topic.id,
        "title": topic.title,
        "content": topic.content or "",
        "category_id": topic.category_id,
        "category_name": category.name if category else "Без категории",
        "user_id": topic.user_id,
        "username": author.username if author else "unknown",
        "user_name": author.name if author else "Неизвестный",
        "views": topic.views,
        "is_pinned": topic.is_pinned,
        "is_locked": topic.is_locked,
        "posts_count": posts_count,
        "votes": votes,
        "created_at": topic.created_at,
        "updated_at": topic.updated_at
    }


@router.post("/topics", response_model=ForumTopicResponse)
async def create_topic(
    topic: ForumTopicCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Создать новую тему"""
    category = db.query(ForumCategory).filter(ForumCategory.id == topic.category_id).first()
    if not category:
        raise HTTPException(status_code=404, detail="Категория не найдена")
    
    new_topic = ForumTopic(
        title=topic.title,
        content=topic.content,
        category_id=topic.category_id,
        user_id=current_user.id,
        is_pinned=topic.is_pinned,
        is_locked=topic.is_locked
    )
    
    db.add(new_topic)
    db.commit()
    db.refresh(new_topic)
    
    # Возвращаем созданную тему
    return await get_topic(new_topic.id, db)


@router.put("/topics/{topic_id}", response_model=ForumTopicResponse)
async def update_topic(
    topic_id: int,
    topic_update: ForumTopicUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Обновить тему"""
    topic = db.query(ForumTopic).filter(ForumTopic.id == topic_id).first()
    if not topic:
        raise HTTPException(status_code=404, detail="Тема не найдена")
    
    # Проверка прав: автор или админ
    if topic.user_id != current_user.id and current_user.role not in ['admin', 'moderator']:
        raise HTTPException(status_code=403, detail="Нет прав для редактирования этой темы")
    
    if topic_update.title is not None:
        topic.title = topic_update.title
    if topic_update.content is not None:
        topic.content = topic_update.content
    if topic_update.is_pinned is not None and current_user.role in ['admin', 'moderator']:
        topic.is_pinned = topic_update.is_pinned
    if topic_update.is_locked is not None and current_user.role in ['admin', 'moderator']:
        topic.is_locked = topic_update.is_locked
    
    db.commit()
    db.refresh(topic)
    
    return await get_topic(topic_id, db)


@router.delete("/topics/{topic_id}")
async def delete_topic(
    topic_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Удалить тему"""
    topic = db.query(ForumTopic).filter(ForumTopic.id == topic_id).first()
    if not topic:
        raise HTTPException(status_code=404, detail="Тема не найдена")
    
    if topic.user_id != current_user.id and current_user.role not in ['admin', 'moderator']:
        raise HTTPException(status_code=403, detail="Нет прав для удаления этой темы")
    
    db.delete(topic)
    db.commit()
    
    return {"message": "Тема удалена"}


# ============================================================
# 💬 ПОСТЫ (ОТВЕТЫ)
# ============================================================

@router.get("/topics/{topic_id}/posts", response_model=List[ForumPostResponse])
async def get_topic_posts(
    topic_id: int,
    db: Session = Depends(get_db)
):
    """Получить все посты (ответы) в теме"""
    topic = db.query(ForumTopic).filter(ForumTopic.id == topic_id).first()
    if not topic:
        raise HTTPException(status_code=404, detail="Тема не найдена")
    
    posts = db.query(ForumPost).filter(
        ForumPost.topic_id == topic_id
    ).order_by(ForumPost.created_at.asc()).all()
    
    result = []
    for post in posts:
        author = db.query(User).filter(User.id == post.user_id).first()
        comments_count = db.query(ForumComment).filter(ForumComment.post_id == post.id).count()
        
        result.append({
            "id": post.id,
            "content": post.content,
            "topic_id": post.topic_id,
            "user_id": post.user_id,
            "username": author.username if author else "unknown",
            "user_name": author.name if author else "Неизвестный",
            "votes": post.votes,
            "is_solution": post.is_solution,
            "comments_count": comments_count,
            "created_at": post.created_at,
            "updated_at": post.updated_at
        })
    
    return result


@router.post("/topics/{topic_id}/posts", response_model=ForumPostResponse)
async def create_post(
    topic_id: int,
    post: ForumPostCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Создать пост (ответ) в теме"""
    topic = db.query(ForumTopic).filter(ForumTopic.id == topic_id).first()
    if not topic:
        raise HTTPException(status_code=404, detail="Тема не найдена")
    
    if topic.is_locked:
        raise HTTPException(status_code=403, detail="Тема закрыта для ответов")
    
    new_post = ForumPost(
        content=post.content,
        topic_id=topic_id,
        user_id=current_user.id
    )
    
    db.add(new_post)
    db.commit()
    db.refresh(new_post)
    
    author = db.query(User).filter(User.id == new_post.user_id).first()
    
    return {
        "id": new_post.id,
        "content": new_post.content,
        "topic_id": new_post.topic_id,
        "user_id": new_post.user_id,
        "username": author.username if author else "unknown",
        "user_name": author.name if author else "Неизвестный",
        "votes": new_post.votes,
        "is_solution": new_post.is_solution,
        "comments_count": 0,
        "created_at": new_post.created_at,
        "updated_at": new_post.updated_at
    }


@router.put("/posts/{post_id}", response_model=ForumPostResponse)
async def update_post(
    post_id: int,
    post_update: ForumPostUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Обновить пост"""
    post = db.query(ForumPost).filter(ForumPost.id == post_id).first()
    if not post:
        raise HTTPException(status_code=404, detail="Пост не найден")
    
    if post.user_id != current_user.id and current_user.role not in ['admin', 'moderator']:
        raise HTTPException(status_code=403, detail="Нет прав для редактирования этого поста")
    
    if post_update.content is not None:
        post.content = post_update.content
    if post_update.is_solution is not None:
        # Только автор темы может отметить решение
        topic = db.query(ForumTopic).filter(ForumTopic.id == post.topic_id).first()
        if topic.user_id == current_user.id or current_user.role in ['admin', 'moderator']:
            # Снимаем отметку с других постов
            db.query(ForumPost).filter(
                ForumPost.topic_id == post.topic_id,
                ForumPost.is_solution == True
            ).update({"is_solution": False})
            post.is_solution = post_update.is_solution
        else:
            raise HTTPException(status_code=403, detail="Только автор темы может отметить решение")
    
    db.commit()
    db.refresh(post)
    
    author = db.query(User).filter(User.id == post.user_id).first()
    
    return {
        "id": post.id,
        "content": post.content,
        "topic_id": post.topic_id,
        "user_id": post.user_id,
        "username": author.username if author else "unknown",
        "user_name": author.name if author else "Неизвестный",
        "votes": post.votes,
        "is_solution": post.is_solution,
        "comments_count": 0,
        "created_at": post.created_at,
        "updated_at": post.updated_at
    }


@router.delete("/posts/{post_id}")
async def delete_post(
    post_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Удалить пост"""
    post = db.query(ForumPost).filter(ForumPost.id == post_id).first()
    if not post:
        raise HTTPException(status_code=404, detail="Пост не найден")
    
    if post.user_id != current_user.id and current_user.role not in ['admin', 'moderator']:
        raise HTTPException(status_code=403, detail="Нет прав для удаления этого поста")
    
    db.delete(post)
    db.commit()
    
    return {"message": "Пост удалён"}


# ============================================================
# 👍 ГОЛОСОВАНИЕ ЗА ПОСТ
# ============================================================

@router.post("/posts/{post_id}/vote")
async def vote_post(
    post_id: int,
    vote_type: str = Query(..., regex="^(up|down)$"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Проголосовать за пост ('up' или 'down')"""
    post = db.query(ForumPost).filter(ForumPost.id == post_id).first()
    if not post:
        raise HTTPException(status_code=404, detail="Пост не найден")
    
    if post.user_id == current_user.id:
        raise HTTPException(status_code=400, detail="Нельзя голосовать за свой пост")
    
    if vote_type == 'up':
        post.votes += 1
    else:
        post.votes -= 1
    
    db.commit()
    
    return {"message": "Голос учтён", "votes": post.votes}


# ============================================================
# 💬 КОММЕНТАРИИ К ПОСТАМ
# ============================================================

@router.get("/posts/{post_id}/comments", response_model=List[ForumCommentResponse])
async def get_post_comments(
    post_id: int,
    db: Session = Depends(get_db)
):
    """Получить все комментарии к посту"""
    comments = db.query(ForumComment).filter(
        ForumComment.post_id == post_id
    ).order_by(ForumComment.created_at.asc()).all()
    
    result = []
    for comment in comments:
        author = db.query(User).filter(User.id == comment.user_id).first()
        result.append({
            "id": comment.id,
            "content": comment.content,
            "post_id": comment.post_id,
            "user_id": comment.user_id,
            "username": author.username if author else "unknown",
            "user_name": author.name if author else "Неизвестный",
            "created_at": comment.created_at,
            "updated_at": comment.updated_at
        })
    
    return result


@router.post("/posts/{post_id}/comments", response_model=ForumCommentResponse)
async def create_comment(
    post_id: int,
    comment: ForumCommentCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Добавить комментарий к посту"""
    post = db.query(ForumPost).filter(ForumPost.id == post_id).first()
    if not post:
        raise HTTPException(status_code=404, detail="Пост не найден")
    
    new_comment = ForumComment(
        content=comment.content,
        post_id=post_id,
        user_id=current_user.id
    )
    
    db.add(new_comment)
    db.commit()
    db.refresh(new_comment)
    
    author = db.query(User).filter(User.id == new_comment.user_id).first()
    
    return {
        "id": new_comment.id,
        "content": new_comment.content,
        "post_id": new_comment.post_id,
        "user_id": new_comment.user_id,
        "username": author.username if author else "unknown",
        "user_name": author.name if author else "Неизвестный",
        "created_at": new_comment.created_at,
        "updated_at": new_comment.updated_at
    }


@router.delete("/comments/{comment_id}")
async def delete_comment(
    comment_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Удалить комментарий"""
    comment = db.query(ForumComment).filter(ForumComment.id == comment_id).first()
    if not comment:
        raise HTTPException(status_code=404, detail="Комментарий не найден")
    
    if comment.user_id != current_user.id and current_user.role not in ['admin', 'moderator']:
        raise HTTPException(status_code=403, detail="Нет прав для удаления этого комментария")
    
    db.delete(comment)
    db.commit()
    
    return {"message": "Комментарий удалён"}


# ============================================================
# 📊 СТАТИСТИКА
# ============================================================

@router.get("/statistics", response_model=ForumStatistics)
async def get_forum_statistics(
    db: Session = Depends(get_db)
):
    """Получить статистику форума"""
    total_categories = db.query(ForumCategory).filter(ForumCategory.is_active == True).count()
    total_topics = db.query(ForumTopic).count()
    total_posts = db.query(ForumPost).count()
    total_comments = db.query(ForumComment).count()
    total_users = db.query(User).filter(User.is_active == True).count()
    online_users = db.query(User).filter(User.is_online == True).count()
    
    return {
        "total_categories": total_categories,
        "total_topics": total_topics,
        "total_posts": total_posts,
        "total_comments": total_comments,
        "total_users": total_users,
        "online_users": online_users
    }