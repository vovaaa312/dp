from __future__ import annotations

import logging
import random
import threading
import traceback
from datetime import datetime, timezone
from pathlib import Path

from app.schemas.training import EpochMetrics, TrainRequest
from app.services.detection_dataset import YoloDetectionDataset, detection_collate
from app.services.job_store import JobRecord
from app.services.trainer_base import BaseTrainer
from app.services.yolo_trainer import _is_cuda_error, _make_job_logger, _select_device


def _build_model(architecture: str, num_classes: int, image_size: int, pretrained: bool = True):
    if architecture == "ssd":
        from torchvision.models import VGG16_Weights
        from torchvision.models.detection import ssd300_vgg16

        return ssd300_vgg16(
            weights=None,
            weights_backbone=VGG16_Weights.IMAGENET1K_FEATURES if pretrained else None,
            num_classes=num_classes,
        )

    if architecture == "faster_rcnn":
        from torchvision.models import ResNet50_Weights
        from torchvision.models.detection import fasterrcnn_resnet50_fpn

        return fasterrcnn_resnet50_fpn(
            weights=None,
            weights_backbone=ResNet50_Weights.IMAGENET1K_V1 if pretrained else None,
            num_classes=num_classes,
            min_size=image_size,
            max_size=image_size,
        )

    raise ValueError(f"Unsupported torchvision architecture: {architecture}")


def _move_target(target: dict, device):
    return {key: value.to(device) if hasattr(value, "to") else value for key, value in target.items()}


def _add_confusion(
    matrix,
    prediction: dict,
    target: dict,
    class_count: int,
    confidence: float = 0.25,
    iou_threshold: float = 0.5,
) -> None:
    import torch
    from torchvision.ops import box_iou

    scores = prediction["scores"].detach().cpu()
    keep = scores >= confidence
    pred_boxes = prediction["boxes"].detach().cpu()[keep]
    pred_labels = prediction["labels"].detach().cpu()[keep]
    order = scores[keep].argsort(descending=True)
    pred_boxes = pred_boxes[order]
    pred_labels = pred_labels[order]

    true_boxes = target["boxes"].detach().cpu()
    true_labels = target["labels"].detach().cpu()
    matched_predictions: set[int] = set()
    matched_targets: set[int] = set()

    if len(pred_boxes) and len(true_boxes):
        overlaps = box_iou(pred_boxes, true_boxes)
        candidates = torch.nonzero(overlaps >= iou_threshold, as_tuple=False)
        ranked = sorted(
            ((float(overlaps[p, t]), int(p), int(t)) for p, t in candidates),
            reverse=True,
        )
        for _, prediction_index, target_index in ranked:
            if prediction_index in matched_predictions or target_index in matched_targets:
                continue
            matched_predictions.add(prediction_index)
            matched_targets.add(target_index)
            predicted_class = int(pred_labels[prediction_index]) - 1
            actual_class = int(true_labels[target_index]) - 1
            if 0 <= predicted_class < class_count and 0 <= actual_class < class_count:
                matrix[predicted_class][actual_class] += 1.0

    background = class_count
    for index, label in enumerate(pred_labels):
        if index not in matched_predictions:
            predicted_class = int(label) - 1
            if 0 <= predicted_class < class_count:
                matrix[predicted_class][background] += 1.0
    for index, label in enumerate(true_labels):
        if index not in matched_targets:
            actual_class = int(label) - 1
            if 0 <= actual_class < class_count:
                matrix[background][actual_class] += 1.0


def _quality_from_confusion(matrix: list[list[float]], class_count: int) -> tuple[float, float, float, float]:
    true_positive = sum(matrix[index][index] for index in range(class_count))
    predicted_total = sum(sum(row) for row in matrix[:class_count])
    actual_total = sum(sum(matrix[row][column] for row in range(class_count + 1)) for column in range(class_count))
    false_positive = predicted_total - true_positive
    false_negative = actual_total - true_positive
    precision = true_positive / (true_positive + false_positive) if true_positive + false_positive else 0.0
    recall = true_positive / (true_positive + false_negative) if true_positive + false_negative else 0.0
    f1 = 2 * precision * recall / (precision + recall) if precision + recall else 0.0
    accuracy = true_positive / (true_positive + false_positive + false_negative) if true_positive + false_positive + false_negative else 0.0
    return precision, recall, f1, accuracy


def _evaluate(model, loader, device, names: list[str], epoch: int, losses: dict[str, float]) -> EpochMetrics:
    import torch
    from torchmetrics.detection.mean_ap import MeanAveragePrecision

    class_count = len(names)
    matrix = [[0.0 for _ in range(class_count + 1)] for _ in range(class_count + 1)]
    mean_ap = MeanAveragePrecision(box_format="xyxy", iou_type="bbox")
    model.eval()
    with torch.no_grad():
        for images, targets in loader:
            device_images = [image.to(device) for image in images]
            predictions = model(device_images)
            cpu_targets = [
                {"boxes": target["boxes"].cpu(), "labels": target["labels"].cpu()}
                for target in targets
            ]
            cpu_predictions = [
                {
                    "boxes": prediction["boxes"].detach().cpu(),
                    "scores": prediction["scores"].detach().cpu(),
                    "labels": prediction["labels"].detach().cpu(),
                }
                for prediction in predictions
            ]
            mean_ap.update(cpu_predictions, cpu_targets)
            for prediction, target in zip(cpu_predictions, cpu_targets):
                _add_confusion(matrix, prediction, target, class_count)

    result = mean_ap.compute()
    precision, recall, f1, accuracy = _quality_from_confusion(matrix, class_count)

    def value(name: str) -> float:
        raw = float(result[name])
        return max(0.0, raw)

    return EpochMetrics(
        epoch=epoch,
        box_loss=round(losses["box"], 4),
        cls_loss=round(losses["class"], 4),
        dfl_loss=0.0,
        mAP50=round(value("map_50"), 4),
        mAP50_95=round(value("map"), 4),
        precision=round(precision, 4),
        recall=round(recall, 4),
        f1=round(f1, 4),
        accuracy=round(accuracy, 4),
        confusion_matrix=matrix,
        confusion_matrix_labels=[*names, "background"],
    )


def _loss_groups(loss_dict: dict) -> tuple[float, float]:
    box = 0.0
    classification = 0.0
    for name, value in loss_dict.items():
        scalar = float(value.detach())
        if "box" in name or "bbox" in name:
            box += scalar
        else:
            classification += scalar
    return box, classification


def _checkpoint(
    path: Path,
    architecture: str,
    model,
    optimizer,
    epoch: int,
    names: list[str],
    metrics: EpochMetrics,
    image_size: int,
) -> None:
    import torch

    torch.save(
        {
            "architecture": architecture,
            "model_state_dict": model.state_dict(),
            "optimizer_state_dict": optimizer.state_dict(),
            "epoch": epoch,
            "names": names,
            "image_size": 300 if architecture == "ssd" else image_size,
            "metrics": metrics.model_dump(),
        },
        path,
    )


def _run_torchvision_training(record: JobRecord, request: TrainRequest, architecture: str) -> None:
    import torch
    from torch.utils.data import DataLoader

    record.status = "RUNNING"
    record.started_at = datetime.now(timezone.utc)
    project_dir = Path(request.results_dir) if request.results_dir else Path("/data/results")
    run_dir = project_dir / record.job_id
    run_dir.mkdir(parents=True, exist_ok=True)
    log_path = run_dir / "training.log"
    record.log_path = str(log_path)
    logger = _make_job_logger(log_path)

    device, label, preflight_fallback = _select_device(logger, request.device_preference)
    record.device = label
    record.device_fallback = preflight_fallback
    train_dataset = YoloDetectionDataset(request.dataset_path, "train")
    val_dataset = YoloDetectionDataset(request.dataset_path, "val")
    names = train_dataset.names
    if names != val_dataset.names:
        raise ValueError("Train and validation class names differ")

    batch_size = request.batch
    if architecture == "faster_rcnn" and batch_size > 2:
        logger.warning("Faster R-CNN batch size reduced from %s to 2 for GPU memory safety", batch_size)
        batch_size = 2
    elif architecture == "ssd" and batch_size > 4:
        logger.warning("SSD batch size reduced from %s to 4 for GPU memory safety", batch_size)
        batch_size = 4

    generator = torch.Generator().manual_seed(request.seed)
    train_loader = DataLoader(
        train_dataset,
        batch_size=batch_size,
        shuffle=True,
        num_workers=0,
        collate_fn=detection_collate,
        generator=generator,
    )
    val_loader = DataLoader(
        val_dataset,
        batch_size=max(1, min(batch_size, 2)),
        shuffle=False,
        num_workers=0,
        collate_fn=detection_collate,
    )
    last_path = run_dir / "last.pth"
    best_path = run_dir / "best.pth"

    logger.info("=" * 60)
    logger.info("Architecture : %s", architecture)
    logger.info("Classes      : %s", len(names))
    logger.info("Train / val  : %s / %s images", len(train_dataset), len(val_dataset))
    logger.info("Epochs       : %s", request.epochs)
    logger.info("Image size   : %s", 300 if architecture == "ssd" else request.imgsz)
    logger.info("Batch size   : %s", batch_size)
    logger.info("Learning rate: %s", request.learning_rate)
    logger.info("Patience     : %s", request.patience)
    logger.info("Seed         : %s", request.seed)
    logger.info("Device       : %s", record.device)
    logger.info("=" * 60)

    def train_attempt(selected_device, resume_path: Path | None = None) -> None:
        random.seed(request.seed)
        torch.manual_seed(request.seed)
        # YOLO enables deterministic algorithms process-wide. On CUDA this makes
        # torchvision ROI Align invoke torch.compile and require a C compiler.
        torch.use_deterministic_algorithms(False)
        if torch.cuda.is_available():
            torch.cuda.manual_seed_all(request.seed)

        selected = torch.device(f"cuda:{selected_device}" if isinstance(selected_device, int) else selected_device)
        model = _build_model(
            architecture,
            num_classes=len(names) + 1,
            image_size=request.imgsz,
            pretrained=resume_path is None,
        )
        model.to(selected)
        optimizer = torch.optim.SGD(
            [parameter for parameter in model.parameters() if parameter.requires_grad],
            lr=request.learning_rate,
            momentum=0.9,
            weight_decay=0.0005,
        )
        start_epoch = 1
        best_score = -1.0
        stale_epochs = 0
        if resume_path and resume_path.exists():
            state = torch.load(resume_path, map_location=selected, weights_only=True)
            model.load_state_dict(state["model_state_dict"])
            if state.get("optimizer_state_dict"):
                optimizer.load_state_dict(state["optimizer_state_dict"])
            start_epoch = int(state.get("epoch", 0)) + 1
            best_score = float(state.get("metrics", {}).get("mAP50_95", -1.0))
            logger.info("Resuming from %s at epoch %s", resume_path, start_epoch)

        for epoch in range(start_epoch, request.epochs + 1):
            if record.stop_event.is_set():
                return
            model.train()
            box_total = 0.0
            class_total = 0.0
            batches = 0
            for images, targets in train_loader:
                if record.stop_event.is_set():
                    return
                device_images = [image.to(selected) for image in images]
                device_targets = [_move_target(target, selected) for target in targets]
                loss_dict = model(device_images, device_targets)
                loss = sum(loss_dict.values())
                if not torch.isfinite(loss):
                    raise RuntimeError(f"Non-finite training loss: {float(loss)}")
                optimizer.zero_grad(set_to_none=True)
                loss.backward()
                gradient_norm = torch.nn.utils.clip_grad_norm_(model.parameters(), max_norm=10.0)
                if not torch.isfinite(gradient_norm):
                    raise RuntimeError(f"Non-finite gradient norm: {float(gradient_norm)}")
                optimizer.step()
                box_loss, class_loss = _loss_groups(loss_dict)
                box_total += box_loss
                class_total += class_loss
                batches += 1

            averages = {
                "box": box_total / max(1, batches),
                "class": class_total / max(1, batches),
            }
            metrics = _evaluate(model, val_loader, selected, names, epoch, averages)
            with record.metrics_lock:
                record.current_epoch = epoch
                record.metrics = metrics
                record.metrics_history = [
                    item for item in record.metrics_history if item.epoch != epoch
                ]
                record.metrics_history.append(metrics)
                record.metrics_history.sort(key=lambda item: item.epoch)
            _checkpoint(last_path, architecture, model, optimizer, epoch, names, metrics, request.imgsz)
            if metrics.mAP50_95 > best_score:
                best_score = metrics.mAP50_95
                stale_epochs = 0
                _checkpoint(best_path, architecture, model, optimizer, epoch, names, metrics, request.imgsz)
            else:
                stale_epochs += 1

            logger.info(
                "Epoch %s/%s | precision=%.4f recall=%.4f F1=%.4f accuracy=%.4f | "
                "mAP50=%.4f mAP50-95=%.4f | box_loss=%.4f cls_loss=%.4f",
                epoch, request.epochs, metrics.precision, metrics.recall, metrics.f1,
                metrics.accuracy, metrics.mAP50, metrics.mAP50_95,
                metrics.box_loss, metrics.cls_loss,
            )
            if request.patience > 0 and stale_epochs >= request.patience:
                logger.info("Early stopping after %s epochs without mAP improvement", stale_epochs)
                break

    try:
        resume = Path(request.resume_from) if request.resume_from else None
        try:
            train_attempt(device, resume)
        except BaseException as first_error:
            if device != "cpu" and _is_cuda_error(first_error) and not record.stop_event.is_set():
                logger.warning("GPU training failed; retrying on CPU: %s", first_error)
                record.device = "CPU (automatic fallback after GPU failure)"
                record.device_fallback = True
                try:
                    torch.cuda.empty_cache()
                except Exception:
                    pass
                train_attempt("cpu", last_path if last_path.exists() else resume)
            else:
                raise

        if record.status != "STOPPED" and not record.stop_event.is_set():
            record.status = "COMPLETED"
        if record.status == "RUNNING":
            record.status = "STOPPED"
        record.result_path = str(best_path if best_path.exists() else last_path)
        logger.info("Training %s; model saved to %s", record.status, record.result_path)
    except BaseException as exc:
        record.status = "FAILED"
        record.error = str(exc)
        logger.error("Training FAILED: %s", exc)
        logger.error("Traceback:\n%s", traceback.format_exc())
    finally:
        record.finished_at = datetime.now(timezone.utc)
        record.stop_event.set()
        for handler in logger.handlers:
            handler.flush()
            handler.close()


def _safe_run(record: JobRecord, request: TrainRequest, architecture: str) -> None:
    try:
        _run_torchvision_training(record, request, architecture)
    except BaseException as exc:
        record.status = "FAILED"
        record.error = str(exc)
        record.finished_at = datetime.now(timezone.utc)
        record.stop_event.set()


class TorchvisionTrainer(BaseTrainer):
    def __init__(self, architecture: str) -> None:
        self.architecture = architecture

    def start(self, record: JobRecord, request: TrainRequest) -> None:
        thread = threading.Thread(
            target=_safe_run,
            args=(record, request, self.architecture),
            daemon=True,
            name=f"{self.architecture}-trainer-{record.job_id}",
        )
        thread.start()

    def stop(self, record: JobRecord) -> None:
        if record.status == "RUNNING":
            record.status = "STOPPED"
            record.finished_at = datetime.now(timezone.utc)
        record.stop_event.set()