from __future__ import annotations

import threading
from datetime import datetime, timezone
from typing import Optional

from app.schemas.training import EpochMetrics, JobStatusResponse


class JobRecord:
    """Mutable job state held in memory."""

    def __init__(self, job_id: str, total_epochs: int) -> None:
        self.job_id = job_id
        self.status: str = "PENDING"
        self.current_epoch: int = 0
        self.total_epochs: int = total_epochs
        self.metrics: Optional[EpochMetrics] = None
        self.metrics_history: list[EpochMetrics] = []
        self.started_at: Optional[datetime] = None
        self.finished_at: Optional[datetime] = None
        self.error: Optional[str] = None
        self.result_path: Optional[str] = None
        self.stop_event: threading.Event = threading.Event()

    def to_response(self) -> JobStatusResponse:
        return JobStatusResponse(
            job_id=self.job_id,
            status=self.status,
            current_epoch=self.current_epoch,
            total_epochs=self.total_epochs,
            metrics=self.metrics,
            metrics_history=self.metrics_history,
            started_at=self.started_at,
            finished_at=self.finished_at,
            error=self.error,
            result_path=self.result_path,
        )


class JobStore:
    """Thread-safe in-memory store for training jobs."""

    def __init__(self) -> None:
        self._jobs: dict[str, JobRecord] = {}
        self._lock = threading.Lock()

    def create(self, job_id: str, total_epochs: int) -> JobRecord:
        record = JobRecord(job_id=job_id, total_epochs=total_epochs)
        with self._lock:
            self._jobs[job_id] = record
        return record

    def get(self, job_id: str) -> Optional[JobRecord]:
        with self._lock:
            return self._jobs.get(job_id)

    def all(self) -> list[JobRecord]:
        with self._lock:
            return list(self._jobs.values())

    def delete(self, job_id: str) -> bool:
        with self._lock:
            if job_id in self._jobs:
                del self._jobs[job_id]
                return True
            return False


job_store = JobStore()
