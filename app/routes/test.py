from fastapi import APIRouter

router = APIRouter()

@router.get("/")
async def test_root():
    return {"status": "ok", "message": "Test route works!"}

@router.get("/categories")
async def test_categories():
    return [
        {"id": 1, "name": "Programming"},
        {"id": 2, "name": "Design"},
        {"id": 3, "name": "Marketing"}
    ]