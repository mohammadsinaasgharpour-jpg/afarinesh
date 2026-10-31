// POST /api/inquiries — shared by the local server (server/app.mjs) and the Vercel function (api/inquiries.js).
// Only `save` differs between them.
import { randomUUID } from "node:crypto";
import { validateInquiry, GRADE_LABEL } from "../public/assets/js/validate.js";

const MIN_FILL_MS = 3000;

/** Plain-text Telegram message for staff; no parse_mode, so user text cannot inject formatting. */
export function formatInquiry(record) {
  const when = new Intl.DateTimeFormat("fa-IR", { timeZone: "Asia/Tehran", dateStyle: "medium", timeStyle: "short" }).format(new Date(record.receivedAt));
  return [
    "درخواست تماس تازه از سایت",
    `نام ولی: ${record.parentName}`,
    `شماره همراه: ${record.phone}`,
    `پایه: ${GRADE_LABEL[record.grade]}`,
    record.message ? `پیام: ${record.message}` : null,
    `زمان: ${when}`,
    `کد پیگیری: ${record.id.slice(0, 8)}`,
  ].filter(Boolean).join("\n");
}

/** Sends to a Telegram chat; throws a 503 error when the bot is not configured so the page tells parents to call. */
export function createTelegramSender({ token, chatId, fetchImpl = fetch }) {
  return async (record) => {
    if (!token || !chatId) throw Object.assign(new Error("inbox_not_configured"), { status: 503 });
    const res = await fetchImpl(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text: formatInquiry(record), disable_web_page_preview: true }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) throw Object.assign(new Error(`telegram ${res.status}`), { status: 503 });
  };
}

/** Fixed-window limiter keyed by client IP. */
export function createRateLimiter({ limit, windowMs, now = Date.now }) {
  const hits = new Map();
  return (key) => {
    const t = now();
    const entry = hits.get(key);
    if (!entry || t - entry.start >= windowMs) {
      hits.set(key, { start: t, count: 1 });
      if (hits.size > 10_000) for (const [k, v] of hits) if (t - v.start >= windowMs) hits.delete(k);
      return true;
    }
    entry.count++;
    return entry.count <= limit;
  };
}

export function send(res, status, body, headers = {}) {
  const data = typeof body === "string" ? body : JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": typeof body === "string" ? "text/plain; charset=utf-8" : "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    ...headers,
  });
  res.end(data);
}

async function readJson(req, maxBytes) {
  if (!String(req.headers["content-type"] || "").startsWith("application/json")) throw Object.assign(new Error("type"), { status: 415 });
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > maxBytes) throw Object.assign(new Error("too large"), { status: 413 });
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); }
  catch { throw Object.assign(new Error("bad json"), { status: 400 }); }
}

/**
 * @param {{ save: (record: object) => Promise<void>, logger?: Console, rateLimit?: {limit: number, windowMs: number} }} opts
 */
export function createInquiryHandler({ save, logger = console, rateLimit = { limit: 5, windowMs: 10 * 60_000 } }) {
  const allow = createRateLimiter(rateLimit);

  return async function handleInquiry(req, res) {
    try {
      if (req.method !== "POST") return send(res, 405, { error: "method_not_allowed" }, { Allow: "POST" });

      const origin = req.headers.origin;
      const host = req.headers["x-forwarded-host"] || req.headers.host;
      if (origin && new URL(origin).host !== host) return send(res, 403, { error: "forbidden_origin" });

      const ip = String(req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "").split(",")[0].trim();
      if (!allow(ip)) return send(res, 429, { error: "rate_limited" }, { "Retry-After": "600" });

      const body = await readJson(req, 4096);
      // bots fill the hidden "website" field or post within seconds of loading the page; pretend success
      if (body && body.website) return send(res, 201, { ok: true });
      const startedAt = Number(body?.startedAt);
      if (startedAt && Date.now() - startedAt < MIN_FILL_MS) return send(res, 201, { ok: true });

      const result = validateInquiry(body);
      if (!result.ok) return send(res, 422, { error: "invalid", errors: result.errors });

      const record = { id: randomUUID(), receivedAt: new Date().toISOString(), ...result.value };
      await save(record);
      logger.info?.(`inquiry ${record.id} grade=${record.grade}`);
      return send(res, 201, { ok: true, id: record.id });
    } catch (err) {
      if (err.status) return send(res, err.status, { error: err.message });
      logger.error?.(err);
      if (!res.headersSent) send(res, 500, { error: "server_error" });
    }
  };
}
