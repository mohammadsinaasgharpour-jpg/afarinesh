// Writes vercel.json with the same security headers the local server sends.
// Re-run (npm run build) whenever the inline script in public/index.html changes: its CSP hash lives here.
import { readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { buildSecurityHeaders, inlineScriptHashes, inlineStyleHashes } from "../server/app.mjs";

const root = new URL("../", import.meta.url);
const toList = (obj) => Object.entries(obj).map(([key, value]) => ({ key, value }));

export async function buildVercelConfig() {
  const html = await readFile(new URL("public/index.html", root), "utf8");
  return {
    $schema: "https://openapi.vercel.sh/vercel.json",
    buildCommand: "",
    outputDirectory: "public",
    framework: null,
    cleanUrls: true,
    trailingSlash: false,
    // every page and form address goes to the real site, so no visitor fills a form whose message never reaches the panel
    redirects: [{ source: "/:path((?!api/relay$).*)", destination: "https://afarineshshiraz.ir/:path", permanent: true }],
    headers: [
      { source: "/(.*)", headers: toList(buildSecurityHeaders(inlineScriptHashes(html), inlineStyleHashes(html))) },
      // the copy on Vercel only carries the Telegram relay; the site itself lives at afarineshshiraz.ir and only
      // that address may appear in search results
      { source: "/(.*)", headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }] },
      // file names are not content-hashed: code revalidates, pictures are cached for a month, fonts for a year
      { source: "/assets/fonts/(.*)", headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }] },
      { source: "/assets/img/(.*)", headers: [{ key: "Cache-Control", value: "public, max-age=2592000, stale-while-revalidate=86400" }] },
      { source: "/assets/(css|js)/(.*)", headers: [{ key: "Cache-Control", value: "public, max-age=0, must-revalidate" }] },
    ],
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await writeFile(new URL("vercel.json", root), JSON.stringify(await buildVercelConfig(), null, 2) + "\n");
  console.log("wrote vercel.json");
}
