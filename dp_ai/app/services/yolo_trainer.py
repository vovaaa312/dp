from __future__ import annotations

import csv
import logging
import re
import threading
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

        def safe(*keys: str, default: float = 0.0) -> float:
            normalized = {
                k.strip().lower().replace(" ", ""): v
                for k, v in row.items()
            }
            for key in keys:
                wanted = key.lower().replace(" ", "")
                for column, value in normalized.items():
                    if column == wanted or column.startswith(f"{wanted}("):
                        try:
                            return float(value)
                        except (ValueError, TypeError):
                            return default
            return default

        # Read actual epoch number from CSV (YOLO uses 0-indexed epochs)
        epoch_val = 0
        for k, v in row.items():
            if k.strip().lower() == "epoch":
                try:
                    epoch_val = int(float(v))  # Ultralytics 8.3 writes 1-indexed epochs
                except (ValueError, TypeError):
                    pass
                break

        precision = safe("metrics/precision")
        recall = safe("metrics/recall")
        f1 = 2 * precision * recall / (precision + recall) if precision + recall else 0.0
        # Object detection has no meaningful true-negative count. This accuracy is
        # TP / (TP + FP + FN), derived from aggregate precision and recall.
        accuracy_denominator = precision + recall - precision * recall
        accuracy = precision * recall / accuracy_denominator if accuracy_denominator else 0.0

        return EpochMetrics(
            epoch=epoch_val,
            box_loss=round(safe("train/box_loss", "box_loss"), 4),
            cls_loss=round(safe("train/cls_loss", "cls_loss"), 4),
            dfl_loss=round(safe("train/dfl_loss", "dfl_loss"), 4),
            mAP50=round(safe("metrics/mAP50"), 4),
            mAP50_95=round(safe("metrics/mAP50-95"), 4),
            precision=round(precision, 4),
            recall=round(recall, 4),
            f1=round(f1, 4),
            accuracy=round(accuracy, 4),
        )
    except Exception:
        return None


def _is_cuda_error(exc: BaseException) -> bool:
    """Return True only for failures that make a GPU retry on CPU useful."""
    messages: list[str] = []
    current: BaseException | None = exc
    while current is not None and len(messages) < 8:
        messages.append(str(current).lower())
        current = current.__cause__ or current.__context__
    text = " ".join(messages)
    return any(token in text for token in (
        "cuda", "cudnn", "cublas", "nvidia", "gpu",
        "device-side assert", "no kernel image", "out of memory",
    ))


def _select_device(logger: logging.Logger, preference: str = "auto") -> tuple[str | int, str, bool]:
    """Prefer CUDA, but fall back during preflight if it cannot be initialized."""
    preference = preference.lower()
    if preference == "cpu":
        return "cpu", "CPU (selected)", False
    try:
        import torch
        if not torch.cuda.is_available():
            fallback = preference == "gpu"
            return "cpu", "CPU (CUDA unavailable)", fallback
        try:
            torch.cuda.init()
            torch.empty(1, device="cuda")
            torch.cuda.synchronize()
            name = torch.cuda.get_device_name(0)
            return 0, f"GPU: {name}", False
        except Exception as exc:
            logger.warning("CUDA preflight failed; using CPU: %s", exc)
            return "cpu", "CPU (CUDA preflight fallback)", True
    except Exception as exc:
        logger.warning("PyTorch CUDA check failed; using CPU: %s", exc)
        return "cpu", "CPU (CUDA check fallback)", True


def _extract_confusion_matrix(trainer) -> tuple[list[list[float]] | None, list[str] | None]:
    """Extract the current validation confusion matrix from Ultralytics."""
    try:
        validator = getattr(trainer, "validator", trainer)
        confusion = getattr(validator, "confusion_matrix", None)
        matrix = getattr(confusion, "matrix", None)
        if matrix is None:
            return None, None
        if hasattr(matrix, "detach"):
            matrix = matrix.detach().cpu().numpy()
        elif hasattr(matrix, "cpu"):
            matrix = matrix.cpu().numpy()
        values = [[round(float(value), 4) for value in row] for row in matrix.tolist()]
        names = getattr(validator, "names", {})
        if isinstance(names, dict):
            labels = [str(names[key]) for key in sorted(names)]
        else:
            labels = [str(name) for name in names]
        if len(values) == len(labels) + 1:
            labels.append("background")
        return values, labels
    except Exception:
        return None, None

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
    device, device_label, preflight_fallback = _select_device(logger, request.device_preference)
    record.device = device_label
    record.device_fallback = preflight_fallback

    logger.info("=" * 60)
    logger.info(f"Job ID      : {record.job_id}")
    logger.info(f"Model       : {request.model_name}")
    logger.info(f"Dataset     : {request.dataset_path}")
    logger.info(f"Epochs      : {request.epochs}")
    logger.info(f"Image size  : {request.imgsz}")
    logger.info(f"Batch size  : {request.batch}")
    logger.info(f"Learning rate: {request.learning_rate}")
    logger.info(f"Patience    : {request.patience}")
    logger.info(f"Seed        : {request.seed}")
    logger.info(f"Resume from : {request.resume_from or 'none'}")
    logger.info(f"Device      : {record.device}")
    logger.info("=" * 60)

    def _capture_metrics(trainer) -> None:
        csv_path = Path(getattr(trainer, "save_dir", run_dir)) / "results.csv"
        metrics = _parse_results_csv(csv_path)
        if metrics is None:
            return
        matrix, labels = latest_confusion
        if matrix is None:
            matrix, labels = _extract_confusion_matrix(trainer)
        metrics.confusion_matrix = matrix
        metrics.confusion_matrix_labels = labels
        with record.metrics_lock:
            record.current_epoch = metrics.epoch
            record.metrics = metrics
            for index, existing in enumerate(record.metrics_history):
                if existing.epoch == metrics.epoch:
                    record.metrics_history[index] = metrics
                    break
            else:
                record.metrics_history.append(metrics)
                record.metrics_history.sort(key=lambda item: item.epoch)
        logger.info(
            f"Epoch {metrics.epoch:>4}/{record.total_epochs} | "
            f"precision={metrics.precision:.4f} recall={metrics.recall:.4f} "
            f"F1={metrics.f1:.4f} accuracy={metrics.accuracy:.4f} | "
            f"mAP50={metrics.mAP50:.4f} mAP50-95={metrics.mAP50_95:.4f} | "
            f"box_loss={metrics.box_loss:.4f} cls_loss={metrics.cls_loss:.4f} dfl_loss={metrics.dfl_loss:.4f}"
        )

    def _on_epoch_end(trainer):
        if record.stop_event.is_set():
            trainer.epoch = trainer.epochs

    def _on_fit_epoch_end(trainer):
        _capture_metrics(trainer)

    latest_confusion: tuple[list[list[float]] | None, list[str] | None] = (None, None)

    def _on_val_end(validator):
        nonlocal latest_confusion
        latest_confusion = _extract_confusion_matrix(validator)

    def _train_on(selected_device: str | int) -> None:
        if request.resume_from and Path(request.resume_from).exists():
            model = YOLO(request.resume_from)
            resume = True
        else:
            model = YOLO(request.model_name)
            resume = False
        model.add_callback("on_train_epoch_end", _on_epoch_end)
        model.add_callback("on_fit_epoch_end", _on_fit_epoch_end)
        model.add_callback("on_val_end", _on_val_end)
        model.train(
            data=data_path,
            epochs=request.epochs,
            imgsz=request.imgsz,
            batch=request.batch,
            name=record.job_id,
            project=project_dir,
            exist_ok=True,
            resume=resume,
            workers=0,
            device=selected_device,
            lr0=request.learning_rate,
            patience=request.patience,
            seed=request.seed,
            plots=True,
        )

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

        try:
            _train_on(device)
        except BaseException as first_error:
            if device != "cpu" and _is_cuda_error(first_error) and not record.stop_event.is_set():
                logger.warning("GPU training failed; retrying once on CPU: %s", first_error)
                record.device = "CPU (automatic fallback after GPU failure)"
                record.device_fallback = True
                if not request.resume_from:
                    with record.metrics_lock:
                        record.current_epoch = 0
                        record.metrics = None
                        record.metrics_history.clear()
                try:
                    import torch
                    torch.cuda.empty_cache()
                except Exception:
                    pass
                _train_on("cpu")
            else:
                raise

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
