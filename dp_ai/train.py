# train.py
import torch
from ultralytics import YOLO

if __name__ == '__main__':
    # --- Device Check ---
    if torch.cuda.is_available():
        device = 0  # GPU
        gpu_name = torch.cuda.get_device_name(0)
        print(f"🟢 Training will run on GPU: {gpu_name}")
    else:
        device = "cpu"
        print("🔴 GPU not found — training will run on CPU")
        answer = input("\n   Continue on CPU? (y/n): ").strip().lower()
        if answer != "y":
            print("Cancelled.")
            exit()

    print()

    # --- Training ---
    model = YOLO("yolov8n.pt")

    results = model.train(
        data="coco128.yaml",
        epochs=50,
        imgsz=640,
        batch=8,
        name="run_50ep",
        device=0,
        project=r"D:\учёба\Mgr\Diplomova prace\dp\dp_ai\runs\detect",
    )

    print("\n✅ Training completed!")
    print(f"Results saved to: {results.save_dir}")