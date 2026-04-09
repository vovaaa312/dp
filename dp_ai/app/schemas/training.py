from __future__ import annotations

from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field


class TrainRequest(BaseModel):
    dataset_path: str = Field(..., description="Absolute path to the dataset directory")
    model_name: str = Field(default="yolov8n.pt", description="Model weights filename or path")
    epochs: int = Field(default=10, ge=1, le=1000)
    imgsz: int = Field(default=640, ge=32, le=1920)
    batch: int = Field(default=8, ge=1, le=256)
    run_name: str = Field(..., description="Unique job identifier used as run name")
    trainer_type: str = Field(default="mock", description="'mock' or 'yolo'")


class EpochMetrics(BaseModel):
    epoch: int
    box_loss: float
    cls_loss: float
    dfl_loss: float
    mAP50: float
    mAP50_95: float


class TrainResponse(BaseModel):
    job_id: str
    status: str


class JobStatusResponse(BaseModel):
    job_id: str
    status: str
    current_epoch: int
    total_epochs: int
    metrics: Optional[EpochMetrics] = None
    metrics_history: list[EpochMetrics] = Field(default_factory=list)
    started_at: Optional[datetime] = None
    finished_at: Optional[datetime] = None
    error: Optional[str] = None
    result_path: Optional[str] = None
