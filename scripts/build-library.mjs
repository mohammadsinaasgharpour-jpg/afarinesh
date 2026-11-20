// Builds library-php/: the library's pages, scripts and assets with every root path moved under /library
// (the same rewrite the Node mount in server/library.mjs did at run time), plus the PHP back end from
// library-php-src/. api/deploy.php copies library-php/ to public_html/library on the host.
import { cp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { extname, join } from "node:path";

const root = new URL("../", import.meta.url);
const src = new URL("library/", root);
const out = new URL("library-php/", root);

const mount = (text, ext) => {
  if (ext === ".js") return text.replaceAll('"/api/', '"/library/api/').replaceAll("'/api/", "'/library/api/").replaceAll("`${location.origin}/`", "`${location.origin}/library/`");
  if (ext === ".css") return text.replaceAll("url(/", "url(/library/");
  if (ext !== ".html") return text;
  return text.replace(/(href|src|action)=(["'])\/(?!\/)/g, "$1=$2/library/").replaceAll("https://library.afarineshshiraz.ir/", "https://afarineshshiraz.ir/library/").replaceAll("https%3A%2F%2Flibrary.afarineshshiraz.ir%2F", "https%3A%2F%2Fafarineshshiraz.ir%2Flibrary%2F").replaceAll("http://afarineshshiraz.ir/", "https://afarineshshiraz.ir/");
};

async function copyTree(from, to) {
  await mkdir(to, { recursive: true });
  for (const entry of await readdir(from, { withFileTypes: true })) {
    if (["api", "node_modules", "package.json", "package-lock.json", ".env.example"].includes(entry.name)) continue;
    const a = new URL(entry.name + (entry.isDirectory() ? "/" : ""), from), b = new URL(entry.name + (entry.isDirectory() ? "/" : ""), to);
    if (entry.isDirectory()) { await copyTree(a, b); continue; }
    const ext = extname(entry.name);
    if ([".html", ".js", ".css"].includes(ext)) await writeFile(b, mount(await readFile(a, "utf8"), ext));
    else await cp(a, b);
  }
}

await rm(out, { recursive: true, force: true });
await copyTree(src, out);
await writeFile(new URL("home.html", out), mount(await readFile(new URL("api/_lib/home.html", src), "utf8"), ".html"));
await cp(new URL("library-php-src/", root), out, { recursive: true });
const sitemap = new URL("sitemap.xml", out);
await writeFile(sitemap, (await readFile(sitemap, "utf8")).replaceAll("https://library.afarineshshiraz.ir/", "https://afarineshshiraz.ir/library/"));
console.log("built library-php/");
