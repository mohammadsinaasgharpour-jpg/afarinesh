"""Draws a cover illustration for every blog article, in the school's colours, from code (no stock photos).

Usage:  python -I scripts/blog_covers.py <repo root>

Each article in content/blog/ gets public/assets/img/blog/<slug>-1280.webp and -640.webp. The picture is
made of the article's category motif (a building, a form, a book, a family, a heart, a gear and bulb) on a
background of shapes whose layout comes from the slug, so every cover is different but the set looks like one
family. A cover that already exists is left alone, so re-running only draws the new articles.
"""
import hashlib
import json
import math
import random
import re
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

W, H, S = 1280, 720, 2  # drawn at twice the size, then reduced: smooth edges

NAVY, SUN, SKY, BRICK, PALE, CREAM, WHITE = "#0e2a3f", "#f2a516", "#16789c", "#c6382c", "#d4e9f5", "#fff4dc", "#ffffff"
PALETTES = {
    "school": (SKY, "#0f5f7d", SUN, WHITE),
    "enrol": (SUN, "#e08e0b", NAVY, WHITE),
    "study": (NAVY, "#173a55", SUN, PALE),
    "family": (BRICK, "#a92d22", SUN, CREAM),
    "health": ("#2f8f6b", "#226b50", SUN, CREAM),
    "skills": ("#3b3f8f", "#2a2d6e", SUN, PALE),
}


def hexrgb(h, a=255):
    h = h.lstrip("#")
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4)) + (a,)


def gradient(c1, c2):
    top, bottom = hexrgb(c1), hexrgb(c2)
    g = Image.new("RGB", (1, 2))
    g.putpixel((0, 0), top[:3])
    g.putpixel((0, 1), bottom[:3])
    # an RGB canvas: shapes drawn with an alpha value blend into it instead of replacing it
    return g.resize((W * S, H * S), Image.BILINEAR)


def k(v):
    return int(v * S)


def backdrop(img, rnd, accent, light):
    d = ImageDraw.Draw(img, "RGBA")
    # big soft circles
    for _ in range(3):
        r = rnd.randint(120, 260)
        x, y = rnd.randint(-100, W + 100), rnd.randint(-100, H + 100)
        d.ellipse([k(x - r), k(y - r), k(x + r), k(y + r)], fill=hexrgb(light, 34))
    # a ring
    r = rnd.randint(90, 160)
    x, y = rnd.randint(780, 1180), rnd.randint(80, 640)
    d.ellipse([k(x - r), k(y - r), k(x + r), k(y + r)], outline=hexrgb(accent, 200), width=k(14))
    # a dot grid
    gx, gy = rnd.randint(60, 360), rnd.randint(60, 500)
    for i in range(6):
        for j in range(4):
            cx, cy = gx + i * 26, gy + j * 26
            d.ellipse([k(cx - 4), k(cy - 4), k(cx + 4), k(cy + 4)], fill=hexrgb(light, 120))
    # diagonal stripes in a corner
    for i in range(5):
        off = i * 30
        d.line([k(W - 260 + off), k(H), k(W + off), k(H - 260)], fill=hexrgb(accent, 90), width=k(10))
    # small confetti squares
    for _ in range(7):
        s = rnd.randint(14, 26)
        x, y = rnd.randint(40, W - 40), rnd.randint(40, H - 40)
        d.rounded_rectangle([k(x), k(y), k(x + s), k(y + s)], radius=k(4), fill=hexrgb(rnd.choice([accent, light]), 170))


def shadow(img, box, radius):
    mask = Image.new("L", img.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle([k(box[0] + 14), k(box[1] + 18), k(box[2] + 14), k(box[3] + 18)], radius=k(radius), fill=70)
    img.paste((0, 0, 0), mask=mask.filter(ImageFilter.GaussianBlur(k(14))))


def motif(img, cat, cx, cy, accent, light):
    d = ImageDraw.Draw(img, "RGBA")
    if cat == "school":
        shadow(img, (cx - 230, cy - 60, cx + 230, cy + 200), 18)
        d.rounded_rectangle([k(cx - 230), k(cy - 60), k(cx + 230), k(cy + 200)], radius=k(18), fill=hexrgb(light))
        d.polygon([(k(cx - 260), k(cy - 50)), (k(cx), k(cy - 210)), (k(cx + 260), k(cy - 50))], fill=hexrgb(accent))
        d.ellipse([k(cx - 34), k(cy - 150), k(cx + 34), k(cy - 82)], fill=hexrgb(light))
        for i in range(4):
            for j in range(2):
                x, y = cx - 190 + i * 100, cy - 20 + j * 90
                d.rounded_rectangle([k(x), k(y), k(x + 60), k(y + 56)], radius=k(8), fill=hexrgb(SKY if j else NAVY))
        d.rounded_rectangle([k(cx - 40), k(cy + 110), k(cx + 40), k(cy + 200)], radius=k(10), fill=hexrgb(BRICK))
    elif cat == "enrol":
        shadow(img, (cx - 170, cy - 210, cx + 170, cy + 210), 22)
        d.rounded_rectangle([k(cx - 170), k(cy - 210), k(cx + 170), k(cy + 210)], radius=k(22), fill=hexrgb(light))
        d.rounded_rectangle([k(cx - 70), k(cy - 236), k(cx + 70), k(cy - 186)], radius=k(14), fill=hexrgb(accent))
        for i in range(4):
            y = cy - 130 + i * 82
            d.rounded_rectangle([k(cx - 120), k(y), k(cx - 76), k(y + 44)], radius=k(10), fill=hexrgb(SKY if i < 3 else PALE))
            if i < 3:
                d.line([(k(cx - 110), k(y + 22)), (k(cx - 100), k(y + 34)), (k(cx - 84), k(y + 10))], fill=hexrgb(WHITE), width=k(7), joint="curve")
            d.rounded_rectangle([k(cx - 56), k(y + 10), k(cx + 120 - i * 18), k(y + 32)], radius=k(11), fill=hexrgb(NAVY, 200))
    elif cat == "study":
        shadow(img, (cx - 260, cy - 130, cx + 260, cy + 150), 16)
        d.polygon([(k(cx), k(cy - 110)), (k(cx - 250), k(cy - 150)), (k(cx - 250), k(cy + 130)), (k(cx), k(cy + 160))], fill=hexrgb(light))
        d.polygon([(k(cx), k(cy - 110)), (k(cx + 250), k(cy - 150)), (k(cx + 250), k(cy + 130)), (k(cx), k(cy + 160))], fill=hexrgb(WHITE))
        for i in range(6):
            y = cy - 90 + i * 36
            d.line([k(cx - 220), k(y - 20 + i * 2), k(cx - 30), k(y)], fill=hexrgb(NAVY, 120), width=k(6))
            d.line([k(cx + 30), k(y), k(cx + 220), k(y - 20 + i * 2)], fill=hexrgb(NAVY, 120), width=k(6))
        d.line([k(cx), k(cy - 110), k(cx), k(cy + 160)], fill=hexrgb(NAVY, 160), width=k(4))
        # pencil
        px, py = cx + 150, cy - 190
        d.polygon([(k(px), k(py)), (k(px + 34), k(py - 20)), (k(px + 150), k(py + 180)), (k(px + 116), k(py + 200))], fill=hexrgb(accent))
        d.polygon([(k(px + 116), k(py + 200)), (k(px + 150), k(py + 180)), (k(px + 150), k(py + 240))], fill=hexrgb(CREAM))
    elif cat == "family":
        for dx, r, col in ((-150, 92, light), (150, 92, WHITE), (0, 66, accent)):
            hx, hy = cx + dx, cy - (90 if r > 70 else 10)
            body_top = hy + r + 10
            shadow(img, (hx - r - 20, body_top, hx + r + 20, body_top + r * 2), 60)
            d.rounded_rectangle([k(hx - r - 20), k(body_top), k(hx + r + 20), k(body_top + r * 2)], radius=k(r), fill=hexrgb(col))
            d.ellipse([k(hx - r * .7), k(hy - r * .7), k(hx + r * .7), k(hy + r * .7)], fill=hexrgb(col))
        d.ellipse([k(cx - 24), k(cy - 300), k(cx + 24), k(cy - 252)], fill=hexrgb(accent))
    elif cat == "health":
        r = 105
        shadow(img, (cx - 150, cy - 130, cx + 150, cy + 110), 120)
        d.ellipse([k(cx - 2 * r), k(cy - 1.6 * r), k(cx), k(cy + .4 * r)], fill=hexrgb(light))
        d.ellipse([k(cx), k(cy - 1.6 * r), k(cx + 2 * r), k(cy + .4 * r)], fill=hexrgb(light))
        d.polygon([(k(cx - 1.93 * r), k(cy - .25 * r)), (k(cx + 1.93 * r), k(cy - .25 * r)), (k(cx), k(cy + 1.85 * r))], fill=hexrgb(light))
        pts = [(cx - 260, cy), (cx - 90, cy), (cx - 50, cy - 90), (cx + 10, cy + 80), (cx + 50, cy - 30), (cx + 260, cy - 30)]
        d.line([(k(x), k(y)) for x, y in pts], fill=hexrgb(BRICK), width=k(16), joint="curve")
    else:  # skills
        gx, gy, r = cx - 110, cy + 40, 120
        for i in range(10):
            a = i * math.pi / 5
            d.rounded_rectangle([k(gx + math.cos(a) * r - 26), k(gy + math.sin(a) * r - 26), k(gx + math.cos(a) * r + 26), k(gy + math.sin(a) * r + 26)], radius=k(8), fill=hexrgb(WHITE))
        d.ellipse([k(gx - r), k(gy - r), k(gx + r), k(gy + r)], fill=hexrgb(WHITE))
        d.ellipse([k(gx - 44), k(gy - 44), k(gx + 44), k(gy + 44)], fill=hexrgb(NAVY))
        bx, by = cx + 140, cy - 80
        shadow(img, (bx - 90, by - 110, bx + 90, by + 70), 90)
        d.ellipse([k(bx - 90), k(by - 110), k(bx + 90), k(by + 70)], fill=hexrgb(accent))
        d.rounded_rectangle([k(bx - 46), k(by + 60), k(bx + 46), k(by + 130)], radius=k(12), fill=hexrgb(WHITE))
        for i in range(5):
            a = -math.pi / 2 + (i - 2) * 0.5
            d.line([k(bx + math.cos(a) * 130), k(by - 20 + math.sin(a) * 130), k(bx + math.cos(a) * 175), k(by - 20 + math.sin(a) * 175)], fill=hexrgb(accent), width=k(12))


def draw(slug, cat):
    base, deep, accent, light = PALETTES[cat]
    rnd = random.Random(int(hashlib.sha256(slug.encode()).hexdigest(), 16))
    img = gradient(base, deep)
    backdrop(img, rnd, accent, light)
    # the motif sits left of centre (the reading side of the page is on the right), nudged per article
    motif(img, cat, 430 + rnd.randint(-40, 40), 380 + rnd.randint(-20, 20), accent, light)
    return img.resize((W, H), Image.LANCZOS)


def main(root):
    root = Path(root)
    out = root / "public/assets/img/blog"
    out.mkdir(parents=True, exist_ok=True)
    made = 0
    for f in sorted((root / "content/blog").glob("*.html")):
        meta = json.loads(re.match(r"<!--meta\s*([\s\S]*?)-->", f.read_text(encoding="utf-8")).group(1))
        big, small = out / f"{f.stem}-1280.webp", out / f"{f.stem}-640.webp"
        if big.exists() and small.exists():
            continue
        img = draw(f.stem, meta["category"])
        img.save(big, "WEBP", quality=78, method=6)
        img.resize((640, 360), Image.LANCZOS).save(small, "WEBP", quality=76, method=6)
        made += 1
    print(f"drew {made} blog covers")


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else ".")
