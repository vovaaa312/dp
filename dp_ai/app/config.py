from pydantic_settings import BaseSettings
from pathlib import Path


class Settings(BaseSettings):
    data_dir: str = "/data"
    trainer_type: str = "mock"
    ai_host: str = "0.0.0.0"
    ai_port: int = 8000

    @property
    def datasets_dir(self) -> Path:
        return Path(self.data_dir) / "datasets"

    @property
    def results_dir(self) -> Path:
        return Path(self.data_dir) / "results"

    @property
    def uploads_dir(self) -> Path:
        return Path(self.data_dir) / "uploads"

    @property
    def models_dir(self) -> Path:
        return Path(self.data_dir) / "models"

    def ensure_dirs(self) -> None:
        for d in (self.datasets_dir, self.results_dir, self.uploads_dir, self.models_dir):
            d.mkdir(parents=True, exist_ok=True)

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


settings = Settings()
