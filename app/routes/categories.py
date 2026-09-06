# app/routes/categories.py
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List

from app.database import get_db
from app.models import Category
from app.schemas import CategoryCreate, CategoryResponse
from app.redis_client import cache, invalidate_cache

router = APIRouter()


@router.get("/", response_model=List[CategoryResponse])
@cache(ttl=300, key_prefix="old_categories")
async def get_categories(db: Session = Depends(get_db)):
    try:
        categories = db.query(Category).all()
        return categories
    except Exception as e:
        print(f"❌ Ошибка в get_categories: {e}")
        return []


@router.post("/", response_model=CategoryResponse)
async def create_category(category: CategoryCreate, db: Session = Depends(get_db)):
    try:
        existing = db.query(Category).filter(Category.name == category.name).first()
        if existing:
            raise HTTPException(status_code=400, detail="Category already exists")
        
        db_category = Category(
            name=category.name,
            icon=category.icon,
            topics=category.topics
        )
        db.add(db_category)
        db.commit()
        db.refresh(db_category)
        
        await invalidate_cache("old_categories*")
        
        return db_category
    except Exception as e:
        db.rollback()
        print(f"❌ Ошибка в create_category: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/{category_id}", response_model=CategoryResponse)
async def update_category(category_id: int, category: CategoryCreate, db: Session = Depends(get_db)):
    try:
        db_category = db.query(Category).filter(Category.id == category_id).first()
        if not db_category:
            raise HTTPException(status_code=404, detail="Category not found")
        
        db_category.name = category.name
        db_category.icon = category.icon
        db_category.topics = category.topics
        db.commit()
        db.refresh(db_category)
        
        await invalidate_cache("old_categories*")
        
        return db_category
    except Exception as e:
        db.rollback()
        print(f"❌ Ошибка в update_category: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/{category_id}")
async def delete_category(category_id: int, db: Session = Depends(get_db)):
    try:
        db_category = db.query(Category).filter(Category.id == category_id).first()
        if not db_category:
            raise HTTPException(status_code=404, detail="Category not found")
        
        db.delete(db_category)
        db.commit()
        
        await invalidate_cache("old_categories*")
        
        return {"message": "Category deleted"}
    except Exception as e:
        db.rollback()
        print(f"❌ Ошибка в delete_category: {e}")
        raise HTTPException(status_code=500, detail=str(e))