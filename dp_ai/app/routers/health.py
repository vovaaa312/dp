from fastapi import APIRouter
from app.config import settings

router = APIRouter()


@router.get("/health")
def health() -> dict:
    return {
        "status": "ok",
        "trainer": settings.trainer_type,
        "data_dir": settings.data_dir,
    }
