FROM pytorch/pytorch:2.5.1-cuda12.4-cudnn9-runtime

WORKDIR /app

# Install system deps for OpenCV / Pillow, then clean up
RUN apt-get update && apt-get install -y --no-install-recommends \
    libglib2.0-0 libsm6 libxrender1 libxext6 libgl1 curl \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt \
    && conda clean -afy 2>/dev/null || true \
    && find /opt/conda -name '*.a' -delete 2>/dev/null || true \
    && find /opt/conda -name '__pycache__' -type d -exec rm -rf {} + 2>/dev/null || true \
    && find /opt/conda -name 'tests' -type d -exec rm -rf {} + 2>/dev/null || true \
    && rm -rf /root/.cache/pip

# Cache the default model in the image without storing binary weights in Git.
RUN python -c "from ultralytics import YOLO; YOLO('yolov8n.pt')"

COPY app/ ./app/

ENV DATA_DIR=/data \
    TRAINER_TYPE=yolo \
    AI_HOST=0.0.0.0 \
    AI_PORT=8000

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
