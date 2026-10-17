# Object Detection Training Platform

A microservice diploma project for training, evaluating, comparing, and using object detection models through a web interface.

The platform currently supports three real object detection architectures:

- YOLOv8n (Ultralytics)
- SSD300 with a VGG16 backbone (Torchvision)
- Faster R-CNN with a ResNet-50 FPN backbone (Torchvision)

A mock trainer is also available for quick UI demonstrations without running a real training job.

## Features

- Upload and manage object detection datasets.
- Use YOLO, COCO, or Pascal VOC annotations; COCO and VOC datasets are converted automatically.
- Train YOLOv8n, SSD300 VGG16, and Faster R-CNN ResNet50 FPN on the same dataset.
- Configure epochs, image size, batch size, learning rate, early-stopping patience, random seed, and compute device.
- Prefer NVIDIA GPU training with automatic CPU fallback when CUDA fails.
- Stop running jobs and resume stopped or failed jobs from their saved configuration or checkpoint.
- Monitor training progress, logs, device information, and per-epoch losses.
- Compare accuracy, precision, recall, F1, mAP@50, and mAP@50-95.
- Inspect the confusion matrix after validation epochs.
- Save trained checkpoints and run inference on uploaded images.
- Authenticate with JWT and isolate datasets/results by user.
- Persist users, jobs, parameters, metrics, and model paths in PostgreSQL.
- Manage users and create/restore backups from the administrator interface.

## Architecture

```text
Browser
  |
  v
React 19 + TypeScript + nginx (:80)
  |
  | REST /api
  v
Spring Boot 4 + Java 17 (:8080) ------ PostgreSQL 16 (:5432)
  |
  | REST
  v
FastAPI + PyTorch/Ultralytics (:8000) -- NVIDIA GPU or CPU fallback
  |
  v
Shared Docker volume (/data)
  |- users/<id>/datasets
  |- users/<id>/results
  |- users/<id>/uploads
  `- torch-cache
```

Docker Compose starts four services:

| Service | Container | Technology | Port |
| --- | --- | --- | --- |
| `frontend` | `dp_front` | React, TypeScript, Vite, nginx | `80` |
| `backend` | `dp_back` | Java 17, Spring Boot, Spring Security, JPA | `8080` |
| `ai` | `dp_ai` | Python 3.11, FastAPI, PyTorch, Ultralytics | `8000` |
| `db` | `dp_db` | PostgreSQL 16 | `5432` |

Application files are stored in the `dp_data` Docker volume. PostgreSQL uses the separate `dp_pg_data` volume, so recreating containers does not remove datasets, models, or database records.

## Quick Start with Docker

### 1. Configure secrets

Copy the example environment file:

```powershell
Copy-Item .env.example .env
```

Replace the placeholder values in `.env`:

```dotenv
POSTGRES_DB=dp_db
POSTGRES_USER=dp_user
POSTGRES_PASSWORD=replace_with_a_strong_random_password
APP_JWT_SECRET=replace_with_at_least_64_random_characters
APP_JWT_EXPIRATION_MS=86400000
```

The real `.env` file is ignored by Git and must not be committed.

### 2. Build and start the platform

```powershell
docker compose up -d --build
docker compose ps
```

Open <http://localhost>.

The first build and the first training run can take longer because Docker dependencies and pretrained model weights must be downloaded. These files remain in Docker volumes for subsequent runs.

### 3. Initial administrator account

On an empty database, the backend creates this local administrator account:

```text
username: admin
password: adminadmin
```

Change the password after the first login.

## GPU Support

The Compose configuration requests one NVIDIA GPU for the AI service. A compatible NVIDIA driver and Docker Desktop GPU support are required.

The application checks CUDA before training. With `Auto` or `GPU` selected, a CUDA-related training failure triggers one automatic retry on CPU. Selecting `CPU only` bypasses CUDA completely.

If the host has no compatible NVIDIA runtime, remove the GPU device reservation from the `ai` service in `docker-compose.yml` before starting the stack. Training will then run on CPU and will be considerably slower.

The active device and any CPU fallback are displayed on the training job page and exposed by the AI health endpoint.

## Supported Models

| Trainer | Default model | Default image size | Default batch | Checkpoint |
| --- | --- | ---: | ---: | --- |
| YOLO | `yolov8n.pt` | 640 | 8 | `.pt` |
| SSD | `ssd300_vgg16` | 300 | 4 | `.pth` |
| Faster R-CNN | `fasterrcnn_resnet50_fpn` | 320 | 2 | `.pth` |
| Mock | `mock` | 320 | 8 | demo only |

SSD internally operates at 300 x 300. To reduce GPU memory pressure, the AI service limits SSD batches to 4 and Faster R-CNN batches to 2 even if a larger value is submitted.

For a fast smoke test on a 6 GB GPU, use 2-3 epochs and batch size 1, and run the real models sequentially rather than simultaneously.

## Training Parameters

| Parameter | Meaning |
| --- | --- |
| Epochs | Number of complete passes through the training split. |
| Image size | Input resolution. Higher values may improve small-object detection but require more memory. |
| Batch size | Number of images processed per optimizer step. |
| Learning rate | Optimizer step size. The UI accepts both `0.001` and `0,001`. |
| Early-stopping patience | Epochs without improvement before stopping; `0` disables early stopping. |
| Random seed | Seed used to make experiments more reproducible. |
| Device | Auto, GPU with CPU fallback, or CPU only. |

## Dataset Formats

Upload the complete dataset as a `.zip` archive, including training and validation data. Do not upload only the `train` directory.

The recommended YOLO layout is:

```text
dataset/
|- data.yaml
|- images/
|  |- train/
|  `- val/
`- labels/
   |- train/
   `- val/
```

Each YOLO label line must contain:

```text
class_id center_x center_y width height
```

Coordinates must be normalized to the `0..1` range. Image and label filenames must match.

COCO datasets with JSON annotations and Pascal VOC datasets with XML annotations are detected and converted to the internal YOLO-compatible representation automatically. The same converted dataset is then used by all three model families, which makes their evaluation comparable.

## Metrics

Metrics are calculated on the validation split after every epoch:

| Metric | Interpretation |
| --- | --- |
| Accuracy | Detection-oriented `TP / (TP + FP + FN)`; true negatives are not used. |
| Precision | Fraction of predicted detections that are correct. |
| Recall | Fraction of ground-truth objects that were detected. |
| F1 | Harmonic mean of precision and recall. |
| mAP@50 | Mean average precision at IoU 0.50. |
| mAP@50-95 | COCO-style mAP averaged over IoU thresholds from 0.50 to 0.95. |
| Confusion matrix | Predicted classes by actual classes, including background false positives/negatives. |

Training and validation losses are shown separately from quality metrics. Very short smoke tests confirm that the pipeline works, but they are not suitable for comparing final model quality.

## Inference

The Inference page can use pretrained YOLO weights or checkpoints produced by completed jobs. It supports YOLO `.pt` files and Torchvision SSD/Faster R-CNN `.pth` checkpoints.

The confidence threshold must be between `0.01` and `1.0`; both comma and dot decimal separators are accepted by the UI. Results include class names, confidence scores, bounding boxes, an annotated image, and inference time.

## Main API Endpoints

Swagger documentation for the AI service is available at <http://localhost:8000/docs> while the stack is running.

### Backend

| Method | Path | Description |
| --- | --- | --- |
| `POST` | `/api/auth/register` | Register a user. |
| `POST` | `/api/auth/login` | Authenticate and receive a JWT. |
| `GET` | `/api/datasets` | List the current user's datasets. |
| `POST` | `/api/datasets/upload` | Upload a dataset archive. |
| `DELETE` | `/api/datasets/{name}` | Delete a dataset. |
| `POST` | `/api/jobs` | Start a training job. |
| `GET` | `/api/jobs` | List the current user's jobs. |
| `GET` | `/api/jobs/{id}` | Read job status, parameters, and metrics. |
| `DELETE` | `/api/jobs/{id}` | Stop a running job. |
| `POST` | `/api/jobs/{id}/resume` | Resume a stopped or failed job. |
| `GET` | `/api/jobs/{id}/logs` | Read the training log. |
| `POST` | `/api/inference` | Run inference on an uploaded image. |
| `POST` | `/api/admin/backup` | Download a database and file backup (admin). |
| `POST` | `/api/admin/restore` | Restore a backup (admin). |

Except for authentication and health checks, backend endpoints require a JWT.

## Local Development

Docker Compose is the recommended development environment because it provides PostgreSQL, shared storage, and consistent service URLs.

### Frontend

```powershell
cd dp_front
npm install
npm run dev
```

The Vite development server runs at <http://localhost:5173> and proxies `/api` requests to the backend.

### Backend

```powershell
cd dp_back
./mvnw spring-boot:run
```

The backend requires PostgreSQL, the environment variables from `.env`, and an accessible AI service.

### AI service

```powershell
cd dp_ai
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

## Project Structure

```text
dp/
|- dp_front/   React user interface
|- dp_back/    Spring Boot API, authentication, persistence, orchestration
|- dp_ai/      FastAPI training, evaluation, conversion, and inference
|- docker-compose.yml
|- .env.example
`- README.md
```

## Verification

```powershell
docker compose build
docker compose exec ai python -m unittest discover -s tests -v
cd dp_front
npm run build
```

## Current Scope

This is a diploma/research prototype intended for controlled local use. It is not hardened for untrusted public deployment. Change default credentials and secrets before using it outside a local development environment.
