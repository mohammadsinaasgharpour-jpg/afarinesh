import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createApp, createRateLimiter, inlineScriptHashes } from "../server/app.mjs";

const publicDir = fileURLToPath(new URL("../public", import.meta.url));
let server, base, dataDir;

before(async () => {
  dataDir = await mkdtemp(join(tmpdir(), "afarinesh-"));
  server = createServer(createApp({ publicDir, dataDir, logger: {}, rateLimit: { limit: 50, windowMs: 60_000 } }));
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
  await new Promise((r) => server.close(r));
  await rm(dataDir, { recursive: true, force: true });
});

const post = (body, headers = {}) => fetch(`${base}/api/inquiries`, {
  method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body),
});
const valid = { parentName: "مریم احمدی", phone: "09171234567", grade: "7", message: "" };

test("serves the home page with security headers and compression", async () => {
  const res = await fetch(base + "/", { headers: { "Accept-Encoding": "gzip" } });
  assert.equal(res.status, 200);
  assert.match(res.headers.get("content-type"), /text\/html/);
  assert.match(res.headers.get("content-security-policy"), /frame-ancestors 'none'/);
  assert.match(res.headers.get("content-security-policy"), /script-src 'self' 'sha256-/);
  assert.equal(res.headers.get("x-content-type-options"), "nosniff");
  assert.equal(res.headers.get("content-encoding"), "gzip");
  assert.match(await res.text(), /دبیرستان آفرینش/);
});

test("answers a matching ETag with 304", async () => {
  const first = await fetch(base + "/assets/css/main.css");
  const res = await fetch(base + "/assets/css/main.css", { headers: { "If-None-Match": first.headers.get("etag") } });
  assert.equal(res.status, 304);
});

test("blocks path traversal", async () => {
  const res = await fetch(base + "/..%2f..%2fpackage.json");
  assert.notEqual(res.status, 200);
});

test("unknown pages get the 404 page", async () => {
  const res = await fetch(base + "/no-such-page");
  assert.equal(res.status, 404);
  assert.match(await res.text(), /صفحه/);
});

test("stores a valid inquiry", async () => {
  const res = await post(valid);
  assert.equal(res.status, 201);
  const { id } = await res.json();
  const lines = (await readFile(join(dataDir, "inquiries.jsonl"), "utf8")).trim().split("\n").map(JSON.parse);
  assert.ok(lines.some((l) => l.id === id && l.phone === "09171234567"));
});

test("rejects invalid inquiries with field errors", async () => {
  const res = await post({ ...valid, phone: "12" });
  assert.equal(res.status, 422);
  assert.ok((await res.json()).errors.phone);
});

test("rejects non-JSON and oversized bodies", async () => {
  const wrongType = await fetch(`${base}/api/inquiries`, { method: "POST", body: "a=b", headers: { "Content-Type": "application/x-www-form-urlencoded" } });
  assert.equal(wrongType.status, 415);
  const big = await post({ ...valid, message: "x".repeat(5000) });
  assert.equal(big.status, 413);
});

test("rejects cross-origin posts", async () => {
  const res = await post(valid, { Origin: "https://evil.example" });
  assert.equal(res.status, 403);
});

test("rate limiter allows the limit then refuses until the window passes", () => {
  let t = 0;
  const allow = createRateLimiter({ limit: 2, windowMs: 1000, now: () => t });
  assert.deepEqual([allow("a"), allow("a"), allow("a"), allow("b")], [true, true, false, true]);
  t = 1000;
  assert.equal(allow("a"), true);
});

test("inline script hashes skip external and JSON-LD scripts", () => {
  const html = '<script>x()</script><script src="/a.js"></script><script type="application/ld+json">{}</script>';
  assert.equal(inlineScriptHashes(html).length, 1);
});

test("vercel.json carries the current CSP hash of the page", async () => {
  const { buildVercelConfig } = await import("../scripts/vercel-config.mjs");
  const committed = JSON.parse(await readFile(fileURLToPath(new URL("../vercel.json", import.meta.url)), "utf8"));
  assert.deepEqual(committed, await buildVercelConfig(), "run npm run build");
});

test("forms posted seconds after page load are dropped silently", async () => {
  const before = (await readFile(join(dataDir, "inquiries.jsonl"), "utf8")).split("\n").length;
  const res = await post({ ...valid, startedAt: Date.now() - 500 });
  assert.equal(res.status, 201);
  const after = (await readFile(join(dataDir, "inquiries.jsonl"), "utf8")).split("\n").length;
  assert.equal(after, before);
});
