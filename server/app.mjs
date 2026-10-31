// HTTP app: static files from public/ plus a small JSON API. No dependencies.
import { createReadStream } from "node:fs";
import { stat, appendFile, mkdir } from "node:fs/promises";
import { createGzip, createBrotliCompress } from "node:zlib";
import { extname, join, normalize, resolve, sep } from "node:path";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createInquiryHandler, send } from "./inquiry.mjs";

export { createRateLimiter } from "./inquiry.mjs";

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
};
const COMPRESSIBLE = new Set([".html", ".css", ".js", ".json", ".webmanifest", ".svg", ".txt", ".xml"]);

/** sha256 sources for every inline executable <script> in the page, so CSP can allow exactly those. */
export function inlineScriptHashes(html) {
  return [...html.matchAll(/<script(?![^>]*src=)(?![^>]*type="application\/ld\+json")[^>]*>([\s\S]*?)<\/script>/g)]
    .map((m) => `'sha256-${createHash("sha256").update(m[1]).digest("base64")}'`);
}

export const buildSecurityHeaders = (scriptHashes = []) => ({
  "Content-Security-Policy": [
    "default-src 'self'",
    "img-src 'self' data:",
    "style-src 'self'",
    "font-src 'self'",
    // the inline theme script runs before paint to avoid a flash of the wrong theme
    ["script-src 'self'", ...scriptHashes].join(" "),
    "connect-src 'self'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join("; "),
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(), interest-cohort=()",
  "Cross-Origin-Opener-Policy": "same-origin",
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
});

export function createApp({ publicDir, dataDir, logger = console, rateLimit = { limit: 5, windowMs: 10 * 60_000 } }) {
  const root = resolve(publicDir);
  const securityHeaders = buildSecurityHeaders(inlineScriptHashes(readFileSync(join(root, "index.html"), "utf8")));

  const handleInquiry = createInquiryHandler({
    logger,
    rateLimit,
    async save(record) {
      await mkdir(dataDir, { recursive: true });
      await appendFile(join(dataDir, "inquiries.jsonl"), JSON.stringify(record) + "\n", "utf8");
    },
  });

  async function api(req, res, path) {
    if (path === "/api/health") return send(res, 200, { ok: true });
    if (path === "/api/inquiries") return handleInquiry(req, res);
    return send(res, 404, { error: "not_found" });
  }

  async function serveStatic(req, res, path) {
    if (req.method !== "GET" && req.method !== "HEAD") return send(res, 405, "Method Not Allowed", { Allow: "GET, HEAD" });
    let rel = normalize(decodeURIComponent(path)).replace(/^([/\\])+/, "");
    if (rel === "" || rel.endsWith(sep)) rel = join(rel, "index.html");
    let file = resolve(root, rel);
    if (file !== root && !file.startsWith(root + sep)) return send(res, 403, "Forbidden");

    let info = await stat(file).catch(() => null);
    if (info?.isDirectory()) { file = join(file, "index.html"); info = await stat(file).catch(() => null); }
    let status = 200;
    if (!info) { status = 404; file = join(root, "404.html"); info = await stat(file).catch(() => null); }
    if (!info) return send(res, 404, "Not Found");

    const ext = extname(file);
    const etag = `W/"${info.size.toString(16)}-${Math.floor(info.mtimeMs).toString(16)}"`;
    const headers = {
      "Content-Type": TYPES[ext] || "application/octet-stream",
      ETag: etag,
      "Last-Modified": info.mtime.toUTCString(),
      // file names are not content-hashed: code revalidates via ETag (cheap 304), media is cached for a week
      "Cache-Control": /\/assets\/(fonts|img)\//.test(file.replaceAll("\\", "/")) ? "public, max-age=604800" : "no-cache",
      Vary: "Accept-Encoding",
    };
    if (status === 200 && req.headers["if-none-match"] === etag) { res.writeHead(304, headers); return res.end(); }

    const accept = String(req.headers["accept-encoding"] || "");
    let encoder = null;
    if (COMPRESSIBLE.has(ext) && info.size > 1024) {
      if (/\bbr\b/.test(accept)) { encoder = createBrotliCompress(); headers["Content-Encoding"] = "br"; }
      else if (/\bgzip\b/.test(accept)) { encoder = createGzip(); headers["Content-Encoding"] = "gzip"; }
    }
    if (!encoder) headers["Content-Length"] = info.size;
    res.writeHead(status, headers);
    if (req.method === "HEAD") return res.end();
    const stream = createReadStream(file);
    stream.on("error", () => res.destroy());
    (encoder ? stream.pipe(encoder) : stream).pipe(res);
  }

  return async function handler(req, res) {
    for (const [k, v] of Object.entries(securityHeaders)) res.setHeader(k, v);
    let path;
    try { path = new URL(req.url, "http://x").pathname; } catch { return send(res, 400, "Bad Request"); }
    try {
      if (path.startsWith("/api/")) return await api(req, res, path);
      return await serveStatic(req, res, path);
    } catch (err) {
      if (err.status) return send(res, err.status, { error: err.message });
      logger.error?.(err);
      if (!res.headersSent) send(res, 500, { error: "server_error" });
      else res.destroy();
    }
  };
}
