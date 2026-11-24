"""app.py - FastAPI backend. Run:  uvicorn app:app --reload"""
import io, json, re, shutil, zipfile
from datetime import date
from pathlib import Path
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from PIL import Image
import model

ROOT = Path(__file__).parent
IMG_DIR, ANN_DIR = ROOT / "dataset/images", ROOT / "dataset/annotations"
STAGE, EXPORT, LABELS = ROOT / "_staging", ROOT / "exports", ROOT / "labels.json"
DOWNLOAD_DIR = ROOT / "annotations"   # separate folder for downloaded per-image JSONs
for d in (IMG_DIR, ANN_DIR, STAGE, EXPORT, DOWNLOAD_DIR):
    d.mkdir(parents=True, exist_ok=True)

app = FastAPI(title="Palm-leaf annotator")


def safe_name(fn):
    return (re.sub(r"[^\w\-]+", "_", Path(fn or "image").stem).strip("_") or "image") + ".jpg"


def read_labels():
    raw = json.loads(LABELS.read_text("utf-8")) if LABELS.exists() else []
    return sorted(raw, key=lambda x: x)


# ---------------------------------------------------------------- predict
@app.post("/predict")
def predict(file: UploadFile = File(...), rerun: bool = Form(False)):
    data = file.file.read()
    try:
        im = Image.open(io.BytesIO(data)); fmt = im.format; im.load()
    except Exception:
        raise HTTPException(400, "Not a valid image. Please upload a .jpg or .png file.")
    if fmt not in ("JPEG", "PNG"):
        raise HTTPException(400, f"Unsupported file type ({fmt}). Use .jpg or .png.")
    im = im.convert("RGB"); W, H = im.size
    name = safe_name(file.filename)
    if fmt == "JPEG":                                   # stage image; copied to dataset on Save
        (STAGE / name).write_bytes(data)
    else:
        im.save(STAGE / name, quality=95)

    jf = ANN_DIR / (Path(name).stem + ".json")
    if jf.exists() and not rerun:                       # already annotated -> load, skip model
        d = json.loads(jf.read_text("utf-8"))
        anns = [{"bbox": a["bbox"], "label": a["label"], "source": a["source"],
                 "confidence": a.get("confidence")} for a in d["annotations"]]
        return {"name": name, "width": W, "height": H, "loaded": True, "annotations": anns, "warning": None}

    warning, preds = None, []
    if not model.available():
        warning = "weights/best.pt not found - running as a plain manual annotator."
    else:
        try:
            preds = model.predict(im)
        except Exception as e:
            warning = f"Model failed ({e}). You can still annotate manually."
    return {"name": name, "width": W, "height": H, "loaded": False, "warning": warning,
            "annotations": [{**p, "source": "model"} for p in preds]}


# ---------------------------------------------------------------- save
class Ann(BaseModel):
    bbox: list[float]
    label: str = ""
    source: str = "manual"
    confidence: float | None = None


class SaveReq(BaseModel):
    name: str
    width: int
    height: int
    annotations: list[Ann]


@app.post("/save")
def save(req: SaveReq):
    name = Path(req.name).name
    dst = IMG_DIR / name
    try:
        if not dst.exists():
            if not (STAGE / name).exists():
                raise HTTPException(400, "Image not found on server. Re-open the image, then save.")
            shutil.copy(STAGE / name, dst)
        W, H, rows = req.width, req.height, []
        for a in req.annotations:
            x, y, w, h = (round(v) for v in a.bbox)
            x, y = min(max(x, 0), W - 1), min(max(y, 0), H - 1)
            w, h = min(max(w, 1), W - x), min(max(h, 1), H - y)
            src = a.source if a.source in ("model", "edited", "manual") else "manual"
            rows.append((y, x, w, h, a.label, src, a.confidence))
        rows.sort(key=lambda r: (r[0], r[1]))            # top-to-bottom, then left-to-right
        anns = []
        for i, (y, x, w, h, lab, src, conf) in enumerate(rows, 1):
            e = {"id": i, "bbox": [x, y, w, h], "label": lab, "source": src}
            if src == "model" and conf is not None:      # confidence only for untouched predictions
                e["confidence"] = round(conf, 2)
            anns.append(e)
        out = {"image": name, "width": W, "height": H, "bbox_format": "[x, y, width, height]", "annotations": anns}
        text = json.dumps(out, ensure_ascii=False, indent=2)
        text = re.sub(r'"bbox": \[\s+(\d+),\s+(\d+),\s+(\d+),\s+(\d+)\s+\]', r'"bbox": [\1, \2, \3, \4]', text)
        jf = ANN_DIR / (Path(name).stem + ".json")
        tmp = jf.with_suffix(".tmp"); tmp.write_text(text, "utf-8"); tmp.replace(jf)
    except HTTPException:
        raise
    except OSError as e:
        raise HTTPException(500, f"Could not write files: {e}")
    return {"saved": str(jf.relative_to(ROOT)), "count": len(anns)}


# ---------------------------------------------------------------- labels
class LabelReq(BaseModel):
    label: str


@app.get("/labels")
def get_labels():
    return read_labels()


@app.post("/labels")
def add_label(req: LabelReq):
    lab, labels = req.label.strip(), read_labels()
    if not lab:
        raise HTTPException(400, "Empty label.")
    if lab not in labels:
        labels.append(lab)
        labels = sorted(labels, key=lambda x: x)   # keep sorted
        LABELS.write_text(json.dumps(labels, ensure_ascii=False, indent=1), "utf-8")
    return labels


# ---------------------------------------------------------------- export all
@app.get("/export")
def export_all():
    files = sorted(ANN_DIR.glob("*.json"))
    if not files:
        raise HTTPException(400, "Nothing to export yet - save at least one image.")
    images, anns, folders, cid = [], [], {}, 0
    try:
        with zipfile.ZipFile(EXPORT / "crops_all_labeled.zip", "w", zipfile.ZIP_DEFLATED) as z:
            for i, jf in enumerate(files, 1):
                d = json.loads(jf.read_text("utf-8"))
                images.append({"id": i, "file_name": d["image"]})
                ip = IMG_DIR / d["image"]
                im = Image.open(ip).convert("RGB") if ip.exists() else None
                for a in d["annotations"]:
                    cid += 1
                    x, y, w, h = a["bbox"]; lab = a["label"]
                    anns.append({"id": cid, "image_id": i, "file_name": d["image"], "category_id": 1,
                                 "bbox": a["bbox"], "area": w * h, "label": lab, "iscrowd": 0, "source": a["source"]})
                    folder = re.sub(r'[\\/:*?"<>|]', "_", lab) or "unlabeled"
                    folders.setdefault(lab or "unlabeled", []).append(cid)
                    if im:
                        buf = io.BytesIO(); im.crop((x, y, x + w, y + h)).save(buf, "PNG")
                        z.writestr(f"crops/{folder}/{Path(d['image']).stem}_x{x}_y{y}_w{w}_h{h}.png", buf.getvalue())
        merged = {"info": {"description": "Palm-Leaf Tamil Character Dataset", "version": "1.0",
                           "date_created": str(date.today()), "contributor": "Palm-Leaf Annotator"},
                  "licenses": [], "images": images, "annotations": anns,
                  "categories": [{"id": 1, "name": "character", "supercategory": "palm_leaf"}],
                  "folders": [{"folder_label": k, "crop_ids": v} for k, v in folders.items()]}
        (EXPORT / "merged_dataset.json").write_text(json.dumps(merged, ensure_ascii=False), "utf-8")
    except OSError as e:
        raise HTTPException(500, f"Export failed: {e}")
    return {"json": "/exports/merged_dataset.json", "zip": "/exports/crops_all_labeled.zip",
            "images": len(images), "boxes": len(anns)}


# ---------------------------------------------------------------- download per-image JSON
@app.post("/download_json")
def download_json(payload: dict):
    """Save the merged-format JSON for one image into annotations/ folder."""
    try:
        DOWNLOAD_DIR.mkdir(parents=True, exist_ok=True)
        imgs = payload.get("images", [])
        fname = imgs[0]["file_name"] if imgs else "unknown"
        stem = Path(fname).stem
        out_path = DOWNLOAD_DIR / f"{stem}.json"
        text = json.dumps(payload, ensure_ascii=False, indent=2)
        tmp = out_path.with_suffix(".tmp")
        tmp.write_text(text, "utf-8")
        tmp.replace(out_path)
    except (IndexError, KeyError, OSError) as e:
        raise HTTPException(500, f"Could not save JSON: {e}")
    return {"saved": str(out_path.relative_to(ROOT)), "file": stem + ".json"}


@app.get("/")
def index():
    return FileResponse(ROOT / "static/index.html")


app.mount("/exports", StaticFiles(directory=EXPORT), name="exports")
app.mount("/static", StaticFiles(directory=ROOT / "static"), name="static")
