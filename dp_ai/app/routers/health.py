from fastapi import APIRouter

from app.config import settings

router = APIRouter()


@router.get("/health")
def health() -> dict:
    gpu = {
        "available": False,
        "count": 0,
        "name": None,
        "cuda_version": None,
    }
    try:
        import torch
        gpu.update(
            available=torch.cuda.is_available(),
            count=torch.cuda.device_count(),
            name=torch.cuda.get_device_name(0) if torch.cuda.is_available() else None,
            cuda_version=torch.version.cuda,
        )
    except Exception as exc:
        gpu["error"] = str(exc)

    return {
        "status": "ok",
        "trainer": settings.trainer_type,
        "data_dir": settings.data_dir,
        "gpu": gpu,
    }