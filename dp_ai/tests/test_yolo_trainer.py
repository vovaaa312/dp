import csv
import logging
import sys
import tempfile
import types
import unittest
from pathlib import Path
from unittest.mock import patch

from app.schemas.training import TrainRequest
from app.services.job_store import JobRecord
from app.services.yolo_trainer import (
    _extract_confusion_matrix,
    _is_cuda_error,
    _parse_results_csv,
    _run_yolo_training,
)


class YoloMetricsTests(unittest.TestCase):
    def test_results_csv_contains_all_quality_metrics(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "results.csv"
            with path.open("w", newline="") as handle:
                writer = csv.DictWriter(handle, fieldnames=[
                    "epoch", "train/box_loss", "train/cls_loss", "train/dfl_loss",
                    "metrics/precision(B)", "metrics/recall(B)",
                    "metrics/mAP50(B)", "metrics/mAP50-95(B)",
                ])
                writer.writeheader()
                writer.writerow({
                    "epoch": 1,
                    "train/box_loss": 1.1,
                    "train/cls_loss": 0.7,
                    "train/dfl_loss": 0.5,
                    "metrics/precision(B)": 0.8,
                    "metrics/recall(B)": 0.5,
                    "metrics/mAP50(B)": 0.6,
                    "metrics/mAP50-95(B)": 0.4,
                })

            metrics = _parse_results_csv(path)
            self.assertIsNotNone(metrics)
            self.assertEqual(metrics.epoch, 1)
            self.assertEqual(metrics.precision, 0.8)
            self.assertEqual(metrics.recall, 0.5)
            self.assertEqual(metrics.f1, 0.6154)
            self.assertEqual(metrics.accuracy, 0.4444)
            self.assertEqual(metrics.mAP50, 0.6)
            self.assertEqual(metrics.mAP50_95, 0.4)

    def test_confusion_matrix_is_serializable(self):
        class Matrix:
            def tolist(self):
                return [[3, 1], [2, 4]]

        validator = types.SimpleNamespace(
            confusion_matrix=types.SimpleNamespace(matrix=Matrix()),
            names={0: "cat"},
        )
        matrix, labels = _extract_confusion_matrix(types.SimpleNamespace(validator=validator))
        self.assertEqual(matrix, [[3.0, 1.0], [2.0, 4.0]])
        self.assertEqual(labels, ["cat", "background"])

    def test_only_gpu_errors_are_eligible_for_fallback(self):
        self.assertTrue(_is_cuda_error(RuntimeError("CUDA out of memory")))
        self.assertTrue(_is_cuda_error(RuntimeError("cuDNN initialization failed")))
        self.assertFalse(_is_cuda_error(ValueError("dataset.yaml is invalid")))

    def test_gpu_failure_retries_once_on_cpu(self):
        calls = []

        class FakeYOLO:
            def __init__(self, model_name):
                self.model_name = model_name

            def add_callback(self, event, callback):
                pass

            def train(self, **kwargs):
                calls.append(kwargs["device"])
                if kwargs["device"] == 0:
                    raise RuntimeError("CUDA out of memory")
                weights = Path(kwargs["project"]) / kwargs["name"] / "weights"
                weights.mkdir(parents=True, exist_ok=True)
                (weights / "best.pt").write_text("fake")

        fake_ultralytics = types.SimpleNamespace(YOLO=FakeYOLO)
        with tempfile.TemporaryDirectory() as directory:
            request = TrainRequest(
                dataset_path="dataset",
                run_name="fallback-test",
                trainer_type="yolo",
                results_dir=directory,
            )
            record = JobRecord(request.run_name, request.epochs, "yolo")
            with (
                patch.dict(sys.modules, {"ultralytics": fake_ultralytics}),
                patch("app.services.yolo_trainer._select_device", return_value=(0, "GPU: test", False)),
                patch("app.services.yolo_trainer._resolve_dataset_yaml", return_value="data.yaml"),
            ):
                _run_yolo_training(record, request)

            self.assertEqual(calls, [0, "cpu"])
            self.assertEqual(record.status, "COMPLETED")
            self.assertTrue(record.device_fallback)
            self.assertIn("automatic fallback", record.device)
            self.assertTrue(Path(record.result_path).exists())


if __name__ == "__main__":
    unittest.main()