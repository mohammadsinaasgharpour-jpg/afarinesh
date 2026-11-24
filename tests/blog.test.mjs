import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { parseArticle, loadArticles, tehranToday } from "../scripts/render-blog.mjs";

const root = new URL("../", import.meta.url);

test("an article without its meta block is refused", () => {
  assert.throws(() => parseArticle("x", "<section>body</section>"), /meta/);
  assert.throws(() => parseArticle("x", '<!--meta {"title": "t"} -->body'), /description/);
});

test("every published article is built with its own canonical, description, one h1 and BlogPosting schema", async () => {
  const today = tehranToday();
  const all = await loadArticles();
  const slugs = all.filter((a) => a.date <= today).map((a) => a.slug);
  assert.ok(slugs.length >= 8);
  // articles whose day has not come are not built (they appear with the weekly rebuild)
  const built = new Set((await readdir(new URL("public/blog/", root))).map((f) => f.replace(/.html$/, "")));
  for (const a of all.filter((x) => x.date > today)) assert.ok(!built.has(a.slug), `${a.slug} is published before ${a.date}`);
  for (const slug of slugs) {
    const html = await readFile(new URL(`public/blog/${slug}.html`, root), "utf8");
    assert.match(html, new RegExp(`<link rel="canonical" href="https://afarineshshiraz.ir/blog/${slug}">`));
    assert.match(html, /<meta name="description" content="[^"]{80,}">/);
    assert.equal(html.match(/<h1/g).length, 1);
    assert.match(html, /"@type":"BlogPosting"/);
    assert.ok(!html.includes("<!-- shared:"), `${slug}: shared blocks were not filled`);
  }
});

test("a year of weekly articles is scheduled, one per Saturday", async () => {
  const later = (await loadArticles()).filter((a) => a.date > "2026-11-23").map((a) => a.date).sort();
  assert.ok(later.length >= 52);
  for (let i = 1; i < later.length; i++) assert.equal((Date.parse(later[i]) - Date.parse(later[i - 1])) / 864e5, 7, later[i]);
  for (const d of later) assert.equal(new Date(`${d}T12:00:00Z`).getUTCDay(), 6, `${d} is not a Saturday`);
});
