// php/sitemap.php, run with the PHP command line against a made-up web root and against the real built site.
// Skipped where PHP is not installed; the GitHub test workflow has it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, writeFile, cp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadArticles, tehranToday } from "../scripts/render-blog.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
let php = true;
try { execFileSync("php", ["-v"], { stdio: "ignore" }); } catch { php = false; }
const opts = { skip: php ? false : "PHP is not installed here (it runs in CI)" };

/** The sitemap for web root `dir`, page `page`, as the endpoint would answer. */
function sitemap(dir, page = 0) {
  const code = `define('SITEMAP_LIB', 1); require ${JSON.stringify(join(dir, "sitemap.php"))}; [$s, $x] = render_sitemap(${JSON.stringify(dir)}, ${page}); echo $s, "\\n", $x;`;
  const out = execFileSync("php", ["-r", code], { encoding: "utf8" });
  const nl = out.indexOf("\n");
  return { status: Number(out.slice(0, nl)), xml: out.slice(nl + 1) };
}
const page = (canonical, extra = "", body = "") => `<!doctype html><html><head><title>t</title><link rel="canonical" href="https://afarineshshiraz.ir${canonical}">${extra}</head><body>${body}</body></html>`;

test("the sitemap lists indexable pages and leaves out private, noindex, redirecting and duplicate ones", opts, async () => {
  const dir = await mkdtemp(join(tmpdir(), "sitemap-"));
  try {
    await cp(join(root, "php/sitemap.php"), join(dir, "sitemap.php"));
    for (const d of ["blog", "admin", "assets/img/school", "library"]) await mkdir(join(dir, d), { recursive: true });
    await writeFile(join(dir, "assets/img/school/yard-1280.webp"), "x");
    await writeFile(join(dir, "index.html"), page("/", '<link rel="alternate" hreflang="en" href="https://afarineshshiraz.ir/en">', '<img src="/assets/img/school/yard-640.webp" alt="حیاط">'));
    await writeFile(join(dir, "en.html"), page("/en", '<link rel="alternate" hreflang="fa" href="https://afarineshshiraz.ir/">'));
    await writeFile(join(dir, "blog/index.html"), page("/blog/"));
    await writeFile(join(dir, "blog/post-a.html"), page("/blog/post-a", '<meta property="article:published_time" content="2026-11-23">'));
    await writeFile(join(dir, "hidden.html"), page("/hidden", '<meta name="robots" content="noindex">'));
    await writeFile(join(dir, "moved.html"), page("/moved", '<meta http-equiv="refresh" content="0;url=/">'));
    await writeFile(join(dir, "copy.html"), page("/blog/post-a"));
    await writeFile(join(dir, "nocanon.html"), "<html><head><title>x</title></head><body></body></html>");
    await writeFile(join(dir, "404.html"), page("/404"));
    await writeFile(join(dir, "admin.html"), page("/admin"));
    await writeFile(join(dir, "admin/panel.html"), page("/admin/panel"));
    await writeFile(join(dir, "library/sitemap.xml"), '<urlset><url><loc>https://afarineshshiraz.ir/library/</loc></url></urlset>');

    const { status, xml } = sitemap(dir);
    assert.equal(status, 200);
    const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].replace("https://afarineshshiraz.ir", ""));
    assert.deepEqual(locs.sort(), ["/", "/blog/", "/blog/post-a", "/en", "/library/"].sort());
    assert.match(xml, /<lastmod>2026-11-23<\/lastmod>/);
    assert.match(xml, /<xhtml:link rel="alternate" hreflang="en" href="https:\/\/afarineshshiraz.ir\/en"\/>/);
    // the large copy of the photo is listed
    assert.match(xml, /<image:loc>https:\/\/afarineshshiraz.ir\/assets\/img\/school\/yard-1280.webp<\/image:loc><image:title>حیاط<\/image:title>/);

    // a page added later is listed on the next request, with no list to edit
    await writeFile(join(dir, "blog/post-b.html"), page("/blog/post-b"));
    assert.match(sitemap(dir).xml, /<loc>https:\/\/afarineshshiraz.ir\/blog\/post-b<\/loc>/);
    // a page number past the end does not exist
    assert.equal(sitemap(dir, 2).status, 404);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("the built site's sitemap has every public page and every published article", opts, async () => {
  const dir = await mkdtemp(join(tmpdir(), "sitemap-site-"));
  try {
    await cp(join(root, "public"), dir, { recursive: true });
    await cp(join(root, "php/sitemap.php"), join(dir, "sitemap.php"));
    await cp(join(root, "library-php/sitemap.xml"), join(dir, "library/sitemap.xml")).catch(async () => {
      await mkdir(join(dir, "library"), { recursive: true });
      await cp(join(root, "library-php/sitemap.xml"), join(dir, "library/sitemap.xml"));
    });
    const { xml } = sitemap(dir);
    for (const p of ["/", "/en", "/blog/", "/pre-registration", "/careers", "/privacy", "/library/"]) assert.ok(xml.includes(`<loc>https://afarineshshiraz.ir${p}</loc>`), `${p} missing`);
    const today = tehranToday();
    for (const a of await loadArticles()) {
      const listed = xml.includes(`<loc>https://afarineshshiraz.ir/blog/${a.slug}</loc>`);
      assert.equal(listed, a.date <= today, `${a.slug} (${a.date})`);
    }
    assert.doesNotMatch(xml, /\/admin|404|google[0-9a-f]{16}/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
