// Gemini pass-through for the school's host in Iran: Google refuses Gemini API calls from Iranian servers.
// Only requests signed by the host (_relay-auth.js), recent, and to the generateContent and models paths are
// forwarded. A request with no Gemini key goes to Vercel's AI Gateway instead, which this project reaches with
// its own OIDC token, so voice input works before anyone has made a Gemini key. Nothing is stored here.
import { fromSchoolHost } from "./_relay-auth.js";

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
  const body = await rawBody(req);
  if (!body) return reply(413, { error: "too_large" });
  if (!fromSchoolHost(req, body)) return reply(401, { error: "bad_signature" });
  let msg;
  try { msg = JSON.parse(body.toString("utf8")); } catch { return reply(400, { error: "bad_json" }); }
  if (Math.abs(Date.now() / 1000 - Number(msg.ts)) > 300 || typeof msg.key !== "string" || !PATH.test(String(msg.path))) return reply(400, { error: "invalid" });
  if (!msg.key) return viaGateway(req, msg, reply);
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

/**
 * The same Gemini request through Vercel's AI Gateway (OpenAI-style chat API), answered in Gemini's own shape so
 * the host reads both the same way. The token comes with each request to this function.
 */
async function viaGateway(req, msg, reply) {
  const token = process.env.AI_GATEWAY_API_KEY || req.headers["x-vercel-oidc-token"] || process.env.VERCEL_OIDC_TOKEN;
  if (!token) return reply(503, { error: "gateway_not_available" });
  const model = String(msg.path).match(/^models\/([a-z0-9.-]+):generateContent$/)?.[1];
  const parts = msg.body?.contents?.[0]?.parts;
  if (!model || !Array.isArray(parts)) return reply(400, { error: "invalid" });
  const content = parts.map((p) => p.inlineData
    ? { type: "file", file: { data: `data:${p.inlineData.mimeType};base64,${p.inlineData.data}`, filename: `voice.${String(p.inlineData.mimeType).split("/")[1] || "webm"}` } }
    : { type: "text", text: String(p.text ?? "") });
  const cfg = msg.body.generationConfig || {};
  const upstream = await fetch("https://ai-gateway.vercel.sh/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: `google/${model}`, messages: [{ role: "user", content }], temperature: cfg.temperature ?? 0, max_tokens: cfg.maxOutputTokens ?? 300 }),
    signal: AbortSignal.timeout(30000),
  }).catch(() => null);
  if (!upstream) return reply(504, { error: "gateway_unreachable" });
  const data = await upstream.json().catch(() => ({}));
  if (!upstream.ok) return reply(upstream.status, { error: "gateway_error", detail: data?.error?.message || data?.error?.type || "" });
  const text = data?.choices?.[0]?.message?.content ?? "";
  return reply(200, { candidates: [{ content: { parts: [{ text }] } }] });
}
