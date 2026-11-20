// Admin sign-in: one shared password kept in the ADMIN_PASSWORD environment variable (set in the Vercel
// dashboard, never in this repository), and a signed, HttpOnly session cookie. Changing the password
// signs every existing session out, because the cookie key is derived from it.
import { createHash, createHmac, timingSafeEqual } from "node:crypto";

const COOKIE = "afarinash_admin";
const MAX_AGE = 8 * 60 * 60; // seconds
const MIN_LENGTH = 10;

const sha256 = (s) => createHash("sha256").update(String(s), "utf8").digest();

export function configured() {
  return (process.env.ADMIN_PASSWORD || "").length >= MIN_LENGTH;
}

function sessionKey() {
  return sha256(`afarinash-admin-session\0${process.env.ADMIN_PASSWORD}`);
}

export function checkPassword(given) {
  if (!configured() || typeof given !== "string") return false;
  return timingSafeEqual(sha256(given), sha256(process.env.ADMIN_PASSWORD));
}

function sign(value) {
  return createHmac("sha256", sessionKey()).update(value).digest("base64url");
}

export function startSession(res) {
  const exp = String(Math.floor(Date.now() / 1000) + MAX_AGE);
  res.setHeader("Set-Cookie",
    `${COOKIE}=${exp}.${sign(exp)}; Path=/; Max-Age=${MAX_AGE}; HttpOnly; Secure; SameSite=Strict`);
}

export function endSession(res) {
  res.setHeader("Set-Cookie", `${COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Strict`);
}

export function isAdmin(req) {
  if (!configured()) return false;
  const cookie = (req.headers.cookie || "").split(/;\s*/).find((c) => c.startsWith(`${COOKIE}=`));
  if (!cookie) return false;
  const [exp, sig] = cookie.slice(COOKIE.length + 1).split(".");
  if (!exp || !sig || !/^\d+$/.test(exp) || Number(exp) < Date.now() / 1000) return false;
  const expected = Buffer.from(sign(exp));
  const got = Buffer.from(sig);
  return got.length === expected.length && timingSafeEqual(got, expected);
}
