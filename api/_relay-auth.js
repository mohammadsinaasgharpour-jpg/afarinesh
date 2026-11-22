// Checks that a relay request came from the school's host. The host signs with an Ed25519 key it made itself;
// only the public half is here (RELAY_PUBLIC_KEY, copied from https://afarineshshiraz.ir/api/relay-key), so
// there is no shared secret to set. A RELAY_SECRET in the Vercel settings is still accepted (HMAC-SHA256).
import { createHmac, createPublicKey, timingSafeEqual, verify } from "node:crypto";
import { RELAY_PUBLIC_KEY } from "./_relay-key.js";

const publicKey = RELAY_PUBLIC_KEY
  ? createPublicKey({ key: { kty: "OKP", crv: "Ed25519", x: Buffer.from(RELAY_PUBLIC_KEY, "base64").toString("base64url") }, format: "jwk" })
  : null;

export function fromSchoolHost(req, body) {
  const sig = String(req.headers["x-relay-ed25519"] || "");
  if (sig && publicKey) {
    try { if (verify(null, body, publicKey, Buffer.from(sig, "base64"))) return true; } catch { /* malformed signature */ }
  }
  const secret = process.env.RELAY_SECRET;
  const given = String(req.headers["x-relay-signature"] || "");
  if (!secret || !given) return false;
  const expected = createHmac("sha256", secret).update(body).digest("hex");
  return given.length === expected.length && timingSafeEqual(Buffer.from(given), Buffer.from(expected));
}
