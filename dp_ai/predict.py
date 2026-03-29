# predict.py
from ultralytics import YOLO

if __name__ == '__main__':
    # Load the best saved model
    model = YOLO(r"D:\учёба\Mgr\Diplomova prace\dp\dp_ai\runs\detect\run_50ep\weights\best.pt")

    # Run prediction on test images from the dataset
    results = model.predict(
        source=r"D:\учёба\Mgr\Diplomova prace\datasets\coco128\images\train2017",
        save=True,        # save images with bounding boxes
        conf=0.25,        # minimum confidence threshold (0–1)
        name="my_predict"
    )

    print("✅ Done! Images with results saved in runs/detect/my_predict/")