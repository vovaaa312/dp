from __future__ import annotations

import csv
import threading
import time
from datetime import datetime, timezone
from pathlib import Path

from app.config import settings
from app.schemas.training import EpochMetrics, TrainRequest
from app.services.job_store import JobRecord
from app.services.trainer_base import BaseTrainer


def _parse_results_csv(csv_path: Path) -> EpochMetrics | None:
    """Read the latest row from Ultralytics results.csv and return metrics."""
    try:
        with open(csv_path, newline="") as f:
            reader = csv.DictReader(f)
            rows = list(reader)
        if not rows:
            return None
        row = rows[-1]

        def safe(key: str, default: float = 0.0) -> float:
            for k, v in row.items():
                if key.lower() in k.strip().lower().replace(" ", ""):
                    try:
                        return float(v)
                    except (ValueError, TypeError):
                        return default
            return default

        # Read actual epoch number from CSV (YOLO uses 0-indexed epochs)
        epoch_val = 0
        for k, v in row.items():
            if k.strip().lower() == "epoch":
                try:
                    epoch_val = int(float(v)) + 1  # convert to 1-indexed
                except (ValueError, TypeError):
                    pass
                break

        return EpochMetrics(
            epoch=epoch_val,
            box_loss=round(safe("box_loss"), 4),
            cls_loss=round(safe("cls_loss"), 4),
            dfl_loss=round(safe("dfl_loss"), 4),
            mAP50=round(safe("metrics/mAP50"), 4),
            mAP50_95=round(safe("metrics/mAP50-95"), 4),
        )
    except Exception:
        return None


def _resolve_dataset_yaml(dataset_path: str) -> str:
    """
    If dataset_path is a directory, find the .yaml inside it and patch its 'path'
    to the absolute directory so YOLO can find images/labels regardless of cwd.
    Returns the path to the yaml file.
    """
    import yaml as _yaml

    p = Path(dataset_path)
    if p.is_file():
        return dataset_path  # already a yaml path

    # find a yaml file in the directory
    yamls = list(p.glob("*.yaml")) + list(p.glob("*.yml"))
    if not yamls:
        raise FileNotFoundError(f"No .yaml file found in dataset directory: {dataset_path}")

    yaml_path = yamls[0]

    # read, patch 'path' to absolute, write a temp copy
    with open(yaml_path) as f:
        cfg = _yaml.safe_load(f)

    cfg["path"] = str(p.resolve())

    patched_path = p / "_patched_data.yaml"
    with open(patched_path, "w") as f:
        _yaml.dump(cfg, f)

    return str(patched_path)


def _run_yolo_training(record: JobRecord, request: TrainRequest) -> None:
    record.status = "RUNNING"
    record.started_at = datetime.now(timezone.utc)

    try:
        from ultralytics import YOLO  # imported lazily — only needed when TRAINER_TYPE=yolo
    except ImportError:
        record.status = "FAILED"
        record.error = "ultralytics not installed; set TRAINER_TYPE=mock"
        record.finished_at = datetime.now(timezone.utc)
        return

    run_dir = Path(settings.results_dir) / record.job_id

    def _poll_metrics() -> None:
        """Background thread that reads results.csv and updates the record."""
        csv_path = run_dir / "results.csv"
        last_epoch = 0
        while not record.stop_event.is_set() and record.status == "RUNNING":
            if csv_path.exists():
                m = _parse_results_csv(csv_path)
                if m and m.epoch > last_epoch:
                    last_epoch = m.epoch
                    record.current_epoch = last_epoch
                    record.metrics = m
                    record.metrics_history.append(m)
            time.sleep(2)

    poll_thread = threading.Thread(target=_poll_metrics, daemon=True)
    poll_thread.start()

    def _on_epoch_end(trainer):
        """Called by YOLO after each epoch — stop cleanly if requested."""
        if record.stop_event.is_set():
            trainer.epoch = trainer.epochs  # trick YOLO into thinking training is done

    try:
        data_path = _resolve_dataset_yaml(request.dataset_path)
        model = YOLO(request.model_name)
        model.add_callback("on_train_epoch_end", _on_epoch_end)
        model.train(
            data=data_path,
            epochs=request.epochs,
            imgsz=request.imgsz,
            batch=request.batch,
            name=record.job_id,
            project=str(settings.results_dir),
            exist_ok=True,
        )
        record.stop_event.set()  # stop poll thread
        best_pt = run_dir / "weights" / "best.pt"
        record.result_path = str(best_pt) if best_pt.exists() else None
        if record.status != "STOPPED":
            record.status = "COMPLETED"
    except Exception as exc:
        record.status = "FAILED"
        record.error = str(exc)
    finally:
        # Always try to save best/last weights as result_path
        if record.result_path is None:
            for name in ("best.pt", "last.pt"):
                wp = run_dir / "weights" / name
                if wp.exists():
                    record.result_path = str(wp)
                    break
        record.stop_event.set()
        record.finished_at = datetime.now(timezone.utc)


class YoloTrainer(BaseTrainer):
    """Real training backend using Ultralytics YOLOv8."""

    def start(self, record: JobRecord, request: TrainRequest) -> None:
        thread = threading.Thread(
            target=_run_yolo_training,
            args=(record, request),
            daemon=True,
            name=f"yolo-trainer-{record.job_id}",
        )
        thread.start()

    def stop(self, record: JobRecord) -> None:
        if record.status == "RUNNING":
            record.status = "STOPPED"
            record.finished_at = datetime.now(timezone.utc)
        record.stop_event.set()  # signals _on_epoch_end callback to stop YOLO after current epoch
