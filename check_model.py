import torch, json
from PIL import Image
from pathlib import Path
from ultralytics import YOLO

m = YOLO('weights/best.pt')
# Pick the first image in dataset/images if any
imgs = list(Path('dataset/images').glob('*.jpg')) + list(Path('_staging').glob('*.jpg'))
if not imgs:
    print("No images found to test. Put a .jpg in dataset/images/")
else:
    img = Image.open(imgs[0]).convert('RGB')
    imgsz = (max(img.size) + 31) // 32 * 32
    r = m.predict(img, imgsz=imgsz, conf=0.15, max_det=20, verbose=False)[0]
    print(f"Image: {imgs[0].name}  ({img.size[0]}x{img.size[1]})")
    print(f"Predictions: {len(r.boxes)}")
    for i, (xyxy, c, k) in enumerate(zip(r.boxes.xyxy.tolist(), r.boxes.conf.tolist(), r.boxes.cls.tolist())):
        name = r.names[int(k)]
        print(f"  [{i}] class={int(k)} name=\"{name}\" conf={c:.3f} bbox={[round(v) for v in xyxy]}")
        if i >= 15:
            print(f"  ... and {len(r.boxes) - 16} more")
            break
