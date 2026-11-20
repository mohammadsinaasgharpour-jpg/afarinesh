// GET /api/session: is this browser signed in?   POST: sign in with the admin password.   DELETE: sign out.
import { checkPassword, configured, endSession, isAdmin, startSession } from "./_lib/auth.js";
import { fail, readJson, sameOrigin, send } from "./_lib/http.js";
import { releaseAttempt, reserveAttempt } from "./_lib/limit.js";

const NO_STORE = { "Cache-Control": "no-store" };

export default async function handler(req, res) {
  if (req.method === "GET") return send(res, 200, { admin: isAdmin(req), configured: configured() }, NO_STORE);
  if (!sameOrigin(req)) return fail(res, 403, "forbidden");

  if (req.method === "DELETE") {
    endSession(res);
    return send(res, 200, { admin: false }, NO_STORE);
  }
  if (req.method !== "POST") return fail(res, 405, "method not allowed");
  if (!configured()) return fail(res, 503, "not configured");

  let body;
  try {
    body = await readJson(req);
  } catch (e) {
    return fail(res, e.status || 400, "bad request");
  }
  if (typeof body.password !== "string" || body.password.length > 200) return fail(res, 400, "bad request");

  // counted before the password is compared, so parallel guesses can't all be checked before the count catches
  // up; while locked out even the right password is refused, so guessing gains nothing
  const wait = await reserveAttempt(req);
  if (wait) return send(res, 429, { error: "too many attempts", retryAfter: wait }, { ...NO_STORE, "Retry-After": String(wait) });

  if (!checkPassword(body.password)) {
    await new Promise((r) => setTimeout(r, 900)); // slows down password guessing
    return fail(res, 401, "wrong password");
  }
  await releaseAttempt(req);
  startSession(res);
  send(res, 200, { admin: true }, NO_STORE);
}
