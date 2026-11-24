"""model.py - the ONE place that knows about the detection model.
To use another model, just rewrite predict(); keep its return format."""
from pathlib import Path
from PIL import Image

WEIGHTS = Path(__file__).parent / "weights" / "best.pt"
_model = None


def available():
    return WEIGHTS.exists()


def _load():
    global _model
    if _model is None:
        from ultralytics import YOLO      # imported late so the app starts without it
        _model = YOLO(str(WEIGHTS))
    return _model


def predict(image: Image.Image, conf: float = 0.15):
    """image -> [{"bbox":[x,y,w,h], "label":str, "confidence":float}, ...]
    Pixels are original-image pixels. Missing weights -> []."""
    if not available():
        return []
    # Trained on native-scale tiles, so run on the FULL width (rounded up to a multiple of 32)
    imgsz = (max(image.size) + 31) // 32 * 32
    r = _load().predict(image, imgsz=imgsz, conf=conf, max_det=1000, verbose=False)[0]
    out = []
    for (x1, y1, x2, y2), c, k in zip(r.boxes.xyxy.tolist(), r.boxes.conf.tolist(), r.boxes.cls.tolist()):
        name = r.names[int(k)]
        out.append({"bbox": [round(x1), round(y1), round(x2 - x1), round(y2 - y1)],
                    "label": "" if name in ("unknown", "character") else name,   # "" = needs a label
                    "confidence": round(c, 3)})
    return out
