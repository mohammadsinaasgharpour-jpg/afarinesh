// The library's Telegram bot. TELEGRAM_BOT_TOKEN (secret) and TELEGRAM_CHAT_ID (the school's channel or group
// the bot posts to) come from the Vercel project settings, never from this repository. Messages are plain text
// (no parse_mode), so nothing a visitor types can change their formatting or add links.
import { createHmac, timingSafeEqual } from "node:crypto";

const API = "https://api.telegram.org";

// trimmed: a value pasted or piped into the settings can carry a trailing newline
export const token = () => (process.env.TELEGRAM_BOT_TOKEN || "").trim();
export const chatId = () => (process.env.TELEGRAM_CHAT_ID || "").trim();
export const configured = () => Boolean(token() && chatId());

export class TelegramError extends Error {}

/** One Bot API call; throws TelegramError with Telegram's own description when it refuses. */
export async function call(method, body = {}) {
  if (!token()) throw new TelegramError("bot token not set");
  let res;
  try {
    res = await fetch(`${API}/bot${token()}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(8000),
    });
  } catch (e) {
    throw new TelegramError(`${method}: ${e.name}`); // only the error's name, so the URL with the token never reaches a log
  }
  let data = {};
  try { data = await res.json(); } catch { /* not JSON */ }
  // the description never contains the token; the URL that does is not part of the error
  if (!data.ok) throw new TelegramError(`${method}: ${data.description || `HTTP ${res.status}`}`);
  return data.result;
}

export const send = (chat, text) => call("sendMessage", { chat_id: chat, text: String(text).slice(0, 4000), disable_web_page_preview: true });

/**
 * Telegram signs each webhook call with the secret given in setWebhook. It is derived from the bot token,
 * so it changes when the token is revoked and needs no setting of its own. Allowed characters: A-Z a-z 0-9 _ -
 */
export const webhookSecret = () => createHmac("sha256", token()).update("afarinash-library-webhook").digest("base64url");

export function fromTelegram(req) {
  const given = Buffer.from(String(req.headers["x-telegram-bot-api-secret-token"] || ""));
  const expected = Buffer.from(webhookSecret());
  return token() !== "" && given.length === expected.length && timingSafeEqual(given, expected);
}

/**
 * Solar Hijri dates in the school's time zone, assembled from parts: "پنجشنبه ۲۱ آبان ۱۴۰۵", with the time
 * ("، ۱۵:۰۹") when asked. Built by hand because ICU's own long patterns for fa-IR vary between Node builds.
 */
export function faDate(date, { weekday = false, time = false } = {}) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("fa-IR-u-ca-persian-nu-arabext", {
    timeZone: "Asia/Tehran", weekday: "long", day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(date).map((p) => [p.type, p.value]));
  return `${weekday ? `${parts.weekday} ` : ""}${parts.day} ${parts.month} ${parts.year}${time ? `، ${parts.hour}:${parts.minute}` : ""}`;
}

/**
 * Fixed-window limiter. In memory: exact on one server, best-effort on Vercel, where each warm instance counts
 * separately (the same trade-off as the school's main site forms).
 */
export function limiter(limit, windowMs) {
  const hits = new Map();
  return (key) => {
    const now = Date.now();
    const e = hits.get(key);
    if (!e || now - e.start >= windowMs) {
      hits.set(key, { start: now, count: 1 });
      if (hits.size > 5000) for (const [k, v] of hits) if (now - v.start >= windowMs) hits.delete(k);
      return true;
    }
    e.count += 1;
    return e.count <= limit;
  };
}

/** The visitor's address. Vercel sets x-vercel-forwarded-for itself; anywhere else only the socket is trusted. */
export function clientIp(req) {
  if (process.env.VERCEL) return String(req.headers["x-vercel-forwarded-for"] || req.headers["x-real-ip"] || "").split(",")[0].trim();
  return req.socket?.remoteAddress || "";
}
