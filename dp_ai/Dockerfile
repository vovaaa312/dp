FROM python:3.11-slim

WORKDIR /app

# Install system deps for OpenCV / Pillow
RUN apt-get update && apt-get install -y --no-install-recommends \
    libglib2.0-0 libsm6 libxrender1 libxext6 libgl1 curl \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app/ ./app/
COPY yolov8n.pt .

ENV DATA_DIR=/data \
    TRAINER_TYPE=mock \
    AI_HOST=0.0.0.0 \
    AI_PORT=8000

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
