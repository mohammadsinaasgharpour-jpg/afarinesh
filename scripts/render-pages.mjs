// Builds public/<page>.html from content/pages/<page>.html, filling the shared blocks (icon sprite,
// header, footer, floating buttons and dialogs, theme script) from public/index.html so every page
// stays identical to the home page. The theme script must match byte for byte: its CSP hash is taken
// from index.html.
import { readFile, writeFile, readdir, mkdir } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const root = new URL("../", import.meta.url);

function between(html, start, end, label) {
  const a = html.indexOf(start);
  const b = a < 0 ? -1 : html.indexOf(end, a);
  if (a < 0 || b < 0) throw new Error(`shared block "${label}" not found in index.html`);
  return html.slice(a, b + end.length);
}

const fa = (n) => String(n).replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[d]);
const options = (from, to, pad = 0) => Array.from({ length: Math.abs(to - from) + 1 }, (_, i) => from + Math.sign(to - from) * i)
  .map((n) => `<option value="${String(n).padStart(pad, "0")}">${fa(n)}</option>`).join("");

export function sharedBlocks(index) {
  const header = between(index, '<header class="site-header"', "</header>", "header")
    // section links point back to the home page
    .replace(/href="#(\w+)"/g, 'href="/#$1"');
  return {
    "theme-script": between(index, "<script>(function(){var t;", "</script>", "theme-script"),
    sprite: between(index, '<svg width="0" height="0" class="sprite"', "</svg>\n", "sprite").trimEnd(),
    header,
    footer: between(index, '<footer class="site-footer">', "</footer>", "footer"),
    floating: between(index, '<a class="insta-fab"', "data-toasts></div>", "floating"),
    css: between(index, "<!-- css:start -->", "<!-- css:end -->", "css"),
    days: options(1, 31, 2),
    years: options(1405, 1375),
  };
}

export function renderPage(template, blocks) {
  return template.replace(/<!-- shared:([\w-]+) -->/g, (m, name) => {
    if (!(name in blocks)) throw new Error(`unknown shared block ${name}`);
    return blocks[name];
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const blocks = sharedBlocks(await readFile(new URL("public/index.html", root), "utf8"));
  const dir = new URL("content/pages/", root);
  // content/pages/blog/<slug>.html becomes public/blog/<slug>.html, served at /blog/<slug>
  for (const name of (await readdir(dir, { recursive: true })).map((f) => f.split("\\").join("/")).filter((f) => f.endsWith(".html"))) {
    const html = renderPage(await readFile(new URL(name, dir), "utf8"), blocks);
    if (name.includes("/")) await mkdir(new URL(`public/${name.slice(0, name.lastIndexOf("/"))}/`, root), { recursive: true });
    await writeFile(new URL(`public/${name}`, root), html);
    console.log(`rendered ${name}`);
  }
}
