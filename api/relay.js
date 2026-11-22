// Telegram relay for the school's own host in Iran, which cannot reach api.telegram.org. Only messages
// signed by the host (_relay-auth.js) and recent are sent, as plain text to TELEGRAM_CHAT_ID. Nothing is stored here.
import { fromSchoolHost } from "./_relay-auth.js";

const MAX = 8 * 1024;

async function rawBody(req) {
  const chunks = [];
  let size = 0;
  for await (const c of req) { size += c.length; if (size > MAX) return null; chunks.push(c); }
  return Buffer.concat(chunks);
}

export default async function relay(req, res) {
  const reply = (status, body) => { res.statusCode = status; res.setHeader("Content-Type", "application/json"); res.setHeader("Cache-Control", "no-store"); res.end(JSON.stringify(body)); };
  if (req.method !== "POST") return reply(405, { error: "method_not_allowed" });
  const { TELEGRAM_BOT_TOKEN: token, TELEGRAM_CHAT_ID: chatId } = process.env;
  if (!token || !chatId) return reply(503, { error: "relay_not_configured" });
  const body = await rawBody(req);
  if (!body) return reply(413, { error: "too_large" });
  if (!fromSchoolHost(req, body)) return reply(401, { error: "bad_signature" });
  let msg;
  try { msg = JSON.parse(body.toString("utf8")); } catch { return reply(400, { error: "bad_json" }); }
  // a captured request cannot be replayed later
  if (typeof msg.text !== "string" || !msg.text || Math.abs(Date.now() / 1000 - Number(msg.ts)) > 300) return reply(400, { error: "invalid" });
  const tg = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text: msg.text.slice(0, 4096), disable_web_page_preview: true }),
    signal: AbortSignal.timeout(8000),
  }).catch(() => null);
  return tg?.ok ? reply(200, { ok: true }) : reply(502, { error: "telegram_failed" });
}
