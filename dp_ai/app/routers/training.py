from fastapi import APIRouter, HTTPException, status

from app.config import settings
from app.schemas.training import TrainRequest, TrainResponse, JobStatusResponse
from app.services.job_store import job_store
from app.services.mock_trainer import MockTrainer
from app.services.yolo_trainer import YoloTrainer
from app.services.trainer_base import BaseTrainer

router = APIRouter(prefix="/train", tags=["training"])


def _get_trainer(trainer_type: str) -> BaseTrainer:
    t = trainer_type.lower() if trainer_type else settings.trainer_type.lower()
    if t == "yolo":
        return YoloTrainer()
    return MockTrainer()


@router.post("", response_model=TrainResponse, status_code=status.HTTP_202_ACCEPTED)
def start_training(request: TrainRequest) -> TrainResponse:
    job_id = request.run_name

    existing = job_store.get(job_id)
    if existing is not None:
        if request.resume_from and existing.status in ("STOPPED", "FAILED"):
            # Reset the record for resume
            existing.status = "PENDING"
            existing.stop_event.clear()
            existing.error = None
            existing.finished_at = None
            trainer = _get_trainer(request.trainer_type)
            trainer.start(existing, request)
            return TrainResponse(job_id=job_id, status="RUNNING")
        elif existing.status in ("RUNNING", "PENDING"):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Job '{job_id}' is already running",
            )
        else:
            # Job finished — delete old record and create new
            job_store.delete(job_id)

    record = job_store.create(job_id=job_id, total_epochs=request.epochs, trainer_type=request.trainer_type)
    trainer = _get_trainer(request.trainer_type)
    trainer.start(record, request)

    return TrainResponse(job_id=job_id, status="RUNNING")


@router.get("/{job_id}", response_model=JobStatusResponse)
def get_job_status(job_id: str) -> JobStatusResponse:
    record = job_store.get(job_id)
    if record is None:
        raise HTTPException(status_code=404, detail=f"Job '{job_id}' not found")
    return record.to_response()


@router.delete("/{job_id}", response_model=TrainResponse)
def stop_training(job_id: str) -> TrainResponse:
    record = job_store.get(job_id)
    if record is None:
        raise HTTPException(status_code=404, detail=f"Job '{job_id}' not found")

    if record.status not in ("RUNNING", "PENDING"):
        return TrainResponse(job_id=job_id, status=record.status)

    trainer = _get_trainer(record.trainer_type if hasattr(record, 'trainer_type') else settings.trainer_type)
    trainer.stop(record)

    return TrainResponse(job_id=job_id, status="STOPPED")
