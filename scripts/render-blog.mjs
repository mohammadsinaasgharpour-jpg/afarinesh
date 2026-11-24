// Builds the blog from content/blog/<slug>.html: each file starts with a <!--meta {...}--> JSON block followed by
// the article body. An article is published once its date has come (Tehran time), so a year of weekly articles can
// sit in the folder and appear one by one: .github/workflows/blog-weekly.yml rebuilds every Saturday morning.
// Writes content/pages/blog/<slug>.html and content/pages/blog/index.html (render-pages then adds the shared header
// and footer) and public/blog/feed.xml. The sitemap is not written here: php/sitemap.php builds it on each request
// from the pages on the host, so a newly published article is listed as soon as it is served.
import { readFile, writeFile, readdir, mkdir, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { pathToFileURL } from "node:url";

const root = new URL("../", import.meta.url);
const SITE = "https://afarineshshiraz.ir";
const SCHOOL = "دبیرستان غیردولتی آفرینش شیراز";
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const ld = (obj) => `<script type="application/ld+json">\n${JSON.stringify(obj).replace(/</g, "\\u003c")}\n</script>`;
const fa = (n) => String(n).replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[d]);
const faDate = (iso) => new Intl.DateTimeFormat("fa-IR-u-ca-persian", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${iso}T12:00:00Z`));
/** Today in Tehran, as YYYY-MM-DD (BLOG_TODAY overrides it for tests and previews). */
export const tehranToday = () => process.env.BLOG_TODAY || new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tehran" }).format(new Date());

export const CATEGORIES = {
  school: "انتخاب مدرسه",
  enrol: "ثبت‌نام و آزمون",
  study: "درس و مطالعه",
  family: "نوجوانی و خانواده",
  health: "سلامت و ورزش",
  skills: "پژوهش و مهارت",
};

// photos a cover may use (landscape, 1280 x 720, with a 640 x 360 copy)
const COVERS = new Set(["classroom-1", "classroom-2", "classroom-3", "classroom-4", "classroom-5", "classroom-6", "classroom-7", "entrance", "garden", "lab-doors", "yard", "yard-2"]);
// the cover is drawn for each article by scripts/blog_covers.py; the school photo goes inside the article
const cover = (a, size) => `/assets/img/blog/${a.slug}-${size}.webp`;
const photo = (a, size) => `/assets/img/school/${a.image}-${size}.webp`;
const coverAlt = (a) => `تصویر مطلب «${a.short || a.title}» در وبلاگ دبیرستان آفرینش شیراز`;

export function parseArticle(slug, src) {
  const m = src.match(/^<!--meta\s*([\s\S]*?)-->\s*/);
  if (!m) throw new Error(`content/blog/${slug}.html has no <!--meta {...}--> block`);
  const meta = JSON.parse(m[1]);
  for (const k of ["title", "description", "date", "lede", "category", "image", "imageAlt"]) if (!meta[k]) throw new Error(`${slug}: meta.${k} is missing`);
  if (!CATEGORIES[meta.category]) throw new Error(`${slug}: unknown category ${meta.category}`);
  if (!COVERS.has(meta.image)) throw new Error(`${slug}: unknown cover photo ${meta.image}`);
  if (!existsSync(new URL(`public/assets/img/blog/${slug}-1280.webp`, root))) throw new Error(`${slug}: no cover; run npm run build:covers`);
  const body = src.slice(m[0].length).trim();
  const text = body.replace(/<[^>]+>/g, " ");
  const words = text.split(/\s+/).filter(Boolean).length;
  const toc = [...body.matchAll(/<h2(?: id="([^"]+)")?>([\s\S]*?)<\/h2>/g)].map(([, id], i) => id || `s${i + 1}`);
  let n = 0;
  // every section heading gets an anchor, so the contents box and search results can link to it
  const anchored = body.replace(/<h2(?: id="[^"]+")?>/g, () => `<h2 id="${toc[n++]}">`);
  const heads = [...anchored.matchAll(/<h2 id="([^"]+)">([\s\S]*?)<\/h2>/g)].map(([, id, t]) => [id, t.replace(/<[^>]+>/g, "")]);
  return { slug, faq: [], sources: [], keywords: [], ...meta, dateFa: faDate(meta.date), body: anchored, heads, words, minutes: Math.max(2, Math.round(words / 180)) };
}

function head({ title, description, url, type, image, extraLd, extraHead = "" }) {
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
<meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1">
<meta property="og:type" content="${type}">
<meta property="og:locale" content="fa_IR">
<meta property="og:site_name" content="دبیرستان آفرینش شیراز">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${url}">
<meta property="og:image" content="${SITE}${image}">
<meta name="twitter:card" content="summary_large_image">
${extraHead}<link rel="alternate" type="application/rss+xml" title="وبلاگ دبیرستان آفرینش" href="${SITE}/blog/feed.xml">
<link rel="icon" href="/assets/img/icon-48.png" type="image/png" sizes="48x48">
<link rel="icon" href="/assets/img/icon-192.png" sizes="192x192">
<link rel="apple-touch-icon" href="/assets/img/icon-180.png">
<link rel="manifest" href="/manifest.webmanifest">
<link rel="preload" href="/assets/fonts/estedad-arabic.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="/assets/fonts/lalezar-arabic.woff2" as="font" type="font/woff2" crossorigin>
<!-- shared:theme-script -->
<!-- shared:css -->
<link rel="stylesheet" href="/assets/css/blog.css">
<link rel="modulepreload" href="/assets/js/common.js">
<script type="module" src="/assets/js/blog.js"></script>
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

/** A card for the index and for "related articles": photo, category, title, summary, date and reading time. */
function card(a, { big = false, level = 2 } = {}) {
  const h = `h${level}`;
  return `
      <article class="post-card${big ? " post-card-big" : ""}" data-cat="${a.category}">
        <a class="post-card-img" href="/blog/${a.slug}" tabindex="-1" aria-hidden="true"><img src="${cover(a, big ? "1280" : "640")}"${big ? ` srcset="${cover(a, "640")} 640w, ${cover(a, "1280")} 1280w" sizes="(max-width: 860px) 100vw, 60vw"` : ""} width="${big ? 1280 : 640}" height="${big ? 720 : 360}" alt="${esc(coverAlt(a))}" loading="${big ? "eager" : "lazy"}"${big ? ' fetchpriority="high"' : ""} decoding="async"></a>
        <div class="post-card-body">
          <p class="post-cat">${esc(CATEGORIES[a.category])}</p>
          <${h} class="post-card-title"><a href="/blog/${a.slug}">${esc(a.title)}</a></${h}>
          <p class="post-card-text">${esc(a.description)}</p>
          <p class="post-meta"><time datetime="${a.date}">${esc(a.dateFa)}</time> · ${fa(a.minutes)} دقیقه مطالعه</p>
        </div>
      </article>`;
}

/** The article body with the school photo placed after its first section. */
function withPhoto(a) {
  const fig = `
      <figure class="post-photo"><img src="${photo(a, "1280")}" srcset="${photo(a, "640")} 640w, ${photo(a, "1280")} 1280w" sizes="(max-width: 780px) 100vw, 780px" width="1280" height="${a.image === "library" || a.image === "path" ? 2276 : 720}" alt="${esc(a.imageAlt)}" loading="lazy" decoding="async"><figcaption>${esc(a.imageAlt)}</figcaption></figure>`;
  const i = a.body.indexOf("</section>");
  return i < 0 ? a.body + fig : a.body.slice(0, i + 10) + fig + a.body.slice(i + 10);
}

export function renderArticle(a, all) {
  const url = `${SITE}/blog/${a.slug}`;
  // related: same category first, then the newest others
  const related = [...all.filter((o) => o.slug !== a.slug && o.category === a.category), ...all.filter((o) => o.slug !== a.slug && o.category !== a.category)].slice(0, 3);
  const faq = a.faq.length ? `
      <section class="post-faq" aria-labelledby="faq-h">
        <h2 id="faq-h">پرسش‌های پرتکرار</h2>
        ${a.faq.map(([q, ans]) => `<details><summary>${esc(q)}</summary><p>${esc(ans)}</p></details>`).join("\n        ")}
      </section>` : "";
  const sources = a.sources.length ? `
      <section class="post-sources" aria-labelledby="src-h">
        <h2 id="src-h">منابع و مطالعه‌ی بیشتر</h2>
        <ul>${a.sources.map(([name, href]) => `<li><a href="${esc(href)}" target="_blank" rel="noopener">${esc(name)}</a></li>`).join("")}</ul>
      </section>` : "";
  const toc = a.heads.length > 2 ? `
      <nav class="post-toc" aria-label="فهرست این مطلب">
        <p class="post-toc-h">در این مطلب</p>
        <ol>${a.heads.map(([id, t]) => `<li><a href="#${id}">${t}</a></li>`).join("")}</ol>
      </nav>` : "";
  const image = cover(a, "1280");
  return head({
    // the search result title stays short enough not to be cut (the heading on the page keeps the full title)
    title: `${a.title} | دبیرستان آفرینش`.length <= 70 ? `${a.title} | دبیرستان آفرینش` : a.title.length <= 70 ? a.title : `${a.short} | دبیرستان آفرینش شیراز`, description: a.description, url, type: "article", image,
    extraHead: `<meta property="article:published_time" content="${a.date}">\n<meta property="article:section" content="${esc(CATEGORIES[a.category])}">\n<link rel="preload" as="image" href="${image}" fetchpriority="high">\n`,
    extraLd: [
      { "@context": "https://schema.org", "@type": "BlogPosting", headline: a.title, description: a.description, inLanguage: "fa-IR",
        datePublished: a.date, dateModified: a.updated || a.date, mainEntityOfPage: url, url,
        image: [{ "@type": "ImageObject", url: `${SITE}${image}`, width: 1280, height: 720, caption: coverAlt(a) }, { "@type": "ImageObject", url: `${SITE}${photo(a, "1280")}`, caption: a.imageAlt }],
        articleSection: CATEGORIES[a.category], keywords: a.keywords.join("، ") || undefined, wordCount: a.words,
        author: { "@type": "Organization", name: SCHOOL, url: `${SITE}/` },
        publisher: { "@id": `${SITE}/#school` }, isPartOf: { "@id": `${SITE}/blog/#blog` },
        about: { "@id": `${SITE}/#school` } },
      ...(a.faq.length ? [{ "@context": "https://schema.org", "@type": "FAQPage",
        mainEntity: a.faq.map(([q, ans]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: ans } })) }] : []),
      crumbsLd([["دبیرستان آفرینش", `${SITE}/`], ["وبلاگ", `${SITE}/blog/`], [a.title, url]]),
    ],
  }) + `
<main id="main" tabindex="-1" class="blog-page">
  <article class="post">
  <header class="post-hero">
    <div class="wrap post-wrap">
      <nav class="crumbs" aria-label="مسیر صفحه"><a href="/">صفحه اصلی</a><span aria-hidden="true">‹</span><a href="/blog/">وبلاگ</a><span aria-hidden="true">‹</span><span aria-current="page">${esc(a.short || a.title)}</span></nav>
      <p class="post-cat"><a href="/blog/#${a.category}">${esc(CATEGORIES[a.category])}</a></p>
      <h1 class="post-title">${esc(a.title)}</h1>
      <p class="lede">${esc(a.lede)}</p>
      <p class="post-meta"><span>نوشته‌ی ${SCHOOL}</span> · <time datetime="${a.date}">${esc(a.dateFa)}</time> · ${fa(a.minutes)} دقیقه مطالعه</p>
    </div>
    <figure class="post-cover wrap"><img src="${image}" srcset="${cover(a, "640")} 640w, ${image} 1280w" sizes="(max-width: 1180px) 100vw, 1180px" width="1280" height="720" alt="${esc(coverAlt(a))}" fetchpriority="high"></figure>
  </header>
  <div class="wrap post-wrap post-body">${toc}
    <div class="prose">
${withPhoto(a)}
    </div>${faq}${sources}
      <aside class="post-cta">
        <h2>دبیرستان آفرینش؛ سال تحصیلی ۱۴۰۶-۱۴۰۷</h2>
        <p>پیش‌ثبت‌نام پایه‌های هفتم، هشتم و نهم دبیرستان غیردولتی پسرانه‌ی آفرینش شیراز باز است. پیش از ثبت‌نام می‌توانید از صفحه‌ی اصلی درخواست تماس مشاور بدهید.</p>
        <p class="post-cta-row"><a class="btn btn-cta" href="/pre-registration">پیش‌ثبت‌نام آنلاین</a> <a class="btn btn-ghost" href="/#contact">درخواست مشاوره</a></p>
      </aside>
  </div>
  </article>
  <section class="section related" aria-labelledby="rel-h">
    <div class="wrap">
      <h2 id="rel-h" class="related-h">مطالب مرتبط</h2>
      <div class="post-grid">${related.map((o) => card(o, { level: 3 })).join("")}
      </div>
      <p class="related-all"><a href="/blog/">همه‌ی مطالب وبلاگ ‹</a></p>
    </div>
  </section>
</main>
` + tail;
}

export function renderIndex(all) {
  const url = `${SITE}/blog/`;
  const [first, ...rest] = all;
  const cats = Object.entries(CATEGORIES).filter(([k]) => all.some((a) => a.category === k));
  return head({
    title: "وبلاگ دبیرستان آفرینش شیراز | راهنمای والدین و دانش‌آموزان دوره اول متوسطه",
    description: "وبلاگ دبیرستان غیردولتی آفرینش شیراز: راهنمای انتخاب مدرسه، پیش‌ثبت‌نام و آزمون‌ها، روش مطالعه، نوجوانی، سلامت و مهارت‌های پژوهشی برای والدین و دانش‌آموزان پایه‌های هفتم تا نهم.",
    url, type: "website", image: cover(first, "1280"),
    extraHead: `<link rel="preload" as="image" imagesrcset="${cover(first, "640")} 640w, ${cover(first, "1280")} 1280w" imagesizes="(max-width: 860px) 100vw, 60vw" fetchpriority="high">\n`,
    extraLd: [
      { "@context": "https://schema.org", "@type": "Blog", "@id": `${url}#blog`, name: "وبلاگ دبیرستان آفرینش شیراز", url, inLanguage: "fa-IR", publisher: { "@id": `${SITE}/#school` },
        blogPost: all.slice(0, 20).map((a) => ({ "@type": "BlogPosting", headline: a.title, url: `${SITE}/blog/${a.slug}`, datePublished: a.date, image: `${SITE}${cover(a, "1280")}` })) },
      crumbsLd([["دبیرستان آفرینش", `${SITE}/`], ["وبلاگ", url]]),
    ],
  }) + `
<main id="main" tabindex="-1" class="blog-page">
  <section class="blog-hero">
    <div class="wrap">
      <nav class="crumbs" aria-label="مسیر صفحه"><a href="/">صفحه اصلی</a><span aria-hidden="true">‹</span><span aria-current="page">وبلاگ</span></nav>
      <h1 class="blog-title">وبلاگ آفرینش</h1>
      <p class="lede">راهنمای خانواده‌ها و دانش‌آموزان دوره اول متوسطه: انتخاب مدرسه در شیراز، پیش‌ثبت‌نام و آزمون‌ها، روش درس خواندن، نوجوانی، سلامت و پژوهش. هر هفته یک مطلب تازه.</p>
      <ul class="blog-cats" role="list">
        <li><a href="#all" data-cat-link="all" aria-current="true">همه <b>${fa(all.length)}</b></a></li>${cats.map(([k, v]) => `
        <li><a href="#${k}" data-cat-link="${k}">${esc(v)} <b>${fa(all.filter((a) => a.category === k).length)}</b></a></li>`).join("")}
      </ul>
    </div>
  </section>
  <section class="section blog-list" aria-label="مطالب">
    <div class="wrap">${card(first, { big: true })}
      <div class="post-grid" data-post-grid>${rest.map((a) => card(a)).join("")}
      </div>
      <p class="blog-empty" data-blog-empty hidden>در این دسته هنوز مطلبی منتشر نشده است.</p>
    </div>
  </section>
</main>
` + tail;
}

/** RSS 2.0 for feed readers and for search engines that watch feeds. */
export function renderFeed(all) {
  const items = all.slice(0, 30).map((a) => `
  <item>
    <title>${esc(a.title)}</title>
    <link>${SITE}/blog/${a.slug}</link>
    <guid isPermaLink="true">${SITE}/blog/${a.slug}</guid>
    <pubDate>${new Date(`${a.date}T05:00:00Z`).toUTCString()}</pubDate>
    <category>${esc(CATEGORIES[a.category])}</category>
    <description>${esc(a.description)}</description>
    <enclosure url="${SITE}${cover(a, "1280")}" type="image/webp" length="0"/>
  </item>`).join("");
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
<channel>
  <title>وبلاگ دبیرستان آفرینش شیراز</title>
  <link>${SITE}/blog/</link>
  <atom:link href="${SITE}/blog/feed.xml" rel="self" type="application/rss+xml"/>
  <description>راهنمای والدین و دانش‌آموزان دوره اول متوسطه، از دبیرستان غیردولتی آفرینش شیراز</description>
  <language>fa-IR</language>
  <lastBuildDate>${new Date(`${all[0].date}T05:00:00Z`).toUTCString()}</lastBuildDate>${items}
</channel>
</rss>
`;
}

/** Every article in the folder, published or waiting for its date, newest first. */
export async function loadArticles() {
  const dir = new URL("content/blog/", root);
  const all = [];
  for (const f of (await readdir(dir)).filter((n) => n.endsWith(".html"))) all.push(parseArticle(f.slice(0, -5), await readFile(new URL(f, dir), "utf8")));
  return all.sort((x, y) => (x.date < y.date ? 1 : x.date > y.date ? -1 : x.slug.localeCompare(y.slug)));
}

/** The home page's "from the blog" section: the three newest articles, linked. */
export function homeTeaser(all) {
  return `<!-- blog:start -->
  <section id="blog" class="section home-blog" aria-labelledby="blog-title">
    <div class="wrap">
      <div class="section-head">
        <h2 id="blog-title" class="h2">از وبلاگ آفرینش</h2>
        <p>راهنمای خانواده‌ها برای انتخاب مدرسه، ثبت‌نام، درس خواندن و نوجوانی؛ هر هفته یک مطلب تازه.</p>
      </div>
      <ul class="home-posts" role="list">${all.slice(0, 3).map((a) => `
        <li><a href="/blog/${a.slug}"><img src="${cover(a, "640")}" width="640" height="360" alt="${esc(coverAlt(a))}" loading="lazy" decoding="async"><span class="home-post-cat">${esc(CATEGORIES[a.category])}</span><span class="home-post-title">${esc(a.title)}</span></a></li>`).join("")}
      </ul>
      <p class="home-blog-all"><a class="btn btn-ghost" href="/blog/">همه‌ی مطالب وبلاگ</a></p>
    </div>
  </section>
  <!-- blog:end -->`;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const today = tehranToday();
  const every = await loadArticles();
  // a link to another article must point to one that is already out on the day this one appears
  const bySlug = new Map(every.map((a) => [a.slug, a]));
  for (const a of every) {
    for (const [, slug] of a.body.matchAll(/href="\/blog\/([a-z0-9-]+)"/g)) {
      const t = bySlug.get(slug);
      if (!t || t.date > a.date) throw new Error(`${a.slug} links to /blog/${slug}, which ${t ? `only appears on ${t.date}` : "does not exist"}`);
    }
  }
  const all = every.filter((a) => a.date <= today);
  // pages of articles not yet due are removed, so nothing early is ever served
  await rm(new URL("content/pages/blog/", root), { recursive: true, force: true });
  await mkdir(new URL("content/pages/blog/", root), { recursive: true });
  for (const a of every.filter((x) => x.date > today)) await rm(new URL(`public/blog/${a.slug}.html`, root), { force: true });
  for (const a of all) await writeFile(new URL(`content/pages/blog/${a.slug}.html`, root), renderArticle(a, all));
  // the index lives inside the folder: Apache skips its clean-URL rule for a path that is also a directory
  await writeFile(new URL("content/pages/blog/index.html", root), renderIndex(all));
  const indexFile = new URL("public/index.html", root);
  const home = await readFile(indexFile, "utf8");
  const BLOCK = /<!-- blog:start -->[\s\S]*?<!-- blog:end -->/;
  if (!BLOCK.test(home)) throw new Error("render-blog: blog markers missing in index.html");
  await writeFile(indexFile, home.replace(BLOCK, () => homeTeaser(all)));
  await mkdir(new URL("public/blog/", root), { recursive: true });
  await writeFile(new URL("public/blog/feed.xml", root), renderFeed(all));
  const next = every.filter((a) => a.date > today).at(-1);
  console.log(`rendered ${all.length} articles (${every.length - all.length} scheduled${next ? `, next on ${next.date}` : ""}), blog index and feed`);
}
