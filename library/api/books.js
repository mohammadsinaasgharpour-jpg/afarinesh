// GET /api/books: the public catalog (only the public bibliographic fields are ever stored).
import { fail, origin, send } from "./_lib/http.js";
import { current } from "./_lib/store.js";

export default async function handler(req, res) {
  if (req.method !== "GET") return fail(res, 405, "method not allowed");
  try {
    const { data } = await current((process.env.SITE_URL || origin(req)).replace(/\/$/, ""));
    // the books are indexed through the homepage's HTML; the raw JSON itself needs no search listing
    send(res, 200, data, { "Cache-Control": "public, max-age=0, s-maxage=15, stale-while-revalidate=60", "X-Robots-Tag": "noindex" });
  } catch (e) {
    console.error("books:", e.message);
    fail(res, 500, "catalog unavailable");
  }
}
