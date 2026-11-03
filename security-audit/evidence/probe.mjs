// Non-destructive probes against a local, isolated instance (temp data dir, no Telegram).
import { createServer } from "node:http";
import { mkdtemp, readdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { request } from "node:http";

const root = process.argv[2];
delete process.env.TELEGRAM_BOT_TOKEN; delete process.env.TELEGRAM_CHAT_ID; delete process.env.TRUST_PROXY; delete process.env.VERCEL;
const { createApp } = await import(`file:///${root}/server/app.mjs`);
const dataDir = await mkdtemp(join(tmpdir(), "afa-probe-"));
const logs = [];
const app = createApp({ publicDir: `${root}/public`, dataDir, logger: { info: (m) => logs.push(m), error: (e) => logs.push("ERR " + (e?.code || e?.name) + " " + e?.message) } });
const srv = createServer(app).listen(0, "127.0.0.1");
await new Promise((r) => srv.once("listening", r));
const port = srv.address().port;

const raw = (path, { method = "GET", headers = {}, body } = {}) => new Promise((resolve) => {
  const req = request({ host: "127.0.0.1", port, path, method, headers: { host: `127.0.0.1:${port}`, ...headers } }, (res) => {
    let d = ""; res.on("data", (c) => (d += c)); res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, body: d }));
  });
  req.on("error", (e) => resolve({ status: "ERR", body: e.message }));
  if (body) req.write(body);
  req.end();
});
const json = (path, obj, headers = {}) => raw(path, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: typeof obj === "string" ? obj : JSON.stringify(obj) });
const out = [];
const log = (id, desc, r, extra = "") => out.push(`${id}\t${desc}\t${r.status}\t${String(r.body).slice(0, 90).replace(/\s+/g, " ")}${extra}`);

const old = Date.now() - 60_000;
const inquiry = (n = 0) => ({ parentName: "آزمون امنیتی", phone: `0912000${String(1000 + n).slice(-4)}`, grade: "7", message: "", website: "", startedAt: old });

// static / traversal
for (const p of ["/../server/forms.mjs", "/%2e%2e/server/forms.mjs", "/..%2fserver%2fforms.mjs", "/..%5cserver%5cforms.mjs", "/%2e%2e%2f.env.local", "/assets/../../.env.local", "/%00", "/%E0%A4%A", "/.git/config", "/data/inquiry.jsonl", "//etc/passwd"]) log("T", `GET ${p}`, await raw(p));
log("T", "HEAD /", await raw("/", { method: "HEAD" }));
log("T", "POST / (static)", await raw("/", { method: "POST" }));
log("T", "TRACE /", await raw("/", { method: "TRACE" }));

// headers
const h = await raw("/");
out.push("HDR\t/\t" + ["content-security-policy", "strict-transport-security", "x-content-type-options", "referrer-policy", "permissions-policy", "cross-origin-opener-policy", "x-frame-options", "x-powered-by", "server"].map((k) => `${k}=${h.headers[k] ? "yes" : "NO"}`).join(" "));
const h404 = await raw("/nope"); out.push(`HDR\t/nope status ${h404.status} csp=${!!h404.headers["content-security-policy"]}`);
const hapi = await raw("/api/health"); out.push(`HDR\t/api/health ${hapi.status} csp=${!!hapi.headers["content-security-policy"]} cache=${hapi.headers["cache-control"]} acao=${hapi.headers["access-control-allow-origin"] ?? "none"}`);

// API method/type/size
log("A", "GET /api/inquiries", await raw("/api/inquiries"));
log("A", "OPTIONS preflight", await raw("/api/inquiries", { method: "OPTIONS", headers: { origin: "https://evil.example", "access-control-request-method": "POST" } }));
log("A", "text/plain body (form-CSRF shape)", await raw("/api/inquiries", { method: "POST", headers: { "content-type": "text/plain" }, body: JSON.stringify(inquiry(1)) }));
log("A", "foreign Origin", await json("/api/inquiries", inquiry(2), { origin: "https://evil.example" }));
log("A", "Origin=null", await json("/api/inquiries", inquiry(3), { origin: "null" }));
log("A", "forged X-Forwarded-Host matches evil Origin", await json("/api/inquiries", inquiry(4), { origin: "https://evil.example", "x-forwarded-host": "evil.example" }));
log("A", "oversized declared", await raw("/api/inquiries", { method: "POST", headers: { "content-type": "application/json", "content-length": "999999" }, body: "{}" }));
log("A", "oversized chunked", await raw("/api/inquiries", { method: "POST", headers: { "content-type": "application/json", "transfer-encoding": "chunked" }, body: JSON.stringify({ x: "a".repeat(20000) }) }));
log("A", "bad json", await json("/api/inquiries", "{bad"));
log("A", "array body", await json("/api/inquiries", "[]"));
log("A", "null body", await json("/api/inquiries", "null"));
log("A", "type confusion (objects)", await json("/api/inquiries", { parentName: { a: 1 }, phone: ["0912"], grade: 7, startedAt: old }));
log("A", "XSS/injection payload in name", await json("/api/inquiries", { ...inquiry(5), parentName: "<img src=x onerror=alert(1)>{{7*7}}${7*7}" }));
log("A", "proto pollution keys", await json("/api/inquiries", JSON.stringify({ ...inquiry(6), __proto__: { admin: true }, constructor: { prototype: { polluted: 1 } } }).replace('"admin"', '"admin"')));
out.push(`PP\tObject.prototype polluted? ${({}).admin === true || ({}).polluted === 1}`);
log("A", "mass assignment (id/kind/receivedAt)", await json("/api/inquiries", { ...inquiry(7), id: "attacker-id", kind: "career", receivedAt: "1999" }));
log("A", "honeypot filled (fake success)", await json("/api/inquiries", { ...inquiry(8), website: "x" }));
log("A", "startedAt omitted (timing check skipped)", await json("/api/inquiries", { ...inquiry(9), startedAt: undefined }));
log("A", "startedAt in future", await json("/api/inquiries", { ...inquiry(10), startedAt: Date.now() + 1e9 }));
log("A", "unknown path", await raw("/api/../api/health"));
log("A", "malformed URL", await raw("http://[::1"));

// pre-registration with a synthetic valid national ID (check digit computed)
const nid = (() => { const d = "001234567"; const s = [...d].reduce((a, c, i) => a + Number(c) * (10 - i), 0) % 11; return d + (s < 2 ? s : 11 - s); })();
const pre = { fullName: "دانش آموز آزمونی", nationalId: nid, birthDate: "1393/01/01", studentMobile: "09120000001", address: "نشانی آزمونی برای تست", motherName: "", fatherName: "", motherEducation: "", fatherEducation: "", motherJob: "", fatherJob: "", motherMobile: "09120000002", fatherMobile: "09120000003", currentSchool: "مدرسه آزمونی", gpa: "19.5", gpaDescriptive: "", discipline: "عالی", grade: "7", referral: "", consent: true, website: "", startedAt: old };
log("B", "pre-reg attacker submits victim national ID", await json("/api/pre-registration", pre));
log("B", "pre-reg real owner then blocked 24h", await json("/api/pre-registration", { ...pre, fullName: "صاحب واقعی کد" }));
log("B", "pre-reg consent missing", await json("/api/pre-registration", { ...pre, consent: false, nationalId: "0000000000" }));

// rate limiting: per-IP then the shared global bucket
let codes = [];
for (let i = 0; i < 8; i++) codes.push((await json("/api/careers", { fullName: "متقاضی آزمونی", field: "ریاضی", degree: "کارشناسی", experience: "زیر ۵ سال", phone: `0912100${1000 + i}`, consent: true, startedAt: old })).status);
out.push(`RL\tcareers x8 same IP\t${codes.join(",")}`);
codes = [];
for (let i = 0; i < 130; i++) codes.push((await json("/api/inquiries", "{bad")).status);
const c = codes.reduce((m, s) => ((m[s] = (m[s] || 0) + 1), m), {});
out.push(`RL\tinquiry junk x130 same IP\t${JSON.stringify(c)}`);

const files = await readdir(dataDir);
const stored = files.length ? (await readFile(join(dataDir, "inquiry.jsonl"), "utf8").catch(() => "")).trim().split("\n").filter(Boolean).map((l) => JSON.parse(l)) : [];
out.push(`DATA\tfiles=${files.join(",")} inquiry records=${stored.length} keys=${stored[0] ? Object.keys(stored[0]).join("|") : ""}`);
const mass = stored.find((r) => r.id === "attacker-id" || r.receivedAt === "1999"); out.push(`DATA\tmass-assignment stored? ${!!mass}`);
const xss = stored.find((r) => /img|onerror/.test(r.parentName)); out.push(`DATA\tpayload stored as: ${xss ? JSON.stringify(xss.parentName) : "(rejected)"}`);
out.push(`LOGS\t${logs.filter((l) => l.startsWith("ERR")).join(" ; ") || "no errors"}`);
console.log(out.join("\n"));
srv.close();
