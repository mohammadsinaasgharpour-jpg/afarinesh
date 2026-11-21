// Builds the blog from content/blog/<slug>.html: each file starts with a <!--meta {...}--> JSON block
// (title, description, date, dateFa, lede) followed by the article body. Writes content/pages/blog/<slug>.html
// and content/pages/blog/index.html (render-pages then adds the shared header and footer), and public/sitemap.xml
// with every page, every article and the home page's photos for Google Images.
import { readFile, writeFile, readdir, mkdir } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { execFileSync } from "node:child_process";

const root = new URL("../", import.meta.url);
const SITE = "https://afarineshshiraz.ir";
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const ld = (obj) => `<script type="application/ld+json">\n${JSON.stringify(obj).replace(/</g, "\\u003c")}\n</script>`;

export function parseArticle(slug, src) {
  const m = src.match(/^<!--meta\s*([\s\S]*?)-->\s*/);
  if (!m) throw new Error(`content/blog/${slug}.html has no <!--meta {...}--> block`);
  const meta = JSON.parse(m[1]);
  for (const k of ["title", "description", "date", "dateFa", "lede"]) if (!meta[k]) throw new Error(`${slug}: meta.${k} is missing`);
  return { slug, ...meta, body: src.slice(m[0].length).trim() };
}

function head({ title, description, url, type, extraLd }) {
  return `<!doctype html>
<html lang="fa" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${url}">
<meta name="theme-color" content="#e8edf2">
<meta name="color-scheme" content="light dark">
<meta name="robots" content="index, follow, max-image-preview:large">
<meta property="og:type" content="${type}">
<meta property="og:locale" content="fa_IR">
<meta property="og:site_name" content="دبیرستان آفرینش">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${url}">
<meta property="og:image" content="${SITE}/assets/img/og-cover.jpg">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="/assets/img/icon-48.png" type="image/png" sizes="48x48">
<link rel="icon" href="/assets/img/icon-192.png" sizes="192x192">
<link rel="apple-touch-icon" href="/assets/img/icon-180.png">
<link rel="manifest" href="/manifest.webmanifest">
<link rel="preload" href="/assets/fonts/estedad-arabic.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="/assets/fonts/lalezar-arabic.woff2" as="font" type="font/woff2" crossorigin>
<!-- shared:theme-script -->
<!-- shared:css -->
<link rel="modulepreload" href="/assets/js/common.js">
<script type="module" src="/assets/js/page.js"></script>
${extraLd.map(ld).join("\n")}
</head>
<body>
<a class="skip" href="#main">رفتن به محتوای اصلی</a>
<!-- shared:sprite -->
<!-- shared:header -->
`;
}

const tail = `
<!-- shared:footer -->
<!-- shared:floating -->
</body>
</html>
`;

const crumbsLd = (items) => ({ "@context": "https://schema.org", "@type": "BreadcrumbList",
  itemListElement: items.map(([name, item], i) => ({ "@type": "ListItem", position: i + 1, name, item })) });

export function renderArticle(a, all) {
  const url = `${SITE}/blog/${a.slug}`;
  const others = all.filter((o) => o.slug !== a.slug);
  const more = others.length ? `
      <section class="more-posts">
        <h2>مطالب دیگر</h2>
        <ul>${others.map((o) => `<li><a href="/blog/${o.slug}">${esc(o.title)}</a></li>`).join("")}</ul>
      </section>` : "";
  return head({
    title: `${a.title} | دبیرستان آفرینش شیراز`, description: a.description, url, type: "article",
    extraLd: [
      { "@context": "https://schema.org", "@type": "BlogPosting", headline: a.title, description: a.description, inLanguage: "fa-IR",
        datePublished: a.date, dateModified: a.updated || a.date, mainEntityOfPage: url, image: `${SITE}/assets/img/og-cover.jpg`,
        author: { "@type": "Organization", name: "دبیرستان غیردولتی آفرینش شیراز", url: `${SITE}/` },
        publisher: { "@id": `${SITE}/#school` } },
      crumbsLd([["دبیرستان آفرینش", `${SITE}/`], ["مطالب برای والدین", `${SITE}/blog/`], [a.title, url]]),
    ],
  }) + `
<main id="main" tabindex="-1" class="form-page">
  <article>
  <header class="page-hero">
    <div class="wrap narrow">
      <nav class="crumbs" aria-label="مسیر صفحه"><a href="/">صفحه اصلی</a><span aria-hidden="true">‹</span><a href="/blog/">مطالب</a><span aria-hidden="true">‹</span><span aria-current="page">${esc(a.short || a.title)}</span></nav>
      <a class="context-back" data-context-back href="/blog/"><svg class="ic" aria-hidden="true"><use href="#i-back"/></svg><span>همه‌ی مطالب</span></a>
      <h1 class="h1">${esc(a.title)}</h1>
      <p class="lede">${esc(a.lede)}</p>
      <p class="post-date"><time datetime="${a.date}">${esc(a.dateFa)}</time> · دبیرستان آفرینش</p>
    </div>
  </header>
  <div class="section form-section">
    <div class="wrap narrow prose">
${a.body}
      <section class="post-cta">
        <h2>برای سال تحصیلی ۱۴۰۶-۱۴۰۷</h2>
        <p>پیش‌ثبت‌نام پایه‌های هفتم، هشتم و نهم در سایت باز است. اگر پیش از ثبت‌نام پرسشی دارید، از صفحه‌ی اصلی درخواست تماس مشاور بدهید.</p>
        <p><a class="btn btn-cta" href="/pre-registration">پیش‌ثبت‌نام آنلاین</a></p>
      </section>${more}
    </div>
  </div>
  </article>
</main>
` + tail;
}

export function renderIndex(all) {
  const url = `${SITE}/blog/`;
  const items = all.map((a) => `
      <section class="post-card">
        <h2><a href="/blog/${a.slug}">${esc(a.title)}</a></h2>
        <p>${esc(a.description)}</p>
        <p class="post-date"><time datetime="${a.date}">${esc(a.dateFa)}</time></p>
      </section>`).join("");
  return head({
    title: "مطالب برای والدین | دبیرستان غیردولتی آفرینش شیراز",
    description: "راهنمای والدین برای انتخاب مدرسه‌ی دوره اول متوسطه در شیراز، مراحل پیش‌ثبت‌نام دبیرستان آفرینش و آماده شدن برای پایه‌ی هفتم.",
    url, type: "website",
    extraLd: [
      { "@context": "https://schema.org", "@type": "Blog", name: "مطالب دبیرستان آفرینش برای والدین", url, inLanguage: "fa-IR", publisher: { "@id": `${SITE}/#school` },
        blogPost: all.map((a) => ({ "@type": "BlogPosting", headline: a.title, url: `${SITE}/blog/${a.slug}`, datePublished: a.date })) },
      crumbsLd([["دبیرستان آفرینش", `${SITE}/`], ["مطالب برای والدین", url]]),
    ],
  }) + `
<main id="main" tabindex="-1" class="form-page">
  <section class="page-hero">
    <div class="wrap narrow">
      <nav class="crumbs" aria-label="مسیر صفحه"><a href="/">صفحه اصلی</a><span aria-hidden="true">‹</span><span aria-current="page">مطالب</span></nav>
      <a class="context-back" data-context-back href="/"><svg class="ic" aria-hidden="true"><use href="#i-back"/></svg><span>بازگشت به صفحه اصلی</span></a>
      <h1 class="h1">مطالب برای والدین</h1>
      <p class="lede">نوشته‌هایی از دبیرستان آفرینش برای خانواده‌هایی که برای دوره اول متوسطه‌ی پسرشان در شیراز مدرسه انتخاب می‌کنند.</p>
    </div>
  </section>
  <section class="section form-section">
    <div class="wrap narrow prose">${items}
    </div>
  </section>
</main>
` + tail;
}

/** Every indexable page; the home page also lists its photos, which Google Images can then show. */
export function renderSitemap(all, photos, changed) {
  const pages = [
    ["/", changed("public/index.html"), "1.0", photos],
    ["/pre-registration", changed("content/pages/pre-registration.html"), "0.9"],
    ["/blog/", all[0]?.date, "0.7"],
    ...all.map((a) => [`/blog/${a.slug}`, a.updated || a.date, "0.6"]),
    ["/library/", changed("library-php-src"), "0.6"],
    ["/careers", changed("content/pages/careers.html"), "0.4"],
    ["/privacy", changed("content/pages/privacy.html"), "0.3"],
  ];
  const urls = pages.map(([path, mod, prio, imgs = []]) => `  <url><loc>${SITE}${path}</loc><lastmod>${mod}</lastmod><priority>${prio}</priority>${imgs
    .map(([src, alt]) => `\n    <image:image><image:loc>${SITE}${src}</image:loc><image:title>${esc(alt)}</image:title></image:image>`).join("")}${imgs.length ? "\n  " : ""}</url>`);
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
${urls.join("\n")}
</urlset>
`;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const dir = new URL("content/blog/", root);
  const all = [];
  for (const f of (await readdir(dir)).filter((n) => n.endsWith(".html"))) all.push(parseArticle(f.slice(0, -5), await readFile(new URL(f, dir), "utf8")));
  all.sort((x, y) => (x.date < y.date ? 1 : x.date > y.date ? -1 : x.slug.localeCompare(y.slug)));
  await mkdir(new URL("content/pages/blog/", root), { recursive: true });
  for (const a of all) await writeFile(new URL(`content/pages/blog/${a.slug}.html`, root), renderArticle(a, all));
  // the index lives inside the folder: Apache skips its clean-URL rule for a path that is also a directory
  await writeFile(new URL("content/pages/blog/index.html", root), renderIndex(all));
  // the large photo of each image on the home page (the -640 gallery files have -1280 siblings)
  const index = await readFile(new URL("public/index.html", root), "utf8");
  const photos = [...index.matchAll(/<img[^>]*src="(\/assets\/img\/(?:school|team)\/[^"]+|\/assets\/img\/hero-wide-1280\.webp)"[^>]*alt="([^"]+)"/g)]
    .map(([, src, alt]) => [src.replace(/-640\.webp$/, "-1280.webp"), alt]);
  // lastmod is when the page's source last changed in git (today for uncommitted edits), not the build date
  const today = new Date().toISOString().slice(0, 10);
  const changed = (path) => {
    try {
      if (execFileSync("git", ["status", "--porcelain", "--", path], { encoding: "utf8" }).trim()) return today;
      return execFileSync("git", ["log", "-1", "--format=%cs", "--", path], { encoding: "utf8" }).trim() || today;
    } catch { return today; }
  };
  await writeFile(new URL("public/sitemap.xml", root), renderSitemap(all, photos, changed));
  console.log(`rendered ${all.length} articles, blog index and sitemap (${photos.length} photos)`);
}
