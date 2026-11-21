// Gemini pass-through for the school's host in Iran: Google refuses Gemini API calls from Iranian servers.
// The host signs each request with RELAY_SECRET (HMAC-SHA256 over the raw body), as for the Telegram relay;
// only signed, recent requests to the generateContent and models paths are forwarded. Nothing is stored here.
import { createHmac, timingSafeEqual } from "node:crypto";

const MAX = 3 * 1024 * 1024; // a 45-second recording, base64-encoded, plus the prompt
const PATH = /^models(\?pageSize=\d+|\/[a-z0-9.-]+:generateContent)$/;

async function rawBody(req) {
  const chunks = [];
  let size = 0;
  for await (const c of req) { size += c.length; if (size > MAX) return null; chunks.push(c); }
  return Buffer.concat(chunks);
}

export default async function gemini(req, res) {
  const reply = (status, body) => { res.statusCode = status; res.setHeader("Content-Type", "application/json"); res.setHeader("Cache-Control", "no-store"); res.end(JSON.stringify(body)); };
  if (req.method !== "POST") return reply(405, { error: "method_not_allowed" });
  const secret = process.env.RELAY_SECRET;
  if (!secret) return reply(503, { error: "relay_not_configured" });
  const body = await rawBody(req);
  if (!body) return reply(413, { error: "too_large" });
  const expected = createHmac("sha256", secret).update(body).digest("hex");
  const given = String(req.headers["x-relay-signature"] || "");
  if (given.length !== expected.length || !timingSafeEqual(Buffer.from(given), Buffer.from(expected))) return reply(401, { error: "bad_signature" });
  let msg;
  try { msg = JSON.parse(body.toString("utf8")); } catch { return reply(400, { error: "bad_json" }); }
  if (Math.abs(Date.now() / 1000 - Number(msg.ts)) > 300 || typeof msg.key !== "string" || !PATH.test(String(msg.path))) return reply(400, { error: "invalid" });
  const upstream = await fetch(`https://generativelanguage.googleapis.com/v1beta/${msg.path}`, {
    method: msg.body ? "POST" : "GET",
    headers: { "x-goog-api-key": msg.key, "Content-Type": "application/json" },
    body: msg.body ? JSON.stringify(msg.body) : undefined,
    signal: AbortSignal.timeout(30000),
  }).catch(() => null);
  if (!upstream) return reply(504, { error: "gemini_unreachable" });
  // Gemini's status is passed back so the host can move on to its next key on 429 and the like
  const data = await upstream.json().catch(() => ({}));
  return reply(upstream.status, data);
}
