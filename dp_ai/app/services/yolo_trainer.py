from __future__ import annotations

import csv
import logging
import re
import threading
import time
import traceback
from datetime import datetime, timezone
from pathlib import Path

from app.config import settings
from app.schemas.training import EpochMetrics, TrainRequest
from app.services.job_store import JobRecord
from app.services.trainer_base import BaseTrainer

_ANSI_RE = re.compile(r"\x1b\[[0-9;]*m")


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
    Auto-detect dataset format, convert to YOLO if needed,
    then patch the yaml's 'path' to absolute.
    """
    import yaml as _yaml
    from app.services.dataset_converter import detect_and_convert

    p = Path(dataset_path)
    if p.is_file():
        return dataset_path

    # Auto-detect and convert (COCO, VOC, flat -> YOLO)
    yaml_path_str = detect_and_convert(dataset_path)
    yaml_path = Path(yaml_path_str)

    # Patch 'path' to absolute
    with open(yaml_path) as f:
        cfg = _yaml.safe_load(f)

    cfg["path"] = str(p.resolve())

    patched_path = p / "_patched_data.yaml"
    with open(patched_path, "w") as f:
        _yaml.dump(cfg, f)

    return str(patched_path)


def _get_results_dir(request: TrainRequest) -> str:
    """Get results directory — use per-user dir from backend if provided."""
    if request.results_dir:
        return request.results_dir
    return str(settings.results_dir)


class _StripAnsiFormatter(logging.Formatter):
    """Strip ANSI color codes from ultralytics log messages."""

    def format(self, record: logging.LogRecord) -> str:
        msg = super().format(record)
        return _ANSI_RE.sub("", msg)


def _make_job_logger(log_path: Path) -> logging.Logger:
    """Create a file logger for a specific training job."""
    logger = logging.getLogger(f"job.{log_path.parent.name}")
    logger.setLevel(logging.DEBUG)
    logger.handlers.clear()
    handler = logging.FileHandler(log_path, mode="w", encoding="utf-8")
    handler.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(message)s", datefmt="%Y-%m-%d %H:%M:%S"))
    logger.addHandler(handler)
    logger.propagate = False
    return logger


def _run_yolo_training(record: JobRecord, request: TrainRequest) -> None:
    record.status = "RUNNING"
    record.started_at = datetime.now(timezone.utc)

    try:
        from ultralytics import YOLO
    except ImportError:
        record.status = "FAILED"
        record.error = "ultralytics not installed; set TRAINER_TYPE=mock"
        record.finished_at = datetime.now(timezone.utc)
        return

    project_dir = _get_results_dir(request)
    run_dir = Path(project_dir) / record.job_id
    run_dir.mkdir(parents=True, exist_ok=True)

    log_path = run_dir / "training.log"
    record.log_path = str(log_path)
    logger = _make_job_logger(log_path)

    logger.info("=" * 60)
    logger.info(f"Job ID      : {record.job_id}")
    logger.info(f"Model       : {request.model_name}")
    logger.info(f"Dataset     : {request.dataset_path}")
    logger.info(f"Epochs      : {request.epochs}")
    logger.info(f"Image size  : {request.imgsz}")
    logger.info(f"Batch size  : {request.batch}")
    logger.info(f"Resume from : {request.resume_from or 'none'}")
    logger.info("=" * 60)

    def _poll_metrics() -> None:
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
                    logger.info(
                        f"Epoch {m.epoch:>4}/{record.total_epochs} | "
                        f"box_loss={m.box_loss:.4f}  cls_loss={m.cls_loss:.4f}  dfl_loss={m.dfl_loss:.4f} | "
                        f"mAP50={m.mAP50:.4f}  mAP50-95={m.mAP50_95:.4f}"
                    )
            time.sleep(2)

    poll_thread = threading.Thread(target=_poll_metrics, daemon=True)
    poll_thread.start()

    def _on_epoch_end(trainer):
        if record.stop_event.is_set():
            trainer.epoch = trainer.epochs

    # Attach a file handler to the ultralytics logger so its messages
    # (optimizer info, dataset scanning, AMP checks, etc.) land in training.log
    ul_logger = logging.getLogger("ultralytics")
    ul_handler = logging.FileHandler(log_path, mode="a", encoding="utf-8")
    ul_handler.setFormatter(_StripAnsiFormatter("%(asctime)s %(message)s", datefmt="%Y-%m-%d %H:%M:%S"))
    ul_logger.addHandler(ul_handler)

    try:
        # Force non-interactive matplotlib backend (required in headless Docker)
        import matplotlib
        matplotlib.use("Agg")

        data_path = _resolve_dataset_yaml(request.dataset_path)
        logger.info(f"Dataset YAML: {data_path}")
        logger.info("Training started")

        # Resume from last.pt if specified
        if request.resume_from and Path(request.resume_from).exists():
            model = YOLO(request.resume_from)
            model.add_callback("on_train_epoch_end", _on_epoch_end)
            model.train(
                data=data_path,
                epochs=request.epochs,
                imgsz=request.imgsz,
                batch=request.batch,
                name=record.job_id,
                project=project_dir,
                exist_ok=True,
                resume=True,
                workers=0,
            )
        else:
            model = YOLO(request.model_name)
            model.add_callback("on_train_epoch_end", _on_epoch_end)
            model.train(
                data=data_path,
                epochs=request.epochs,
                imgsz=request.imgsz,
                batch=request.batch,
                name=record.job_id,
                project=project_dir,
                exist_ok=True,
                workers=0,
            )

        record.stop_event.set()
        best_pt = run_dir / "weights" / "best.pt"
        record.result_path = str(best_pt) if best_pt.exists() else None
        if record.status != "STOPPED":
            record.status = "COMPLETED"
            logger.info("Training COMPLETED successfully")
    except BaseException as exc:
        record.status = "FAILED"
        record.error = str(exc)
        logger.error(f"Training FAILED: {exc}")
        logger.error(f"Traceback:\n{traceback.format_exc()}")
        raise
    finally:
        if record.result_path is None:
            for name in ("best.pt", "last.pt"):
                wp = run_dir / "weights" / name
                if wp.exists():
                    record.result_path = str(wp)
                    break
        if record.status == "STOPPED":
            logger.info(f"Training STOPPED at epoch {record.current_epoch}/{record.total_epochs}")
        logger.info(f"Result model: {record.result_path or 'none'}")
        record.stop_event.set()
        record.finished_at = datetime.now(timezone.utc)
        # Remove the ultralytics handler
        ul_logger.removeHandler(ul_handler)
        ul_handler.close()
        # flush and close the job logger
        for h in logger.handlers:
            h.flush()
            h.close()


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
        record.stop_event.set()
