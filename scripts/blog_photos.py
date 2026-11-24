"""Turns the photos made for the blog (content/blog-images/<slug>.png|jpg|webp) into the article covers.

Usage:  python -I scripts/blog_photos.py <repo root>

Each photo is cropped to 16:9 from its centre and written as public/assets/img/blog/<slug>-1280.webp and
-640.webp, replacing the drawn cover, with the school's credit in its metadata. A cover newer than its
photo is left alone, so re-running only converts new or replaced photos. Run it before blog_covers.py,
which draws a cover only for articles that still have none.
"""
import json
import re
import sys
from pathlib import Path

from PIL import Image, ImageOps

sys.path.insert(0, str(Path(__file__).resolve().parent))
from image_meta import add_xmp, xmp  # noqa: E402


def main(root: str) -> None:
    root = Path(root)
    src, out = root / "content/blog-images", root / "public/assets/img/blog"
    out.mkdir(parents=True, exist_ok=True)
    made = 0
    for f in sorted(src.glob("*")):
        if f.suffix.lower() not in (".png", ".jpg", ".jpeg", ".webp"):
            continue
        article = root / "content/blog" / f"{f.stem}.html"
        if not article.exists():
            print(f"skipped {f.name}: no article named {f.stem}")
            continue
        big, small = out / f"{f.stem}-1280.webp", out / f"{f.stem}-640.webp"
        if big.exists() and big.stat().st_mtime > f.stat().st_mtime:
            continue
        meta = json.loads(re.match(r"<!--meta\s*([\s\S]*?)-->", article.read_text(encoding="utf-8")).group(1))
        img = ImageOps.fit(ImageOps.exif_transpose(Image.open(f)).convert("RGB"), (1280, 720), Image.LANCZOS)
        img.save(big, "WEBP", quality=80, method=6)
        img.resize((640, 360), Image.LANCZOS).save(small, "WEBP", quality=78, method=6)
        caption = f"تصویر مطلب «{meta.get('short') or meta['title']}» در وبلاگ دبیرستان آفرینش شیراز"
        for p in (big, small):
            add_xmp(p, xmp(caption, "Afarinesh High School, Shiraz: blog photo"))
        made += 1
    print(f"converted {made} blog photos")


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else ".")
