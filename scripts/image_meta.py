"""Writes creator, copyright and a caption into the teacher and school photos as XMP (the metadata Google
Images reads for credit and copyright), without re-encoding the pictures.

Usage:  python -I scripts/image_meta.py <repo root>

A WebP file gets a VP8X header (needed before any metadata chunk) and an XMP chunk at the end. Files that
already carry XMP are left alone, so running it again changes nothing.
"""
import json
import struct
import sys
from pathlib import Path
from xml.sax.saxutils import escape

from PIL import Image

SCHOOL = "دبیرستان غیردولتی آفرینش شیراز"
EN = "Afarinesh High School, Shiraz"
SCHOOL_PHOTOS = {
    "entrance": "سردر و ورودی دبیرستان غیردولتی آفرینش شیراز",
    "yard": "حیاط دبیرستان آفرینش شیراز",
    "yard-2": "حیاط و باغچه‌های دبیرستان آفرینش شیراز",
    "garden": "باغچه‌های دبیرستان آفرینش شیراز",
    "library": "کتابخانه‌ی دبیرستان آفرینش شیراز",
    "lab-doors": "آزمایشگاه علوم، کتابخانه و دفتر نشریه‌ی دبیرستان آفرینش شیراز",
    "path": "مسیر ورودی دبیرستان آفرینش شیراز",
    "stairs": "پله‌های ساختمان دبیرستان آفرینش شیراز",
    **{f"classroom-{i}": "کلاس درس دبیرستان آفرینش شیراز" for i in range(1, 8)},
}


def xmp(title: str, title_en: str) -> bytes:
    t, te = escape(title), escape(title_en)
    return f"""<?xpacket begin="﻿" id="W5M0MpCehiHzreSzNTczkc9d"?>
<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
<rdf:Description rdf:about="" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:photoshop="http://ns.adobe.com/photoshop/1.0/" xmlns:Iptc4xmpCore="http://iptc.org/std/Iptc4xmpCore/1.0/xmlns/" xmlns:xmpRights="http://ns.adobe.com/xap/1.0/rights/">
<dc:title><rdf:Alt><rdf:li xml:lang="x-default">{t}</rdf:li><rdf:li xml:lang="en">{te}</rdf:li></rdf:Alt></dc:title>
<dc:description><rdf:Alt><rdf:li xml:lang="x-default">{t}</rdf:li><rdf:li xml:lang="en">{te}</rdf:li></rdf:Alt></dc:description>
<dc:creator><rdf:Seq><rdf:li>{SCHOOL}</rdf:li></rdf:Seq></dc:creator>
<dc:rights><rdf:Alt><rdf:li xml:lang="x-default">© {SCHOOL}</rdf:li></rdf:Alt></dc:rights>
<photoshop:Credit>{SCHOOL} ({EN})</photoshop:Credit>
<photoshop:City>شیراز</photoshop:City><photoshop:Country>Iran</photoshop:Country>
<xmpRights:WebStatement>https://afarineshshiraz.ir/</xmpRights:WebStatement>
</rdf:Description></rdf:RDF></x:xmpmeta>
<?xpacket end="w"?>""".encode("utf-8")


def chunk(tag: bytes, data: bytes) -> bytes:
    return tag + struct.pack("<I", len(data)) + data + (b"\0" if len(data) % 2 else b"")


def add_xmp(path: Path, meta: bytes) -> bool:
    raw = path.read_bytes()
    if raw[:4] != b"RIFF" or raw[8:12] != b"WEBP":
        return False
    chunks, pos = [], 12
    while pos + 8 <= len(raw):
        tag, size = raw[pos:pos + 4], struct.unpack("<I", raw[pos + 4:pos + 8])[0]
        chunks.append((tag, raw[pos + 8:pos + 8 + size]))
        pos += 8 + size + (size & 1)
    if any(t == b"XMP " for t, _ in chunks):
        return False
    with Image.open(path) as im:
        w, h, alpha = im.width, im.height, im.mode in ("RGBA", "LA")
    if chunks[0][0] == b"VP8X":
        flags = chunks[0][1][0] | 0x04
        chunks[0] = (b"VP8X", bytes([flags]) + chunks[0][1][1:])
    else:
        flags = 0x04 | (0x10 if alpha else 0)
        vp8x = bytes([flags, 0, 0, 0]) + (w - 1).to_bytes(3, "little") + (h - 1).to_bytes(3, "little")
        chunks.insert(0, (b"VP8X", vp8x))
    chunks.append((b"XMP ", meta))
    body = b"WEBP" + b"".join(chunk(t, d) for t, d in chunks)
    path.write_bytes(b"RIFF" + struct.pack("<I", len(body)) + body)
    return True


def main(root: str) -> None:
    root = Path(root)
    img = root / "public/assets/img"
    en = json.loads((root / "content/en.json").read_text(encoding="utf-8"))
    done = 0
    for p in json.loads((root / "content/team.json").read_text(encoding="utf-8")):
        f = img / "team" / f"{p['id']}.webp"
        if f.exists():
            title = f"{p['name']}، {p['role']} {SCHOOL}"
            title_en = f"{en.get(p['name'], p['name'])}, {en.get(p['role'], p['role'])} at {EN}"
            done += add_xmp(f, xmp(title, title_en))
    for name, caption in SCHOOL_PHOTOS.items():
        for f in (img / "school").glob(f"{name}-*.webp"):
            if f.stem.rsplit("-", 1)[0] == name:
                done += add_xmp(f, xmp(caption, f"{EN}: school photo"))
    print(f"wrote photo metadata into {done} files")


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else ".")
