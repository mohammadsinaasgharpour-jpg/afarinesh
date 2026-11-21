import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { parseArticle, renderSitemap } from "../scripts/render-blog.mjs";

const root = new URL("../", import.meta.url);

test("an article without its meta block is refused", () => {
  assert.throws(() => parseArticle("x", "<section>body</section>"), /meta/);
  assert.throws(() => parseArticle("x", '<!--meta {"title": "t"} -->body'), /description/);
});

test("every built article has its own canonical, description, one h1 and BlogPosting schema", async () => {
  const slugs = (await readdir(new URL("content/blog/", root))).filter((f) => f.endsWith(".html")).map((f) => f.slice(0, -5));
  assert.ok(slugs.length >= 3);
  const sitemap = await readFile(new URL("public/sitemap.xml", root), "utf8");
  for (const slug of slugs) {
    const html = await readFile(new URL(`public/blog/${slug}.html`, root), "utf8");
    assert.match(html, new RegExp(`<link rel="canonical" href="https://afarineshshiraz.ir/blog/${slug}">`));
    assert.match(html, /<meta name="description" content="[^"]{80,}">/);
    assert.equal(html.match(/<h1/g).length, 1);
    assert.match(html, /"@type":"BlogPosting"/);
    assert.ok(!html.includes("<!-- shared:"), `${slug}: shared blocks were not filled`);
    assert.ok(sitemap.includes(`<loc>https://afarineshshiraz.ir/blog/${slug}</loc>`), `${slug} missing from sitemap`);
  }
});

test("the sitemap lists the library and the home page photos, and no admin page", () => {
  const xml = renderSitemap([{ slug: "a", date: "2026-11-21" }], [["/assets/img/school/yard-1280.webp", "حیاط"]], () => "2026-11-20");
  assert.match(xml, /<loc>https:\/\/afarineshshiraz.ir\/library\/<\/loc>/);
  assert.match(xml, /<image:loc>https:\/\/afarineshshiraz.ir\/assets\/img\/school\/yard-1280.webp<\/image:loc>/);
  assert.doesNotMatch(xml, /admin/);
});
