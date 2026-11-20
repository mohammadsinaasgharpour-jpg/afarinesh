// IndexNow: tells Bing (and the other IndexNow engines) that a page changed, so it is re-crawled sooner.
// The key is public by design: it must match the file /<KEY>.txt at the site root. Notifications only go out
// from the production deployment, never from previews or the local dev server.
export const KEY = "34750ca66a01412cbea9d29ba0961fa0";
export const SITE = (process.env.SITE_URL || "https://library.afarineshshiraz.ir").replace(/\/$/, "");

/** @returns {Promise<number|null>} the IndexNow HTTP status, or null when skipped or unreachable */
export async function notify(paths = ["/"], { force = false } = {}) {
  if (!force && process.env.VERCEL_ENV !== "production") return null;
  try {
    const res = await fetch("https://api.indexnow.org/indexnow", {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({
        host: new URL(SITE).host, key: KEY, keyLocation: `${SITE}/${KEY}.txt`,
        urlList: paths.map((p) => new URL(p, SITE).href),
      }),
      signal: AbortSignal.timeout(3000), // never hold up a save for long
    });
    if (res.status !== 200 && res.status !== 202) console.error("indexnow:", res.status);
    return res.status;
  } catch (e) {
    console.error("indexnow:", e.name); // a missed notification only means Bing finds the change later
    return null;
  }
}
