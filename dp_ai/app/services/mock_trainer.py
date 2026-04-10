from __future__ import annotations

import math
import random
import threading
import time
from datetime import datetime, timezone
from pathlib import Path

from app.config import settings
from app.schemas.training import EpochMetrics, TrainRequest
from app.services.job_store import JobRecord
from app.services.trainer_base import BaseTrainer


def _generate_metrics(epoch: int, total: float) -> EpochMetrics:
    """Generate realistic-looking but synthetic training metrics."""
    progress = epoch / total
    box_loss = max(0.05, 2.5 * math.exp(-3.0 * progress) + random.uniform(-0.05, 0.05))
    cls_loss = max(0.03, 1.8 * math.exp(-2.5 * progress) + random.uniform(-0.04, 0.04))
    dfl_loss = max(0.02, 1.2 * math.exp(-2.0 * progress) + random.uniform(-0.03, 0.03))
    mAP50 = min(0.95, 0.1 + 0.85 * (1 - math.exp(-4.0 * progress)) + random.uniform(-0.02, 0.02))
    mAP50_95 = min(0.75, 0.05 + 0.65 * (1 - math.exp(-4.0 * progress)) + random.uniform(-0.02, 0.02))
    return EpochMetrics(
        epoch=epoch,
        box_loss=round(box_loss, 4),
        cls_loss=round(cls_loss, 4),
        dfl_loss=round(dfl_loss, 4),
        mAP50=round(mAP50, 4),
        mAP50_95=round(mAP50_95, 4),
    )


def _run_mock_training(record: JobRecord, request: TrainRequest) -> None:
    record.status = "RUNNING"
    record.started_at = datetime.now(timezone.utc)

    project_dir = request.results_dir if request.results_dir else str(settings.results_dir)
    result_dir = Path(project_dir) / record.job_id / "weights"
    result_dir.mkdir(parents=True, exist_ok=True)

    # If resuming, start from where we left off
    start_epoch = 1
    if request.resume_from and record.metrics_history:
        start_epoch = len(record.metrics_history) + 1

    try:
        for epoch in range(start_epoch, request.epochs + 1):
            if record.stop_event.is_set():
                break

            time.sleep(0.6)

            metrics = _generate_metrics(epoch, request.epochs)
            record.current_epoch = epoch
            record.metrics = metrics
            record.metrics_history.append(metrics)

        # Write a marker file so inference can reference this "model"
        best_pt = result_dir / "best.pt"
        best_pt.write_text(f"mock_model:{request.model_name}\n")

        record.result_path = str(result_dir / "best.pt")
        if record.stop_event.is_set():
            record.status = "STOPPED"
        else:
            record.status = "COMPLETED"
        record.finished_at = datetime.now(timezone.utc)

    except Exception as exc:
        record.status = "FAILED"
        record.error = str(exc)
        record.finished_at = datetime.now(timezone.utc)


class MockTrainer(BaseTrainer):
    """Simulates training with synthetic metrics. No GPU required."""

    def start(self, record: JobRecord, request: TrainRequest) -> None:
        thread = threading.Thread(
            target=_run_mock_training,
            args=(record, request),
            daemon=True,
            name=f"mock-trainer-{record.job_id}",
        )
        thread.start()

    def stop(self, record: JobRecord) -> None:
        record.stop_event.set()
