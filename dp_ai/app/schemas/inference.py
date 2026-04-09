from pydantic import BaseModel, Field
from typing import Optional


class PredictRequest(BaseModel):
    image_path: str = Field(..., description="Absolute path to the image file")
    model_path: str = Field(..., description="Absolute path to the .pt model file")
    conf: float = Field(default=0.25, ge=0.01, le=1.0)


class Detection(BaseModel):
    class_id: int
    class_name: str
    confidence: float
    bbox: list[float] = Field(..., description="[x1, y1, x2, y2] in pixels")


class PredictResponse(BaseModel):
    detections: list[Detection]
    image_path: str
    result_image_path: Optional[str] = None
    inference_time_ms: float
    model_path: str
