# app/routes/categories.py
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List

from app.database import get_db
from app.models import Category
from app.schemas import CategoryCreate, CategoryResponse
from app.redis_client import cache, invalidate_cache
from app.dependencies import get_current_admin

router = APIRouter()


@router.get("/", response_model=List[CategoryResponse])
@cache(ttl=300, key_prefix="old_categories")
async def get_categories(db: AsyncSession = Depends(get_db)):
    try:
        return (await db.execute(select(Category))).scalars().all()
    except Exception as exc:
        print(f"❌ Ошибка в get_categories: {exc}")
        return []


@router.post("/", response_model=CategoryResponse)
async def create_category(
    category: CategoryCreate,
    db: AsyncSession = Depends(get_db),
    _: object = Depends(get_current_admin),
):
    existing = (
        await db.execute(select(Category).where(Category.name == category.name))
    ).scalar_one_or_none()
    if existing:
        raise HTTPException(status_code=400, detail="Category already exists")

    db_category = Category(name=category.name, icon=category.icon, topics=category.topics)
    db.add(db_category)
    await db.commit()
    await db.refresh(db_category)
    await invalidate_cache("old_categories*")
    return db_category


@router.put("/{category_id}", response_model=CategoryResponse)
async def update_category(
    category_id: int,
    category: CategoryCreate,
    db: AsyncSession = Depends(get_db),
    _: object = Depends(get_current_admin),
):
    db_category = (
        await db.execute(select(Category).where(Category.id == category_id))
    ).scalar_one_or_none()
    if not db_category:
        raise HTTPException(status_code=404, detail="Category not found")

    db_category.name = category.name
    db_category.icon = category.icon
    db_category.topics = category.topics
    await db.commit()
    await db.refresh(db_category)
    await invalidate_cache("old_categories*")
    return db_category


@router.delete("/{category_id}")
async def delete_category(
    category_id: int,
    db: AsyncSession = Depends(get_db),
    _: object = Depends(get_current_admin),
):
    db_category = (
        await db.execute(select(Category).where(Category.id == category_id))
    ).scalar_one_or_none()
    if not db_category:
        raise HTTPException(status_code=404, detail="Category not found")

    await db.delete(db_category)
    await db.commit()
    await invalidate_cache("old_categories*")
    return {"message": "Category deleted"}
