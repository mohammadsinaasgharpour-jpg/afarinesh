// Writes vercel.json with the same security headers the local server sends.
// Re-run (npm run build) whenever the inline script in public/index.html changes: its CSP hash lives here.
import { readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { buildSecurityHeaders, inlineScriptHashes } from "../server/app.mjs";

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
    headers: [
      { source: "/(.*)", headers: toList(buildSecurityHeaders(inlineScriptHashes(html))) },
      // file names are not content-hashed: code revalidates, media is cached for a week
      { source: "/assets/(img|fonts)/(.*)", headers: [{ key: "Cache-Control", value: "public, max-age=604800" }] },
      { source: "/assets/(css|js)/(.*)", headers: [{ key: "Cache-Control", value: "public, max-age=0, must-revalidate" }] },
    ],
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await writeFile(new URL("vercel.json", root), JSON.stringify(await buildVercelConfig(), null, 2) + "\n");
  console.log("wrote vercel.json");
}
