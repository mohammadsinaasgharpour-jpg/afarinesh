"""Convert the source photos in `source-images/` to optimised WebP files in `public/assets/img/`.

Usage:  python -I scripts/build_images.py <source dir> <output dir>

Photos marked as AI-generated or stock on the old site are not part of the
manifest and are therefore never published.
"""
import sys
from pathlib import Path

from PIL import Image, ImageFilter, ImageOps

# output name -> (source file, widths)
# the hero sits under a dark gradient, so it tolerates stronger compression
HERO = {"wall": ("school-front-2026.jpg", [640, 960, 1280, 1920])}
HERO_QUALITY = 52
PHOTOS = {}
TEACHERS = {
    "fallahi": "IMG-20240313-WA0000.jpg",
    "yadollahi": "raees.jpg",
    "abbaslou": "IMG-20241228-WA0014-1.jpg",
    "dehbozorgi-sh": "page_001-1.jpg",
    "mirzaei": "1776075440723.jpg",
    "keshavarz": "PXL_20260415_090512513-1.jpg",
    "sadri": "IMG-20250821-WA0005.jpg",
    "mahmoudi": "1777098371260-1.jpg",
    "mohammadi": "IMG-20251116-WA0292.jpg",
    "yazdanpour": "IMG-20250913-WA0012.jpg",
    "naderi": "IMG_20260924_151814.jpg",
    "akbari": "IMG-20250429-WA0040.jpg",
    "rouhi": "8816522090626031361_140538190340308.jpg",
    "dehghan": "IMG_6581.jpg",
    "moheb": "IMG-20250910-WA0014.jpg",
    "attarzadeh": "IMG-20251114-WA0139.jpg",
    "ebrahimi": "IMG-20250919-WA0002-1.jpg",
    "dehbozorgi-a": "PXL_20260415_090323959.jpg",
    "rabiei": "IMG-20251114-WA0147-1.jpg",
    "jafarian": "IMG-20240314-WA0006.jpg",
    "ghezelbash": "IMG_20250402_082658_014.jpg",
    "abbasi": "IMG_20230608_195211_194-Copy.jpg",
    "zarepour": "zaree.jpg",
    "shokouhi": "IMG_20251229_152956_266-1.jpg",
    "alizadeh": "alizadehh.jpg",
    "mahboudi": "IMG-20250910-WA0011.jpg",
    "jamei": "IMG-20250605-WA0017.jpg",
    "ardeshirzadeh": "MX-M502N_20201128_125733_005.jpg",
    "mokhtari": "PXL_20260623_0656270932-2.jpg",
    "ghasemi": "IMG_20230901_115107_666-1.jpg",
}


def save_widths(img: Image.Image, out: Path, name: str, widths: list[int], quality=78):
    for w in widths:
        im = img if img.width <= w else img.resize((w, round(img.height * w / img.width)), Image.LANCZOS)
        im.save(out / f"{name}-{w}.webp", "WEBP", quality=quality, method=6)


def portrait(img: Image.Image, size=400) -> Image.Image:
    # square crop biased toward the top, where faces are
    return ImageOps.fit(img, (size, size), Image.LANCZOS, centering=(0.5, 0.3))


def logo_mark(src: Path, out: Path):
    """The school's real logo: cut the emblem from the original JPEG, enlarge it 3x and make the white transparent."""
    img = Image.open(src).convert("RGB")
    mark = img.crop((288, 0, img.width, img.height))
    mark = mark.resize((mark.width * 3, mark.height * 3), Image.LANCZOS).filter(ImageFilter.MedianFilter(3))
    mark = mark.filter(ImageFilter.UnsharpMask(radius=2, percent=60, threshold=3))
    px = []
    for r, g, b in mark.get_flattened_data():
        a = 255 - min(r, g, b)  # distance from white
        if a < 22:
            px.append((0, 0, 0, 0))
            continue
        a = min(255, int(a * 1.7))
        k = a / 255
        # un-premultiply against white so the edges keep the logo's own colours
        un = lambda c: max(0, min(255, round((c - 255 * (1 - k)) / k)))
        px.append((un(r), un(g), un(b), a))
    rgba = Image.new("RGBA", mark.size)
    rgba.putdata(px)
    rgba = rgba.crop(rgba.getbbox())
    rgba.thumbnail((384, 384), Image.LANCZOS)
    rgba.save(out / "logo-mark.webp", "WEBP", quality=92, method=6)
    small = rgba.copy()
    small.thumbnail((144, 144), Image.LANCZOS)  # 3x of the 48px header tile
    small.save(out / "logo-mark-96.webp", "WEBP", quality=92, method=6)
    for s in (32, 180, 192, 512):
        canvas = Image.new("RGBA", (s, s), (255, 255, 255, 255 if s >= 180 else 0))
        m = rgba.copy()
        m.thumbnail((int(s * 0.86), int(s * 0.86)), Image.LANCZOS)
        canvas.alpha_composite(m, ((s - m.width) // 2, (s - m.height) // 2))
        canvas.save(out / f"icon-{s}.png", optimize=True)


def main(src_dir: str, out_dir: str):
    src, out = Path(src_dir), Path(out_dir)
    (out / "team").mkdir(parents=True, exist_ok=True)
    for name, (f, widths) in HERO.items():
        # a light denoise removes night-shot sensor grain, which otherwise dominates the file size
        img = Image.open(src / f).convert("RGB").filter(ImageFilter.MedianFilter(3))
        save_widths(img, out, name, widths, quality=HERO_QUALITY)
    # phones get a portrait crop centred on the school sign and entrance.
    # ImageOps.fit keeps this robust when a new source photo has a different size.
    gate = ImageOps.fit(
        Image.open(src / HERO["wall"][0]).convert("RGB"),
        (1440, 1860),
        Image.LANCZOS,
        centering=(0.5, 0.47),
    )
    gate = gate.filter(ImageFilter.MedianFilter(3))
    gate = gate.filter(ImageFilter.UnsharpMask(radius=1.4, percent=70, threshold=2))
    save_widths(gate, out, "wall-gate", [720, 860], quality=60)
    save_widths(gate, out, "wall-gate", [1080, 1440], quality=74)
    for name, (f, widths) in PHOTOS.items():
        save_widths(Image.open(src / f).convert("RGB"), out, name, widths)
    Image.open(src / HERO["wall"][0]).convert("RGB").resize((1200, 640), Image.LANCZOS).save(
        out / "og-cover.jpg", quality=82, optimize=True, progressive=True)
    for name, f in TEACHERS.items():
        portrait(ImageOps.exif_transpose(Image.open(src / f)).convert("RGB")).save(
            out / "team" / f"{name}.webp", "WEBP", quality=76, method=6)
    logo_mark(src / "azmoon.jpeg", out)
    total = sum(p.stat().st_size for p in out.rglob("*") if p.is_file())
    print(f"done: {sum(1 for _ in out.rglob('*.webp'))} webp files, {total / 1024:.0f} KB total")


if __name__ == "__main__":
    main(*sys.argv[1:3])
