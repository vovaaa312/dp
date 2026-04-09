from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.routers import health, training, inference

app = FastAPI(
    title="DP AI Service",
    description="Object detection training and inference microservice",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router)
app.include_router(training.router)
app.include_router(inference.router)


@app.on_event("startup")
def on_startup() -> None:
    settings.ensure_dirs()
