import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";

const COOKIE = "afarinesh_admin";
const MAX_BODY = 8 * 1024;
const SESSION_MS = 8 * 60 * 60_000;

function send(res, status, body, headers = {}) {
  const data = typeof body === "string" ? body : JSON.stringify(body);
  res.writeHead(status, { "Content-Type": typeof body === "string" ? "text/plain; charset=utf-8" : "application/json; charset=utf-8", "Cache-Control": "no-store", ...headers });
  res.end(data);
}

const b64 = (value) => Buffer.from(value).toString("base64url");
const unb64 = (value) => Buffer.from(value, "base64url");
const safeEqual = (a, b) => {
  const aa = Buffer.from(a);
  const bb = Buffer.from(b);
  return aa.length === bb.length && timingSafeEqual(aa, bb);
};

export function hashAdminPassword(password, { salt = randomBytes(16), N = 16_384, r = 8, p = 1 } = {}) {
  const digest = scryptSync(password, salt, 32, { N, r, p });
  return `scrypt$${N}$${r}$${p}$${b64(salt)}$${b64(digest)}`;
}

function verifyAdminPassword(password, encoded) {
  try {
    const [scheme, n, r, p, salt, digest] = String(encoded).split("$");
    if (scheme !== "scrypt" || !n || !r || !p || !salt || !digest) return false;
    const actual = scryptSync(password, unb64(salt), unb64(digest).length, { N: Number(n), r: Number(r), p: Number(p) });
    return safeEqual(actual, unb64(digest));
  } catch { return false; }
}

function parseCookies(header = "") {
  return Object.fromEntries(String(header).split(";").map((part) => part.trim().split("=")).filter(([k, v]) => k && v));
}

function issueSession(secret) {
  const payload = b64(JSON.stringify({ exp: Date.now() + SESSION_MS, nonce: randomBytes(12).toString("hex") }));
  const sig = createHmac("sha256", secret).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}

function validSession(req, secret) {
  if (!secret) return false;
  const value = parseCookies(req.headers.cookie)[COOKIE];
  if (!value) return false;
  const [payload, sig] = value.split(".");
  if (!payload || !sig || !safeEqual(sig, createHmac("sha256", secret).update(payload).digest("base64url"))) return false;
  try { return JSON.parse(unb64(payload)).exp > Date.now(); } catch { return false; }
}

function cookie(value, maxAge = 0) {
  return `${COOKIE}=${value}; Max-Age=${maxAge}; Path=/; HttpOnly; Secure; SameSite=Strict`;
}

async function readBody(req) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY) throw Object.assign(new Error("too_large"), { status: 413 });
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); }
  catch { throw Object.assign(new Error("bad_json"), { status: 400 }); }
}

function cleanRecord(row) {
  const record = { ...row };
  delete record.password;
  delete record.passwordHash;
  delete record.session;
  return record;
}

async function localRecords(dataDir, id) {
  const files = (await readdir(dataDir).catch(() => [])).filter((f) => f.endsWith(".jsonl"));
  const rows = [];
  for (const file of files) {
    const text = await readFile(join(dataDir, file), "utf8").catch(() => "");
    for (const line of text.split(/\r?\n/).filter(Boolean)) {
      try {
        const row = JSON.parse(line);
        if (!id || row.id === id) rows.push(cleanRecord(row));
      } catch {}
    }
  }
  return rows.sort((a, b) => String(b.receivedAt || "").localeCompare(String(a.receivedAt || ""))).slice(0, 200);
}

async function supabaseRecords({ url, key, id, fetchImpl }) {
  const params = new URLSearchParams({ select: "*", order: "created_at.desc", limit: "200" });
  if (id) params.set("id", `eq.${id}`);
  const res = await fetchImpl(`${url}/rest/v1/form_submissions?${params}`, {
    headers: { apikey: key, Authorization: `Bearer ${key}`, "Accept-Profile": "school" },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw Object.assign(new Error("records_unavailable"), { status: 503 });
  const rows = await res.json();
  return Array.isArray(rows) ? rows.map(cleanRecord) : [];
}

export function adminRecordUrl(recordId, base = process.env.ADMIN_PUBLIC_URL) {
  if (!base || !recordId) return null;
  return `${String(base).replace(/\/$/, "")}/admin.html?record=${encodeURIComponent(recordId)}`;
}

export function createAdminHandler({ dataDir = process.env.DATA_DIR, fetchImpl = fetch, logger = console } = {}) {
  const passwordHash = process.env.ADMIN_PASSWORD_HASH;
  const sessionSecret = process.env.ADMIN_SESSION_SECRET;
  const dbUrl = process.env.SUPABASE_URL;
  const dbKey = process.env.SUPABASE_SECRET_KEY;

  return async function handleAdmin(req, res) {
    res.setHeader("Cache-Control", "no-store");
    if (!passwordHash || !sessionSecret) return send(res, 503, { error: "admin_not_configured" });
    const origin = req.headers.origin;
    if (origin) {
      try { if (new URL(origin).host !== req.headers.host) return send(res, 403, { error: "forbidden_origin" }); }
      catch { return send(res, 403, { error: "forbidden_origin" }); }
    }
    const url = new URL(req.url, "http://localhost");
    try {
      if (req.method === "POST" && url.searchParams.get("action") === "login") {
        const body = await readBody(req);
        if (typeof body?.password !== "string" || body.password.length < 8 || !verifyAdminPassword(body.password, passwordHash)) {
          return send(res, 401, { error: "invalid_credentials" });
        }
        res.setHeader("Set-Cookie", cookie(issueSession(sessionSecret), Math.floor(SESSION_MS / 1000)));
        return send(res, 200, { ok: true });
      }
      if (req.method === "POST" && url.searchParams.get("action") === "logout") {
        res.setHeader("Set-Cookie", cookie("", 0));
        return send(res, 200, { ok: true });
      }
      if (req.method !== "GET") return send(res, 405, { error: "method_not_allowed" }, { Allow: "GET, POST" });
      if (!validSession(req, sessionSecret)) return send(res, 401, { error: "unauthorized" });
      const id = url.searchParams.get("id") || "";
      const rows = dbKey && dbUrl
        ? await supabaseRecords({ url: dbUrl, key: dbKey, id, fetchImpl })
        : await localRecords(dataDir, id);
      return send(res, 200, { ok: true, records: rows.map((row) => ({ ...row, adminUrl: adminRecordUrl(row.id) })) });
    } catch (err) {
      if (err.status) return send(res, err.status, { error: err.message });
      logger.error?.(err);
      return send(res, 503, { error: "records_unavailable" });
    }
  };
}
