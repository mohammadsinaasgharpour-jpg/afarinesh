// Small helpers shared by the API functions (plain Node request/response, so they run on Vercel and in scripts/dev-server.mjs).

const MAX_BODY = 512 * 1024;

export function send(res, status, body, headers = {}) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("X-Content-Type-Options", "nosniff");
  for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);
  res.end(JSON.stringify(body));
}

export function fail(res, status, message) {
  send(res, status, { error: message }, { "Cache-Control": "no-store" });
}

export async function readJson(req) {
  if (req.body && typeof req.body === "object" && !Buffer.isBuffer(req.body)) return req.body; // Vercel parsed it already
  let raw = typeof req.body === "string" ? req.body : Buffer.isBuffer(req.body) ? req.body.toString("utf8") : "";
  if (!raw) {
    const chunks = [];
    let size = 0;
    for await (const chunk of req) {
      size += chunk.length;
      if (size > MAX_BODY) throw Object.assign(new Error("body too large"), { status: 413 });
      chunks.push(chunk);
    }
    raw = Buffer.concat(chunks).toString("utf8");
  }
  try {
    return raw ? JSON.parse(raw) : {};
  } catch {
    throw Object.assign(new Error("invalid JSON"), { status: 400 });
  }
}

export function origin(req) {
  const proto = req.headers["x-forwarded-proto"] || (req.socket?.encrypted ? "https" : "http");
  return `${proto}://${req.headers["x-forwarded-host"] || req.headers.host}`;
}

// Writes must come from this site's own pages (the session cookie is SameSite=Strict as well).
export function sameOrigin(req) {
  const from = req.headers.origin;
  if (!from) return false;
  try {
    return new URL(from).host === (req.headers["x-forwarded-host"] || req.headers.host);
  } catch {
    return false;
  }
}
