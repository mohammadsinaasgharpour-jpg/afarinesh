// Builds public/en.html, the English page, as a copy of the Persian home page (public/index.html) with the text in
// English: the same sections, design, photos, teachers and motion. The English page is for search engines and
// visitors from abroad, so it has no forms and no sign-up (they cannot enrol from abroad): the pre-registration and
// callback form, the enrolment band and links to Persian-only pages are taken out, and the main buttons lead to the
// school's contact details instead. Every Persian text and label is looked up in content/en.json; a Persian string
// with no translation stops the build, so the page never goes out half translated. Run after render-team.mjs.
import { readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const root = new URL("../", import.meta.url);
const SITE = "https://afarineshshiraz.ir";
const FA = /[؀-ۿ]/;
// the only Persian text kept on purpose: the link back to the Persian site
const KEEP = new Set(["فارسی"]);

function between(html, start, end) {
  const a = html.indexOf(start);
  const b = a < 0 ? -1 : html.indexOf(end, a);
  if (a < 0 || b < 0) throw new Error(`block "${start}" not found in index.html`);
  return html.slice(a, b + end.length);
}
const cut = (html, re, label) => {
  if (!re.test(html)) throw new Error(`render-en: ${label} not found in index.html`);
  return html.replace(re, "");
};

/** The Persian body with everything that asks a visitor to fill in a form or enrol taken out. */
export function englishBody(index) {
  let b = between(index, "<body", "</body>");
  b = b.replace(/^<body[^>]*>/, '<body class="lang-en">');
  b = cut(b, /\s*<li><a href="\/blog\/">[^<]*<\/a><\/li>/, "menu blog link");
  // the blog is in Persian only
  b = cut(b, /\s*<!-- blog:start -->[\s\S]*?<!-- blog:end -->/, "blog section");
  // the header button becomes the language switch
  b = b.replace(/<a class="btn btn-cta btn-sm header-cta" href="\/pre-registration"[^>]*>[\s\S]*?<\/a>/, '<a class="btn btn-cta btn-sm header-cta" href="/" hreflang="fa" lang="fa">فارسی</a>');
  b = cut(b, /<a class="btn btn-cta mobile-enrol"[^>]*>[^<]*<\/a>\n?/, "mobile enrol button");
  b = b.replace(/<a class="btn btn-cta" href="\/pre-registration">[^<]*<\/a>(\s*<a class="btn btn-ghost") href="#contact">[^<]*<\/a>/,
    '<a class="btn btn-cta" href="#school-contacts">تماس با مدرسه</a>$1 href="#team">آشنایی با دبیران</a>');
  b = cut(b, /\s*<a class="more" href="\/pre-registration">[^<]*<\/a>/, "admission link");
  b = cut(b, /\s*<a class="more" href="#contact">[^<]*<\/a>/, "callback link");
  // footer links to pages that exist only in Persian
  for (const href of ["/pre-registration", "/careers", "/privacy", "/library/", "/blog/"]) b = cut(b, new RegExp(`\\s*<li><a href="${href.replace(/[/]/g, "\\/")}">[^<]*<\\/a><\\/li>`), `footer link ${href}`);
  // the admission steps stay as information; the form link in them becomes plain text
  b = b.replace(/<a href="\/pre-registration">([^<]*)<\/a>/g, "$1");
  b = cut(b, /\s*<section class="enrol"[\s\S]*?<\/section>/, "enrolment band");
  b = cut(b, /\s*<form class="form" id="inquiry"[\s\S]*?<\/form>/, "callback form");
  b = b.replace(/<li><a href="\/en" hreflang="en" lang="en">English<\/a><\/li>/, '<li><a href="/" hreflang="fa" lang="fa">فارسی</a></li>');
  b = b.replace(/\s*<dialog[\s\S]*?<\/dialog>/g, "");
  // the designer's name is written once, in English
  b = b.replace(/\s*<span class="credit-en"[^>]*>[^<]*<\/span>/, "");
  // home links stay on the English page
  b = b.replace('<a class="brand" href="/" data-home>', '<a class="brand" href="/en">');
  return b;
}

/** Every Persian text and label in `html`, translated from `dict`; collects the ones it has no translation for. */
export function translate(html, dict, missing = new Set()) {
  const t = (s) => {
    const k = s.trim();
    if (!FA.test(k) || KEEP.has(k)) return s;
    // a teacher's photo: "name، role دبیرستان آفرینش شیراز"
    const who = k.match(/^(.+?)، (.+) دبیرستان آفرینش شیراز$/);
    if (who && who[1] in dict && who[2] in dict) return s.replace(k, `${dict[who[1]]}, ${dict[who[2]]} at Afarinesh High School, Shiraz`);
    if (!(k in dict)) { missing.add(k); return s; }
    return s.replace(k, dict[k]);
  };
  // keep scripts and the icon sprite as they are
  const parts = html.split(/(<script[\s\S]*?<\/script>|<svg width="0"[\s\S]*?<\/svg>)/);
  return parts.map((p, i) => (i % 2 ? p : p
    .replace(/>([^<>]+)</g, (m, s) => `>${t(s)}<`)
    .replace(/(\s(?:alt|aria-label|title|placeholder|content|data-label)=")([^"]*)"/g, (m, a, s) => `${a}${t(s).replace(/"/g, "&quot;")}"`))).join("");
}

function head(index, faqLd) {
  const theme = between(index, "<script>(function(){var t;", "</script>");
  const css = between(index, "<!-- css:start -->", "<!-- css:end -->");
  return `<!doctype html>
<html lang="en" dir="ltr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Afarinesh High School Shiraz | Private Research-Based Boys' School in Iran</title>
<meta name="description" content="Afarinesh High School is a private, research-based boys' school for grades 7 to 9 in Shiraz, Iran, since 2008: classes of 15 to 17 and year-long electives.">
<meta name="keywords" content="Afarinesh High School, Afarinesh School, Afarinesh High School Shiraz, Afarinesh School Shiraz, private school Shiraz, private high school Shiraz, non-governmental school Shiraz, research-based school, research-based high school, school in Shiraz, high school in Shiraz, boys school Shiraz, middle school Shiraz Iran">
<link rel="canonical" href="${SITE}/en">
<link rel="alternate" hreflang="fa" href="${SITE}/">
<link rel="alternate" hreflang="en" href="${SITE}/en">
<link rel="alternate" hreflang="x-default" href="${SITE}/">
<meta name="theme-color" content="#e8edf2">
<meta name="color-scheme" content="light dark">
<meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1">
<meta name="geo.region" content="IR-07">
<meta name="geo.placename" content="Shiraz">
<meta name="geo.position" content="29.6368;52.5353">
<meta property="og:type" content="website">
<meta property="og:locale" content="en_US">
<meta property="og:locale:alternate" content="fa_IR">
<meta property="og:site_name" content="Afarinesh High School Shiraz">
<meta property="og:title" content="Afarinesh High School Shiraz | Private Research-Based Boys' School">
<meta property="og:description" content="A private, research-based boys' lower-secondary school in Shiraz, Iran, since 2008.">
<meta property="og:url" content="${SITE}/en">
<meta property="og:image" content="${SITE}/assets/img/og-cover.jpg">
<meta property="og:image:alt" content="Colourful entrance wall of Afarinesh High School, Shiraz">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="/assets/img/icon-48.png" type="image/png" sizes="48x48">
<link rel="icon" href="/assets/img/icon-192.png" sizes="192x192">
<link rel="apple-touch-icon" href="/assets/img/icon-180.png">
<link rel="manifest" href="/manifest.webmanifest">
<link rel="preload" href="/assets/fonts/estedad-latin.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="/assets/fonts/lalezar-latin.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" as="image" media="(max-width: 640px)" imagesrcset="/assets/img/hero-gate-510.webp 510w" imagesizes="100vw" fetchpriority="high">
<link rel="preload" as="image" media="(min-width: 641px)" imagesrcset="/assets/img/hero-wide-640.webp 640w, /assets/img/hero-wide-960.webp 960w, /assets/img/hero-wide-1280.webp 1280w" imagesizes="100vw" fetchpriority="high">
${theme}
${css}
<link rel="modulepreload" href="/assets/js/common.js">
<script type="module" src="/assets/js/main.js"></script>
<script type="application/ld+json">
${JSON.stringify({
  "@context": "https://schema.org",
  "@type": ["HighSchool", "LocalBusiness"],
  "@id": `${SITE}/#school`,
  name: "Afarinesh High School Shiraz",
  alternateName: ["Afarinesh School", "Afarinesh School Shiraz", "Afarinesh Private High School", "Afarinesh Research-Based High School", "Afarinesh Boys' Junior High School", "دبیرستان غیردولتی آفرینش شیراز", "مدرسه غیردولتی آفرینش شیراز"],
  description: "A private (non-governmental), research-based boys' lower-secondary school (grades 7 to 9) in Shiraz, Iran, founded in 2008.",
  url: `${SITE}/en`,
  logo: `${SITE}/assets/img/icon-512.png`,
  image: `${SITE}/assets/img/og-cover.jpg`,
  foundingDate: "2008",
  email: "afarineshsch@afarineshshiraz.ir",
  telephone: ["+98-71-32293194", "+98-71-32295122"],
  address: { "@type": "PostalAddress", streetAddress: "Narvan Street, corner of Alley 14, Chenchene", addressLocality: "Shiraz", addressRegion: "Fars", addressCountry: "IR" },
  geo: { "@type": "GeoCoordinates", latitude: 29.6368, longitude: 52.5353 },
  openingHoursSpecification: { "@type": "OpeningHoursSpecification", dayOfWeek: ["Saturday", "Sunday", "Monday", "Tuesday", "Wednesday"], opens: "07:00", closes: "14:00" },
  keywords: "Afarinesh High School, Afarinesh School Shiraz, private school Shiraz, research-based high school, high school in Shiraz",
  sameAs: ["https://instagram.com/afarinesh_sch"],
}).replace(/</g, "\\u003c")}
</script>
<script type="application/ld+json">
${JSON.stringify({ "@context": "https://schema.org", "@type": "WebPage", "@id": `${SITE}/en#page`, url: `${SITE}/en`, name: "Afarinesh High School Shiraz", inLanguage: "en", about: { "@id": `${SITE}/#school` }, isPartOf: { "@id": `${SITE}/#website` } })}
</script>
<script type="application/ld+json">
${JSON.stringify(faqLd).replace(/</g, "\\u003c")}
</script>
</head>
`;
}

/** The questions and answers of the translated FAQ section, as schema.org FAQPage. */
function faqOf(body) {
  const strip = (s) => s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  const faq = between(body, '<section id="faq"', "</section>");
  const items = [...faq.matchAll(/<details>\s*<summary>([\s\S]*?)<svg[\s\S]*?<\/summary>([\s\S]*?)<\/details>/g)];
  return { "@context": "https://schema.org", "@type": "FAQPage", inLanguage: "en",
    mainEntity: items.map(([, q, a]) => ({ "@type": "Question", name: strip(q), acceptedAnswer: { "@type": "Answer", text: strip(a) } })) };
}

export function renderEnglish(index, dict) {
  const missing = new Set();
  const body = translate(englishBody(index), dict, missing);
  if (missing.size) {
    const list = [...missing];
    const err = new Error(`render-en: ${list.length} Persian strings have no English in content/en.json:\n${list.join("\n")}`);
    err.missing = list;
    throw err;
  }
  const left = body.replace(/<script[\s\S]*?<\/script>|<svg width="0"[\s\S]*?<\/svg>/g, "").replace(/lang="fa">فارسی</g, "");
  if (FA.test(left)) throw new Error(`render-en: Persian text left in the page near: ${left.slice(Math.max(0, left.search(FA) - 80), left.search(FA) + 40)}`);
  return `${head(index, faqOf(body))}${body}\n</html>\n`;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const index = await readFile(new URL("public/index.html", root), "utf8");
  const dict = JSON.parse(await readFile(new URL("content/en.json", root), "utf8"));
  try {
    await writeFile(new URL("public/en.html", root), renderEnglish(index, dict));
    console.log("rendered en.html");
  } catch (e) {
    if (e.missing && process.env.EN_MISSING) await writeFile(process.env.EN_MISSING, JSON.stringify(e.missing, null, 1));
    throw e;
  }
}
