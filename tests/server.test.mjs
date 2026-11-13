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
  const lines = (await readFile(join(dataDir, "inquiry.jsonl"), "utf8")).trim().split("\n").map(JSON.parse);
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
  const before = (await readFile(join(dataDir, "inquiry.jsonl"), "utf8")).split("\n").length;
  const res = await post({ ...valid, startedAt: Date.now() - 500 });
  assert.equal(res.status, 201);
  const after = (await readFile(join(dataDir, "inquiry.jsonl"), "utf8")).split("\n").length;
  assert.equal(after, before);
});

const goodPre = {
  fullName: "آرین رضایی", nationalId: "0499370899", birthDate: "1393/04/23", studentMobile: "09171234567",
  address: "شیراز، بلوار ارم، کوچه ۵، پلاک ۱۲", motherName: "مریم احمدی", fatherName: "علی رضایی", motherMobile: "09171111112", fatherMobile: "09172222223",
  currentSchool: "دبستان نمونه", gpa: "19.5", discipline: "عالی", grade: "8", consent: true,
};
const postTo = (path, body, headers = {}) => fetch(base + path, { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body) });

test("form pages are served at clean URLs", async () => {
  for (const p of ["/pre-registration", "/careers"]) {
    const res = await fetch(base + p);
    assert.equal(res.status, 200, p);
    assert.match(await res.text(), /<form/);
  }
});

test("pre-registration rejects an invalid national ID", async () => {
  const res = await postTo("/api/pre-registration", { ...goodPre, nationalId: "1234567890" });
  assert.equal(res.status, 422);
  assert.ok((await res.json()).errors.nationalId);
});

test("job applications are stored", async () => {
  const res = await postTo("/api/careers", { fullName: "مریم احمدی", field: "ریاضی", degree: "کارشناسی", experience: "زیر ۵ سال", phone: "07132293194", consent: true });
  assert.equal(res.status, 201);
});

test("a forged X-Forwarded-For does not reset the rate limit", async () => {
  const s = createServer(createApp({ publicDir, dataDir, logger: {}, rateLimit: { limit: 2, windowMs: 60_000 } }));
  await new Promise((r) => s.listen(0, "127.0.0.1", r));
  const b = `http://127.0.0.1:${s.address().port}`;
  const codes = [];
  for (let i = 0; i < 4; i++) {
    const r = await fetch(`${b}/api/inquiries`, { method: "POST", headers: { "Content-Type": "application/json", "X-Forwarded-For": `10.0.0.${i}` }, body: JSON.stringify({ ...valid, phone: `0917000000${i}` }) });
    codes.push(r.status);
  }
  await new Promise((r) => s.close(r));
  assert.deepEqual(codes, [201, 201, 429, 429]);
});

test("every page's inline script is allowed by the CSP built from index.html", async () => {
  const idx = inlineScriptHashes(await readFile(join(publicDir, "index.html"), "utf8"));
  for (const f of ["pre-registration.html", "careers.html"]) {
    for (const h of inlineScriptHashes(await readFile(join(publicDir, f), "utf8"))) assert.ok(idx.includes(h), `${f}: ${h}`);
  }
});

/* security regressions (security-audit/VULNERABILITY_REGISTER.md) */
const startApp = async (opts = {}) => {
  const dir = await mkdtemp(join(tmpdir(), "afarinesh-sec-"));
  const srv = createServer(createApp({ publicDir, dataDir: dir, logger: {}, ...opts }));
  await new Promise((r) => srv.listen(0, "127.0.0.1", r));
  const url = `http://127.0.0.1:${srv.address().port}`;
  return { url, dir, close: async () => { await new Promise((r) => srv.close(r)); await rm(dir, { recursive: true, force: true }); } };
};
const career = { fullName: "متقاضی آزمونی", field: "ریاضی", degree: "کارشناسی", experience: "زیر ۵ سال", phone: "09125550000", consent: true };

test("junk requests from many addresses do not lock real applicants out (SEC-01)", async () => {
  const app = await startApp({ trustProxy: "proxy" });
  try {
    for (let i = 0; i < 125; i++) {
      await fetch(`${app.url}/api/careers`, { method: "POST", headers: { "Content-Type": "application/json", "X-Forwarded-For": `203.0.113.${i}` }, body: "{bad" });
    }
    const res = await fetch(`${app.url}/api/careers`, { method: "POST", headers: { "Content-Type": "application/json", "X-Forwarded-For": "192.0.2.77" }, body: JSON.stringify(career) });
    assert.equal(res.status, 201);
  } finally { await app.close(); }
});

test("objects and arrays in place of text are rejected (SEC-05)", async () => {
  const res = await post({ parentName: { a: 1 }, phone: ["09171234567"], grade: ["7"] });
  assert.equal(res.status, 422);
  assert.deepEqual(Object.keys((await res.json()).errors).sort(), ["grade", "parentName", "phone"]);
});

test("a malformed URL gets 400, not a server error (SEC-06)", async () => {
  const res = await fetch(base + "/%E0%A4%A");
  assert.equal(res.status, 400);
});

test("X-Forwarded-Host is ignored when no proxy is configured (SEC-07)", async () => {
  const res = await post(valid, { Origin: "https://evil.example", "X-Forwarded-Host": "evil.example" });
  assert.equal(res.status, 403);
});

test("the rate limiter keeps a bounded number of addresses (SEC-08)", () => {
  let t = 0;
  const allow = createRateLimiter({ limit: 1, windowMs: 1000, now: () => t, maxKeys: 100 });
  for (let i = 0; i < 1000; i++) allow(`ip-${i}`);
  assert.equal(allow.count("ip-0"), 0);
  assert.equal(allow.count("ip-999"), 1);
});

test("a national ID can be resubmitted a few times, repeats are flagged, then it is refused (SEC-02)", async () => {
  const app = await startApp({ trustProxy: "proxy" });
  const send = (body, ip) => fetch(`${app.url}/api/pre-registration`, { method: "POST", headers: { "Content-Type": "application/json", "X-Forwarded-For": ip }, body: JSON.stringify(body) });
  try {
    assert.equal((await send(goodPre, "203.0.113.1")).status, 201);
    // whoever submits first with someone else's ID cannot lock the real family out
    assert.equal((await send({ ...goodPre, fullName: "صاحب واقعی کد" }, "192.0.2.10")).status, 201);
    assert.equal((await send(goodPre, "203.0.113.2")).status, 201);
    const fourth = await send(goodPre, "203.0.113.3");
    assert.equal(fourth.status, 429);
    assert.equal((await fourth.json()).error, "duplicate");
    const rows = (await readFile(join(app.dir, "preRegistration.jsonl"), "utf8")).trim().split("\n").map(JSON.parse);
    assert.deepEqual(rows.map((r) => r.repeat), [undefined, 2, 3]);
    assert.equal(rows[0].consent, undefined);
  } finally { await app.close(); }
});
