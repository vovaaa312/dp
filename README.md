# Object Detection Training Platform

A microservice diploma project for training and using computer vision object detection models (YOLOv8).

## Architecture

```
[React Frontend :80]
       │  REST (polls every 3–5 s)
       ▼
[Spring Boot Orchestrator :8080]
       │  REST
       ▼
[FastAPI AI Service :8000]
       │
[Shared Docker volume /data/]
   /data/datasets/   ← uploaded dataset archives
   /data/uploads/    ← inference images
   /data/results/    ← training run outputs & model weights
   /data/models/     ← additional model files
```

## Services

| Service      | Tech                       | Port |
|-------------|----------------------------|------|
| `dp_front`  | React 19 + TypeScript + Vite, nginx | 80 / 5173 (dev) |
| `dp_back`   | Java 17, Spring Boot 4     | 8080 |
| `dp_ai`     | Python 3.11, FastAPI       | 8000 |

## Quick Start (Docker)

```bash
cd dp
docker compose up --build
```

Open **http://localhost** in your browser.

> First build takes ~5–10 minutes (downloads Maven/npm/Python dependencies).

## Local Development

### AI Service

```bash
cd dp_ai
python -m venv .venv
.venv/Scripts/activate        # Windows
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

### Backend

```bash
cd dp_back
./mvnw spring-boot:run
# Connects to AI service at http://localhost:8000
```

### Frontend

```bash
cd dp_front
npm install
npm run dev
# Opens http://localhost:5173
# Proxies /api/ → http://localhost:8080
```

## Service Ports

| Service  | Local dev | Docker |
|----------|-----------|--------|
| Frontend | :5173     | :80    |
| Backend  | :8080     | :8080  |
| AI       | :8000     | :8000  |

## Main API Endpoints

### Backend (`/api/...`)

| Method | Path | Description |
|--------|------|-------------|
| GET  | `/api/health` | Health check |
| POST | `/api/jobs` | Start training job |
| GET  | `/api/jobs` | List all jobs |
| GET  | `/api/jobs/{id}` | Get job status + metrics |
| DELETE | `/api/jobs/{id}` | Stop job |
| POST | `/api/datasets/upload` | Upload dataset archive |
| GET  | `/api/datasets` | List datasets |
| POST | `/api/inference` | Run inference on image |

### AI Service

| Method | Path | Description |
|--------|------|-------------|
| GET  | `/health` | Health + trainer type |
| POST | `/train` | Start training job |
| GET  | `/train/{id}` | Get job status + metrics history |
| DELETE | `/train/{id}` | Stop training |
| POST | `/predict` | Inference (multipart upload) |
| POST | `/predict/by-path` | Inference by filesystem path |

## Training Modes

### Mock Trainer (default, `TRAINER_TYPE=mock`)
- Simulates training: ~0.6 s per epoch
- Generates realistic synthetic metrics (mAP50, box_loss, cls_loss)
- No GPU required
- Perfect for demo / diploma defense

### YOLO Trainer (`TRAINER_TYPE=yolo`)
- Uses Ultralytics YOLOv8 for real training
- GPU strongly recommended
- Dataset must be in Ultralytics YAML format (e.g., COCO128)
- Set env: `TRAINER_TYPE=yolo` in docker-compose.yml

To switch to real YOLO training, edit `docker-compose.yml`:
```yaml
  ai:
    environment:
      - TRAINER_TYPE=yolo
```

## Environment Variables

| Variable | Service | Default | Description |
|----------|---------|---------|-------------|
| `DATA_DIR` | ai, backend | `/data` | Shared data root |
| `TRAINER_TYPE` | ai | `mock` | `mock` or `yolo` |
| `AI_BASE_URL` | backend | `http://localhost:8000` | AI service URL |
| `SERVER_PORT` | backend | `8080` | Spring port |

## MVP Limitations

- **No persistent database**: jobs are stored in-memory. Restarting the service clears job history.
- **No authentication**: all endpoints are public.
- **Mock training does not produce a real model**: inference on mock-trained jobs uses the YOLOv8 pretrained weights.
- **YOLO training** in Docker requires a GPU-enabled Docker runtime (NVIDIA Container Toolkit).

## Where to Plug Real YOLO Training

1. Ensure the dataset is in Ultralytics YAML format with correct paths.
2. Set `TRAINER_TYPE=yolo` environment variable.
3. The `YoloTrainer` class in `dp_ai/app/services/yolo_trainer.py` handles the rest.
4. For GPU support in Docker, add to the `ai` service in `docker-compose.yml`:
   ```yaml
   deploy:
     resources:
       reservations:
         devices:
           - driver: nvidia
             count: 1
             capabilities: [gpu]
   ```
