from abc import ABC, abstractmethod
from app.schemas.training import TrainRequest
from app.services.job_store import JobRecord


class BaseTrainer(ABC):
    """Abstract base class for training backends."""

    @abstractmethod
    def start(self, record: JobRecord, request: TrainRequest) -> None:
        """Launch training in a background thread. Must return immediately."""

    @abstractmethod
    def stop(self, record: JobRecord) -> None:
        """Signal the training thread to stop gracefully."""
