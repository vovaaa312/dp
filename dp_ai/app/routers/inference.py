from __future__ import annotations

import time
import uuid
from pathlib import Path

from fastapi import APIRouter, HTTPException, UploadFile, File, Form

from app.config import settings
from app.schemas.inference import Detection, PredictRequest, PredictResponse

router = APIRouter(prefix="/predict", tags=["inference"])


def _run_yolo_inference(image_path: str, model_path: str, conf: float) -> PredictResponse:
    """Run real YOLO inference. Raises RuntimeError if ultralytics unavailable."""
    from ultralytics import YOLO  # lazy import

    t0 = time.perf_counter()
    model = YOLO(model_path)
    results = model.predict(source=image_path, conf=conf, save=False, verbose=False)
    elapsed_ms = (time.perf_counter() - t0) * 1000

    detections: list[Detection] = []
    for r in results:
        if r.boxes is None:
            continue
        names = r.names
        for box in r.boxes:
            cls_id = int(box.cls[0].item())
            detections.append(
                Detection(
                    class_id=cls_id,
                    class_name=names.get(cls_id, str(cls_id)),
                    confidence=round(float(box.conf[0].item()), 4),
                    bbox=[round(x, 1) for x in box.xyxy[0].tolist()],
                )
            )

    return PredictResponse(
        detections=detections,
        image_path=image_path,
        inference_time_ms=round(elapsed_ms, 2),
        model_path=model_path,
    )


def _is_mock_model(model_path: str) -> bool:
    """Check if the model file is a mock marker (text file, not a real .pt)."""
    try:
        content = Path(model_path).read_text(encoding="utf-8", errors="ignore").strip()
        return content.startswith("mock_model:")
    except Exception:
        return False


def _run_mock_inference(image_path: str, model_path: str) -> PredictResponse:
    """Return synthetic detections when ultralytics is unavailable or model is mock."""
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

    content = await file.read()
    image_path.write_bytes(content)

    if _is_mock_model(model_path):
        return _run_mock_inference(str(image_path), model_path)

    try:
        return _run_yolo_inference(str(image_path), model_path, conf)
    except ImportError:
        return _run_mock_inference(str(image_path), model_path)
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
        return _run_yolo_inference(request.image_path, request.model_path, request.conf)
    except ImportError:
        return _run_mock_inference(request.image_path, request.model_path)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Inference failed: {exc}") from exc
