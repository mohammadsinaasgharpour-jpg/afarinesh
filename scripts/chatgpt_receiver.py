"""Receives blog photos made in ChatGPT and saves them into content/blog-images/<slug>.png.

Usage:  python -I scripts/chatgpt_receiver.py content/blog-images

Listens on 127.0.0.1:8766 only. The ChatGPT page cannot download files or call localhost with fetch, but it can
submit an ordinary form: a small script in the page posts the generated image as multipart/form-data to
/save?name=<article slug>. Names are limited to article-slug characters and the size to 15 MB.
"""
import re
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse, parse_qs

OUT = Path(sys.argv[1])


class H(BaseHTTPRequestHandler):
    def do_POST(self):
        q = parse_qs(urlparse(self.path).query)
        name = q.get("name", [""])[0]
        n = int(self.headers.get("Content-Length", "0"))
        if not re.fullmatch(r"[a-z0-9-]{3,80}", name) or not 0 < n < 15_000_000:
            self.send_response(400); self.end_headers(); return
        data = self.rfile.read(n)
        ctype = self.headers.get("Content-Type", "")
        if ctype.startswith("multipart/form-data"):
            boundary = b"--" + ctype.split("boundary=", 1)[1].strip('"').encode()
            for part in data.split(boundary):
                head, _, body = part.partition(b"\r\n\r\n")
                if b"filename=" in head:
                    data = body[:-2] if body.endswith(b"\r\n") else body
                    break
        ext = ".png" if data[:4] == b"\x89PNG" else ".webp" if data[8:12] == b"WEBP" else ".jpg"
        (OUT / f"{name}{ext}").write_bytes(data)
        self.send_response(200); self.end_headers(); self.wfile.write(b"ok")
        print("saved", name, ext, n, flush=True)


ThreadingHTTPServer(("127.0.0.1", 8766), H).serve_forever()
