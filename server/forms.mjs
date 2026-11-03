// The site's three forms (callback request, pre-registration, job application) share one hardened handler.
// Used by the local/own-host server (server/app.mjs) and the Vercel functions (api/*.js); only `save` differs.
import { randomUUID } from "node:crypto";
import {
  validateInquiry, validatePreRegistration, validateCareer, GRADE_LABEL, toPersianDigits,
} from "../public/assets/js/validate.js";

const MIN_FILL_MS = 3000;
const HOUR = 60 * 60_000;
const fmtTime = (iso) => new Intl.DateTimeFormat("fa-IR", { timeZone: "Asia/Tehran", dateStyle: "medium", timeStyle: "short" }).format(new Date(iso));
const or = (v) => v || "ثبت نشده";

/**
 * Per form: validation, the Telegram text for staff, request size and abuse limits.
 * `dedupeKey` names the field one person cannot resubmit too often (rate limited separately from the IP).
 */
export const FORMS = {
  inquiry: {
    validate: validateInquiry,
    maxBytes: 4 * 1024,
    perIp: { limit: 5, windowMs: 10 * 60_000 },
    perKey: { limit: 2, windowMs: HOUR },
    dedupeKey: "phone",
    lines: (r) => [
      "درخواست تماس تازه از سایت",
      `نام ولی: ${r.parentName}`,
      `شماره همراه: ${r.phone}`,
      `پایه: ${GRADE_LABEL[r.grade]}`,
      r.message ? `پیام: ${r.message}` : null,
    ],
  },
  preRegistration: {
    validate: validatePreRegistration,
    maxBytes: 8 * 1024,
    perIp: { limit: 4, windowMs: HOUR },
    // more than one, so whoever knows a child's ID cannot lock the family out; repeats are flagged to staff
    perKey: { limit: 3, windowMs: 24 * HOUR },
    dedupeKey: "nationalId",
    lines: (r) => [
      "پیش‌ثبت‌نام تازه، سال تحصیلی ۱۴۰۶-۱۴۰۷",
      "",
      "◼ دانش‌آموز",
      `نام: ${r.fullName}`,
      `کد ملی: ${r.nationalId}`,
      `تاریخ تولد: ${toPersianDigits(r.birthDate)}`,
      `همراه دانش‌آموز: ${r.studentMobile}`,
      `نشانی: ${r.address}`,
      "",
      "◼ والدین",
      `مادر: ${or(r.motherName)} | تحصیلات: ${or(r.motherEducation)} | شغل: ${or(r.motherJob)} | همراه: ${r.motherMobile}`,
      `پدر: ${or(r.fatherName)} | تحصیلات: ${or(r.fatherEducation)} | شغل: ${or(r.fatherJob)} | همراه: ${r.fatherMobile}`,
      "",
      "◼ اطلاعات آموزشی",
      `مدرسه‌ی فعلی: ${r.currentSchool}`,
      `معدل: ${toPersianDigits(r.gpa)}${r.gpaDescriptive ? ` (${r.gpaDescriptive})` : ""}`,
      `انضباط: ${r.discipline}`,
      `پایه‌ی درخواستی: ${GRADE_LABEL[r.grade]}`,
      `نحوه‌ی آشنایی: ${or(r.referral)}`,
    ],
  },
  career: {
    validate: validateCareer,
    maxBytes: 4 * 1024,
    perIp: { limit: 3, windowMs: HOUR },
    perKey: { limit: 1, windowMs: 24 * HOUR },
    dedupeKey: "phone",
    lines: (r) => [
      "درخواست همکاری تازه از سایت",
      `نام: ${r.fullName}`,
      `رشته: ${r.field}`,
      `مقطع: ${r.degree}`,
      `سابقه‌ی تدریس: ${r.experience}`,
      `شماره تماس: ${r.phone}`,
    ],
  },
};

/** Plain-text Telegram message (no parse_mode, so nothing a visitor types can change formatting). */
export function formatRecord(record) {
  const form = FORMS[record.kind] ?? FORMS.inquiry;
  const repeat = record.repeat > 1
    ? [`⚠ ارسال شماره‌ی ${toPersianDigits(record.repeat)} با همین ${form.dedupeKey === "nationalId" ? "کد ملی" : "شماره"} در ۲۴ ساعت گذشته؛ پیش از اقدام تلفنی بررسی شود.`, ""]
    : [];
  return [...repeat, ...form.lines(record), "", `زمان: ${fmtTime(record.receivedAt)}`, `کد پیگیری: ${record.id.slice(0, 8)}`]
    .filter((l) => l !== null).join("\n").slice(0, 4000);
}
export const formatInquiry = (record) => formatRecord({ kind: "inquiry", ...record });

/** Sends to a Telegram chat; throws a 503 error when the bot is not configured so the page tells people to call. */
export function createTelegramSender({ token, chatId, fetchImpl = fetch }) {
  return async (record) => {
    if (!token || !chatId) throw Object.assign(new Error("inbox_not_configured"), { status: 503 });
    const res = await fetchImpl(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text: formatRecord(record), disable_web_page_preview: true }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) throw Object.assign(new Error(`telegram ${res.status}`), { status: 503 });
  };
}

/**
 * Fixed-window limiter. In memory, so it is exact for one server process (the school's own host)
 * and best-effort on serverless platforms, where each instance counts separately.
 */
export function createRateLimiter({ limit, windowMs, now = Date.now, maxKeys = 50_000 }) {
  const hits = new Map();
  const allow = (key) => {
    const t = now();
    const entry = hits.get(key);
    if (!entry || t - entry.start >= windowMs) {
      hits.delete(key);
      hits.set(key, { start: t, count: 1 });
      if (hits.size > 10_000) for (const [k, v] of hits) if (t - v.start >= windowMs) hits.delete(k);
      // a flood from many addresses must not grow memory without bound: drop the oldest windows
      for (const k of hits.keys()) { if (hits.size <= maxKeys) break; hits.delete(k); }
      return true;
    }
    entry.count++;
    return entry.count <= limit;
  };
  /** How many attempts this key has made in its current window. */
  allow.count = (key) => hits.get(key)?.count ?? 0;
  return allow;
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
  if (!String(req.headers["content-type"] || "").startsWith("application/json")) throw Object.assign(new Error("unsupported_type"), { status: 415 });
  if (Number(req.headers["content-length"]) > maxBytes) throw Object.assign(new Error("too_large"), { status: 413 });
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > maxBytes) throw Object.assign(new Error("too_large"), { status: 413 });
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); }
  catch { throw Object.assign(new Error("bad_json"), { status: 400 }); }
}

/**
 * The visitor's IP. Forwarding headers can be forged by anyone, so they are read only when the
 * deployment says a trusted proxy sets them ("vercel", or "proxy" behind the host's own web server).
 */
export function clientIp(req, trustProxy = process.env.TRUST_PROXY || (process.env.VERCEL ? "vercel" : "")) {
  if (trustProxy === "vercel") return String(req.headers["x-vercel-forwarded-for"] || req.headers["x-real-ip"] || "").split(",")[0].trim();
  if (trustProxy === "proxy") return String(req.headers["x-forwarded-for"] || "").split(",").pop().trim() || req.socket?.remoteAddress || "";
  return req.socket?.remoteAddress || "";
}

/**
 * @param {keyof FORMS} kind
 * @param {{ save: (record: object) => Promise<void>, logger?: Console, rateLimit?: {limit: number, windowMs: number}, trustProxy?: string }} opts
 */
export function createFormHandler(kind, { save, logger = console, rateLimit, trustProxy } = {}) {
  const form = FORMS[kind];
  const perIp = createRateLimiter(rateLimit ?? form.perIp);
  const perKey = createRateLimiter(form.perKey);
  // flood guard for the staff channel; only accepted submissions count, so junk cannot lock real families out
  const global = createRateLimiter({ limit: 120, windowMs: HOUR });
  const proxy = trustProxy ?? (process.env.TRUST_PROXY || (process.env.VERCEL ? "vercel" : ""));

  return async function handleForm(req, res) {
    try {
      if (req.method !== "POST") return send(res, 405, { error: "method_not_allowed" }, { Allow: "POST" });

      // the page always posts from its own origin; anything else is another site using a visitor's browser
      const origin = req.headers.origin;
      const host = (proxy && req.headers["x-forwarded-host"]) || req.headers.host;
      if (origin) {
        let originHost = "";
        try { originHost = new URL(origin).host; } catch {}
        if (originHost !== host) return send(res, 403, { error: "forbidden_origin" });
      }

      const ip = clientIp(req, proxy);
      if (!perIp(ip)) return send(res, 429, { error: "rate_limited" }, { "Retry-After": "600" });

      const body = await readJson(req, form.maxBytes);
      if (!body || typeof body !== "object" || Array.isArray(body)) return send(res, 400, { error: "bad_json" });
      // bots fill the hidden "website" field or post within seconds of loading the page; pretend success
      if (body.website) return send(res, 201, { ok: true });
      const startedAt = Number(body.startedAt);
      if (startedAt && Date.now() - startedAt < MIN_FILL_MS) return send(res, 201, { ok: true });

      const result = form.validate(body);
      if (!result.ok) return send(res, 422, { error: "invalid", errors: result.errors });
      const key = `${kind}:${result.value[form.dedupeKey]}`;
      if (!perKey(key)) return send(res, 429, { error: "duplicate" }, { "Retry-After": "3600" });
      if (!global("all")) return send(res, 429, { error: "rate_limited" }, { "Retry-After": "600" });

      const { consent, ...value } = result.value;
      const repeat = perKey.count(key);
      const record = { kind, id: randomUUID(), receivedAt: new Date().toISOString(), ...value, ...(repeat > 1 && { repeat }) };
      await save(record);
      logger.info?.(`${kind} ${record.id}`); // ids only: personal data never goes to logs
      return send(res, 201, { ok: true, id: record.id });
    } catch (err) {
      if (err.status) return send(res, err.status, { error: err.message });
      logger.error?.(err);
      if (!res.headersSent) send(res, 500, { error: "server_error" });
    }
  };
}

export const createInquiryHandler = (opts) => createFormHandler("inquiry", opts);
