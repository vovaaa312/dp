from __future__ import annotations

from pathlib import Path
from typing import Iterable

import torch
import yaml
from PIL import Image
from torch.utils.data import Dataset
from torchvision.transforms.functional import pil_to_tensor

from app.services.yolo_trainer import _resolve_dataset_yaml

_IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".bmp", ".webp", ".tif", ".tiff"}


def _class_names(raw_names) -> list[str]:
    if isinstance(raw_names, dict):
        return [str(raw_names[key]) for key in sorted(raw_names, key=lambda value: int(value))]
    if isinstance(raw_names, list):
        return [str(value) for value in raw_names]
    raise ValueError("data.yaml must contain a 'names' list or mapping")


def _split_paths(root: Path, value) -> list[Path]:
    values = value if isinstance(value, list) else [value]
    images: list[Path] = []
    for raw in values:
        path = Path(str(raw))
        if not path.is_absolute():
            path = root / path
        if path.is_file() and path.suffix.lower() == ".txt":
            for line in path.read_text(encoding="utf-8").splitlines():
                candidate = Path(line.strip())
                if not candidate.is_absolute():
                    candidate = root / candidate
                if candidate.suffix.lower() in _IMAGE_EXTENSIONS:
                    images.append(candidate)
        elif path.is_dir():
            images.extend(file for file in path.rglob("*") if file.suffix.lower() in _IMAGE_EXTENSIONS)
    return sorted(set(images))


def _label_path(root: Path, image_path: Path) -> Path:
    relative = image_path.relative_to(root)
    parts = list(relative.parts)
    try:
        parts[parts.index("images")] = "labels"
    except ValueError:
        pass
    return root.joinpath(*parts).with_suffix(".txt")


class YoloDetectionDataset(Dataset):
    """Read a YOLO detection split and expose torchvision detection targets."""

    def __init__(self, dataset_path: str, split: str) -> None:
        yaml_path = Path(_resolve_dataset_yaml(dataset_path))
        config = yaml.safe_load(yaml_path.read_text(encoding="utf-8"))
        self.root = Path(config.get("path") or yaml_path.parent)
        if not self.root.is_absolute():
            self.root = (yaml_path.parent / self.root).resolve()
        split_value = config.get(split)
        if split_value is None and split == "val":
            split_value = config.get("valid")
        if split_value is None:
            raise ValueError(f"data.yaml does not define the '{split}' split")
        self.images = _split_paths(self.root, split_value)
        self.names = _class_names(config.get("names"))
        if not self.images:
            raise ValueError(f"No images found for split '{split}'")
        missing = [path for path in self.images if not _label_path(self.root, path).exists()]
        if missing:
            sample = ", ".join(path.name for path in missing[:5])
            raise ValueError(
                f"{len(missing)} images in '{split}' have no YOLO label file. Examples: {sample}"
            )

    def __len__(self) -> int:
        return len(self.images)

    def __getitem__(self, index: int):
        image_path = self.images[index]
        image = Image.open(image_path).convert("RGB")
        width, height = image.size
        boxes: list[list[float]] = []
        labels: list[int] = []

        label_path = _label_path(self.root, image_path)
        for line_number, line in enumerate(label_path.read_text(encoding="utf-8").splitlines(), start=1):
            if not line.strip():
                continue
            parts = line.split()
            if len(parts) != 5:
                raise ValueError(f"Invalid YOLO label at {label_path}:{line_number}")
            class_id = int(parts[0])
            center_x, center_y, box_width, box_height = map(float, parts[1:])
            if class_id < 0 or class_id >= len(self.names):
                raise ValueError(f"Class {class_id} is not present in data.yaml ({label_path})")
            x1 = max(0.0, (center_x - box_width / 2) * width)
            y1 = max(0.0, (center_y - box_height / 2) * height)
            x2 = min(float(width), (center_x + box_width / 2) * width)
            y2 = min(float(height), (center_y + box_height / 2) * height)
            if x2 <= x1 or y2 <= y1:
                continue
            boxes.append([x1, y1, x2, y2])
            labels.append(class_id + 1)  # torchvision reserves class 0 for background

        boxes_tensor = torch.tensor(boxes, dtype=torch.float32).reshape(-1, 4)
        labels_tensor = torch.tensor(labels, dtype=torch.int64)
        target = {
            "boxes": boxes_tensor,
            "labels": labels_tensor,
            "image_id": torch.tensor(index, dtype=torch.int64),
            "area": (
                (boxes_tensor[:, 2] - boxes_tensor[:, 0])
                * (boxes_tensor[:, 3] - boxes_tensor[:, 1])
            ),
            "iscrowd": torch.zeros((len(boxes_tensor),), dtype=torch.int64),
        }
        return pil_to_tensor(image).float().div(255.0), target


def detection_collate(batch: Iterable):
    return tuple(zip(*batch))