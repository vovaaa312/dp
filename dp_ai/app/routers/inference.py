from __future__ import annotations

import time
import uuid
from pathlib import Path

from fastapi import APIRouter, HTTPException, UploadFile, File, Form

from app.config import settings
from app.schemas.inference import Detection, PredictRequest, PredictResponse

router = APIRouter(prefix="/predict", tags=["inference"])


def _run_yolo_inference(image_path: str, model_path: str, conf: float) -> PredictResponse:
    """Run real YOLO inference."""
    from ultralytics import YOLO

    t0 = time.perf_counter()
    model = YOLO(model_path)
    results = model.predict(source=image_path, conf=conf, save=False, verbose=False)
    elapsed_ms = (time.perf_counter() - t0) * 1000

    detections: list[Detection] = []
    for result in results:
        if result.boxes is None:
            continue
        names = result.names
        for box in result.boxes:
            class_id = int(box.cls[0].item())
            detections.append(
                Detection(
                    class_id=class_id,
                    class_name=names.get(class_id, str(class_id)),
                    confidence=round(float(box.conf[0].item()), 4),
                    bbox=[round(value, 1) for value in box.xyxy[0].tolist()],
                )
            )

    return PredictResponse(
        detections=detections,
        image_path=image_path,
        inference_time_ms=round(elapsed_ms, 2),
        model_path=model_path,
    )


def _run_torchvision_inference(image_path: str, model_path: str, conf: float) -> PredictResponse:
    """Run SSD or Faster R-CNN inference from our portable checkpoint."""
    import torch
    from PIL import Image
    from torchvision.transforms.functional import pil_to_tensor

    from app.services.torchvision_trainer import _build_model
    from app.services.yolo_trainer import _is_cuda_error

    t0 = time.perf_counter()
    state = torch.load(model_path, map_location="cpu", weights_only=True)
    architecture = state.get("architecture")
    if architecture not in {"ssd", "faster_rcnn"}:
        raise ValueError(f"Unsupported checkpoint architecture: {architecture}")
    names = list(state.get("names") or [])
    if not names:
        raise ValueError("Checkpoint does not contain class names")
    image_size = int(state.get("image_size", 300 if architecture == "ssd" else 640))
    model = _build_model(architecture, len(names) + 1, image_size, pretrained=False)
    model.load_state_dict(state["model_state_dict"])
    model.eval()

    with Image.open(image_path) as source:
        image = pil_to_tensor(source.convert("RGB")).float().div(255.0)

    def predict(device: str):
        model.to(device)
        with torch.no_grad():
            return model([image.to(device)])[0]

    device = "cuda:0" if torch.cuda.is_available() else "cpu"
    try:
        prediction = predict(device)
    except BaseException as first_error:
        if device.startswith("cuda") and _is_cuda_error(first_error):
            model.to("cpu")
            torch.cuda.empty_cache()
            prediction = predict("cpu")
        else:
            raise

    detections: list[Detection] = []
    boxes = prediction["boxes"].detach().cpu()
    labels = prediction["labels"].detach().cpu()
    scores = prediction["scores"].detach().cpu()
    for box, label, score in zip(boxes, labels, scores):
        confidence = float(score)
        if confidence < conf:
            continue
        class_id = int(label) - 1
        if not 0 <= class_id < len(names):
            continue
        detections.append(
            Detection(
                class_id=class_id,
                class_name=names[class_id],
                confidence=round(confidence, 4),
                bbox=[round(float(value), 1) for value in box.tolist()],
            )
        )

    elapsed_ms = (time.perf_counter() - t0) * 1000
    return PredictResponse(
        detections=detections,
        image_path=image_path,
        inference_time_ms=round(elapsed_ms, 2),
        model_path=model_path,
    )


def _run_real_inference(image_path: str, model_path: str, conf: float) -> PredictResponse:
    if Path(model_path).suffix.lower() == ".pth":
        return _run_torchvision_inference(image_path, model_path, conf)
    return _run_yolo_inference(image_path, model_path, conf)


def _is_mock_model(model_path: str) -> bool:
    """Check if the model file is a mock marker (text file, not a real .pt)."""
    try:
        content = Path(model_path).read_text(encoding="utf-8", errors="ignore").strip()
        return content.startswith("mock_model:")
    except Exception:
        return False


def _run_mock_inference(image_path: str, model_path: str) -> PredictResponse:
    """Return synthetic detections for a deliberately selected mock model."""
    import random
    detections = [
        Detection(class_id=0, class_name="buffalo", confidence=round(0.75 + random.uniform(-0.1, 0.15), 2), bbox=[80.0, 40.0, 310.0, 390.0]),
        Detection(class_id=1, class_name="elephant", confidence=round(0.68 + random.uniform(-0.1, 0.15), 2), bbox=[350.0, 150.0, 620.0, 460.0]),
    ]
    return PredictResponse(
        detections=detections,
        image_path=image_path,
        inference_time_ms=round(8.0 + random.uniform(0, 10), 2),
        model_path=model_path,
    )


@router.post("", response_model=PredictResponse)
async def predict_from_upload(
    file: UploadFile = File(...),
    model_path: str = Form(...),
    conf: float = Form(default=0.25),
) -> PredictResponse:
    """Accept an image upload, run inference, return detections."""
    settings.ensure_dirs()

    suffix = Path(file.filename or "image.jpg").suffix or ".jpg"
    image_filename = f"{uuid.uuid4().hex}{suffix}"
    image_path = settings.uploads_dir / image_filename
    image_path.write_bytes(await file.read())

    if _is_mock_model(model_path):
        return _run_mock_inference(str(image_path), model_path)

    try:
        return _run_real_inference(str(image_path), model_path, conf)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Inference failed: {exc}") from exc


@router.post("/by-path", response_model=PredictResponse)
def predict_by_path(request: PredictRequest) -> PredictResponse:
    """Run inference on a file already on the shared volume."""
    if not Path(request.image_path).exists():
        raise HTTPException(status_code=404, detail=f"Image not found: {request.image_path}")

    if _is_mock_model(request.model_path):
        return _run_mock_inference(request.image_path, request.model_path)

    try:
        return _run_real_inference(request.image_path, request.model_path, request.conf)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Inference failed: {exc}") from exc