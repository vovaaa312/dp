"""
Auto-detect dataset format and convert to YOLO format.

Supported input formats:
  - YOLO (images/train, labels/train, data.yaml) — no conversion needed
  - COCO (annotations/*.json with 'images' and 'annotations' keys)
  - Pascal VOC (Annotations/*.xml)
  - Flat (images + labels mixed or in simple folders, no train/val split)
"""
from __future__ import annotations

import json
import os
import random
import shutil
import xml.etree.ElementTree as ET
from pathlib import Path
from typing import Optional

import yaml


def detect_and_convert(dataset_dir: str) -> str:
    """
    Detect dataset format and convert to YOLO if needed.
    Returns path to the YOLO-compatible data.yaml file.
    """
    p = Path(dataset_dir)

    fmt = _detect_format(p)
    if fmt == "yolo":
        return _ensure_yaml(p)
    elif fmt == "coco":
        return _convert_coco(p)
    elif fmt == "voc":
        return _convert_voc(p)
    elif fmt == "flat":
        return _convert_flat(p)
    else:
        raise ValueError(f"Could not detect dataset format in {dataset_dir}")


def _detect_format(p: Path) -> str:
    """Detect dataset format by examining directory contents."""
    # Check for existing YOLO yaml
    yamls = [f for f in p.glob("*.yaml") if f.name != "_patched_data.yaml"]
    yamls += list(p.glob("*.yml"))
    if yamls and (p / "images").is_dir():
        return "yolo"

    # COCO: look for JSON with "images" and "annotations" keys
    for json_file in p.rglob("*.json"):
        try:
            with open(json_file) as f:
                data = json.load(f)
            if isinstance(data, dict) and "images" in data and "annotations" in data:
                return "coco"
        except (json.JSONDecodeError, UnicodeDecodeError):
            continue

    # VOC: look for XML annotations
    xml_files = list(p.rglob("*.xml"))
    if xml_files:
        # Verify at least one looks like VOC
        for xf in xml_files[:3]:
            try:
                tree = ET.parse(xf)
                root = tree.getroot()
                if root.tag == "annotation" and root.find("object") is not None:
                    return "voc"
            except ET.ParseError:
                continue

    # Flat: images and txt labels in same or parallel dirs
    images = _find_images(p)
    labels = list(p.rglob("*.txt"))
    if images and labels:
        return "flat"

    # If only images exist with yaml, treat as yolo
    if yamls:
        return "yolo"

    # Last resort: if images exist, treat as flat
    if images:
        return "flat"

    raise ValueError(f"Cannot detect format: no images/labels/annotations found in {p}")


def _find_images(p: Path) -> list[Path]:
    exts = {".jpg", ".jpeg", ".png", ".bmp", ".webp", ".tiff", ".tif"}
    return [f for f in p.rglob("*") if f.suffix.lower() in exts]


def _ensure_yaml(p: Path) -> str:
    """For YOLO format datasets, just return path to yaml."""
    yamls = [f for f in p.glob("*.yaml") if f.name != "_patched_data.yaml"]
    yamls += [f for f in p.glob("*.yml") if f.name != "_patched_data.yaml"]
    if yamls:
        return str(yamls[0])
    # Generate yaml if images/labels structure exists but no yaml
    return _generate_yolo_yaml(p)


def _convert_coco(p: Path) -> str:
    """Convert COCO format to YOLO."""
    # Find the COCO JSON
    coco_file = None
    for json_file in p.rglob("*.json"):
        try:
            with open(json_file) as f:
                data = json.load(f)
            if isinstance(data, dict) and "images" in data and "annotations" in data:
                coco_file = json_file
                break
        except (json.JSONDecodeError, UnicodeDecodeError):
            continue

    if coco_file is None:
        raise ValueError("No COCO JSON found")

    with open(coco_file) as f:
        coco = json.load(f)

    # Validate COCO structure
    if not isinstance(coco, dict):
        raise ValueError("COCO JSON root is not a dict")

    images = coco.get("images")
    annotations = coco.get("annotations")

    if images is None or annotations is None:
        raise ValueError(f"COCO JSON missing required fields: images={images is not None}, annotations={annotations is not None}")

    if not isinstance(images, list) or not isinstance(annotations, list):
        raise ValueError(f"COCO JSON fields have wrong type: images={type(images).__name__}, annotations={type(annotations).__name__}")

    # Build category mapping
    categories_list = coco.get("categories", [])
    if not isinstance(categories_list, list):
        raise ValueError(f"COCO 'categories' has wrong type: {type(categories_list).__name__}")

    categories = {}
    for cat in categories_list:
        if not isinstance(cat, dict) or "id" not in cat or "name" not in cat:
            continue
        categories[cat["id"]] = cat["name"]

    cat_ids = sorted(categories.keys())
    cat_to_idx = {cid: idx for idx, cid in enumerate(cat_ids)}
    class_names = [categories[cid] for cid in cat_ids]

    # Build image info
    images_info = {}
    for img in images:
        if isinstance(img, dict) and "id" in img:
            images_info[img["id"]] = img

    # Group annotations by image
    ann_by_image: dict[int, list] = {}
    for ann in annotations:
        if not isinstance(ann, dict) or "image_id" not in ann:
            continue
        img_id = ann["image_id"]
        if img_id is not None:
            ann_by_image.setdefault(img_id, []).append(ann)

    # Create YOLO structure
    images_dir = p / "images" / "train"
    labels_dir = p / "labels" / "train"
    images_dir.mkdir(parents=True, exist_ok=True)
    labels_dir.mkdir(parents=True, exist_ok=True)

    # Find where source images are
    src_images_dir = _find_images_source_dir(p, coco_file)

    for img_id, img_info in images_info.items():
        if not isinstance(img_info, dict) or "file_name" not in img_info:
            continue

        fname = img_info.get("file_name")
        w = img_info.get("width")
        h = img_info.get("height")

        if not fname or not w or not h:
            continue

        # Copy image to images/train/
        src = src_images_dir / fname
        if not src.exists():
            src = src_images_dir / Path(fname).name
        if src.exists():
            dst = images_dir / Path(fname).name
            if not dst.exists():
                shutil.copy2(src, dst)

        # Convert annotations to YOLO format
        anns = ann_by_image.get(img_id, [])
        label_file = labels_dir / (Path(fname).stem + ".txt")
        lines = []
        for ann in anns:
            if not isinstance(ann, dict):
                continue
            bbox = ann.get("bbox")
            cat_id = ann.get("category_id")
            if not bbox or cat_id is None:
                continue
            if not isinstance(bbox, (list, tuple)) or len(bbox) < 4:
                continue
            try:
                cls_idx = cat_to_idx.get(cat_id, 0)
                # Convert to YOLO: cx, cy, w, h (normalized)
                cx = (bbox[0] + bbox[2] / 2) / w
                cy = (bbox[1] + bbox[3] / 2) / h
                bw = bbox[2] / w
                bh = bbox[3] / h
                lines.append(f"{cls_idx} {cx:.6f} {cy:.6f} {bw:.6f} {bh:.6f}")
            except (TypeError, ValueError, ZeroDivisionError):
                continue
        label_file.write_text("\n".join(lines) + "\n" if lines else "")

    # Create train/val split (80/20)
    _create_val_split(images_dir, labels_dir, p)

    return _generate_yolo_yaml(p, class_names)


def _convert_voc(p: Path) -> str:
    """Convert Pascal VOC format to YOLO."""
    xml_files = list(p.rglob("*.xml"))
    voc_xmls = []
    for xf in xml_files:
        try:
            tree = ET.parse(xf)
            root = tree.getroot()
            if root.tag == "annotation":
                voc_xmls.append(xf)
        except ET.ParseError:
            continue

    if not voc_xmls:
        raise ValueError("No VOC XML annotations found")

    # Collect all class names
    class_set: set[str] = set()
    for xf in voc_xmls:
        tree = ET.parse(xf)
        for obj in tree.getroot().findall("object"):
            name_el = obj.find("name")
            if name_el is not None and name_el.text:
                class_set.add(name_el.text)
    class_names = sorted(class_set)
    class_to_idx = {name: idx for idx, name in enumerate(class_names)}

    images_dir = p / "images" / "train"
    labels_dir = p / "labels" / "train"
    images_dir.mkdir(parents=True, exist_ok=True)
    labels_dir.mkdir(parents=True, exist_ok=True)

    for xf in voc_xmls:
        tree = ET.parse(xf)
        root = tree.getroot()

        fname_el = root.find("filename")
        fname = fname_el.text if fname_el is not None else (xf.stem + ".jpg")

        size_el = root.find("size")
        if size_el is None:
            continue
        w = int(size_el.findtext("width", "0"))
        h = int(size_el.findtext("height", "0"))
        if w == 0 or h == 0:
            continue

        # Find and copy image
        src = _find_image_file(p, fname)
        if src and src.exists():
            dst = images_dir / Path(fname).name
            if not dst.exists():
                shutil.copy2(src, dst)

        # Convert to YOLO
        lines = []
        for obj in root.findall("object"):
            name_el = obj.find("name")
            if name_el is None or name_el.text is None:
                continue
            cls_idx = class_to_idx.get(name_el.text, 0)

            bndbox = obj.find("bndbox")
            if bndbox is None:
                continue
            xmin = float(bndbox.findtext("xmin", "0"))
            ymin = float(bndbox.findtext("ymin", "0"))
            xmax = float(bndbox.findtext("xmax", "0"))
            ymax = float(bndbox.findtext("ymax", "0"))

            cx = (xmin + xmax) / 2 / w
            cy = (ymin + ymax) / 2 / h
            bw = (xmax - xmin) / w
            bh = (ymax - ymin) / h
            lines.append(f"{cls_idx} {cx:.6f} {cy:.6f} {bw:.6f} {bh:.6f}")

        label_file = labels_dir / (Path(fname).stem + ".txt")
        label_file.write_text("\n".join(lines) + "\n" if lines else "")

    _create_val_split(images_dir, labels_dir, p)
    return _generate_yolo_yaml(p, class_names)


def _convert_flat(p: Path) -> str:
    """Convert flat dataset (images + labels in same or parallel dirs) to YOLO structure."""
    images = _find_images(p)

    # Find corresponding labels
    class_names: Optional[list[str]] = None
    images_dir = p / "images" / "train"
    labels_dir = p / "labels" / "train"
    images_dir.mkdir(parents=True, exist_ok=True)
    labels_dir.mkdir(parents=True, exist_ok=True)

    for img in images:
        # Skip images already in images/train or images/val
        if "images/train" in str(img) or "images/val" in str(img):
            continue

        dst = images_dir / img.name
        if not dst.exists():
            shutil.copy2(img, dst)

        # Find corresponding label
        label = _find_label_for_image(p, img)
        if label:
            dst_label = labels_dir / (img.stem + ".txt")
            if not dst_label.exists():
                shutil.copy2(label, dst_label)

    _create_val_split(images_dir, labels_dir, p)
    return _generate_yolo_yaml(p, class_names)


def _find_images_source_dir(p: Path, coco_json: Path) -> Path:
    """Find where COCO images are stored relative to the JSON file."""
    # Common patterns: images/ next to JSON, or same directory
    candidates = [
        coco_json.parent / "images",
        coco_json.parent,
        p / "images",
        p,
    ]
    for d in candidates:
        if d.is_dir() and any(d.iterdir()):
            return d
    return p


def _find_image_file(p: Path, filename: str) -> Optional[Path]:
    """Search for image file in the dataset directory."""
    # Direct path
    direct = p / filename
    if direct.exists():
        return direct
    # Search recursively
    for f in p.rglob(Path(filename).name):
        if f.suffix.lower() in {".jpg", ".jpeg", ".png", ".bmp", ".webp"}:
            return f
    return None


def _find_label_for_image(p: Path, img: Path) -> Optional[Path]:
    """Find a YOLO .txt label file corresponding to an image."""
    # Same directory
    label = img.with_suffix(".txt")
    if label.exists():
        return label
    # labels/ parallel to images/
    if "images" in img.parts:
        parts = list(img.parts)
        idx = parts.index("images")
        parts[idx] = "labels"
        label = Path(*parts).with_suffix(".txt")
        if label.exists():
            return label
    # Search in dataset root
    for f in p.rglob(img.stem + ".txt"):
        return f
    return None


def _create_val_split(images_dir: Path, labels_dir: Path, p: Path, val_ratio: float = 0.2) -> None:
    """Split train into train/val sets."""
    val_images_dir = p / "images" / "val"
    val_labels_dir = p / "labels" / "val"

    if val_images_dir.exists() and any(val_images_dir.iterdir()):
        return  # val split already exists

    val_images_dir.mkdir(parents=True, exist_ok=True)
    val_labels_dir.mkdir(parents=True, exist_ok=True)

    all_images = list(images_dir.glob("*"))
    all_images = [f for f in all_images if f.suffix.lower() in {".jpg", ".jpeg", ".png", ".bmp", ".webp"}]

    if len(all_images) < 5:
        return  # too few images to split

    random.seed(42)
    random.shuffle(all_images)
    n_val = max(1, int(len(all_images) * val_ratio))

    for img in all_images[:n_val]:
        shutil.move(str(img), str(val_images_dir / img.name))
        label = labels_dir / (img.stem + ".txt")
        if label.exists():
            shutil.move(str(label), str(val_labels_dir / label.name))


def _generate_yolo_yaml(p: Path, class_names: Optional[list[str]] = None) -> str:
    """Generate a data.yaml for YOLO training."""
    if class_names is None:
        # Try to infer from existing labels
        class_names = _infer_classes_from_labels(p)

    cfg = {
        "path": str(p.resolve()),
        "train": "images/train",
        "val": "images/val",
        "nc": len(class_names) if class_names else 1,
        "names": class_names if class_names else ["object"],
    }

    yaml_path = p / "data.yaml"
    with open(yaml_path, "w") as f:
        yaml.dump(cfg, f, default_flow_style=False)

    return str(yaml_path)


def _infer_classes_from_labels(p: Path) -> list[str]:
    """Read YOLO labels to find max class index, return generic names."""
    max_cls = -1
    for txt in p.rglob("*.txt"):
        try:
            for line in txt.read_text().strip().split("\n"):
                parts = line.strip().split()
                if len(parts) >= 5:
                    cls = int(parts[0])
                    max_cls = max(max_cls, cls)
        except (ValueError, UnicodeDecodeError):
            continue

    if max_cls < 0:
        return ["object"]
    return [f"class_{i}" for i in range(max_cls + 1)]
