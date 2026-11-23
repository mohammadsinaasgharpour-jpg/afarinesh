// Builds public/en.html, the English page, in the Persian home page's own design: the same stylesheet, theme script,
// icons and photos are taken from public/index.html (so the security header's hashes still match), and the text is
// English, left to right. Run after render-team.mjs (npm run build).
import { readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const root = new URL("../", import.meta.url);
const SITE = "https://afarineshshiraz.ir";

function between(html, start, end) {
  const a = html.indexOf(start);
  const b = a < 0 ? -1 : html.indexOf(end, a);
  if (a < 0 || b < 0) throw new Error(`block "${start}" not found in index.html`);
  return html.slice(a, b + end.length);
}
const icon = (id) => `<svg class="ic" aria-hidden="true"><use href="#i-${id}"/></svg>`;
const chips = (items) => `<ul class="chips" role="list">${items.map((i) => `<li>${i}</li>`).join("")}</ul>`;

// English names for the gallery photos, by file
const PHOTO = {
  entrance: ["School entrance", "Colourful entrance of Afarinesh High School, Shiraz"],
  library: ["Library", "Bookshelves in the Afarinesh High School library"],
  yard: ["Yard and playground", "Afarinesh school yard with artificial grass and shade"],
  garden: ["Garden", "Garden beds in the yard of Afarinesh High School, Shiraz"],
  "lab-doors": ["Lab and library", "Doors of the newsletter office, science lab and library at Afarinesh"],
  "yard-2": ["The yard", "Another view of the Afarinesh school yard and garden"],
  path: ["Way in", "Path from the yard into the school building"],
};
const photoName = (src) => src.match(/school\/([a-z0-9-]+?)-640\.webp/)?.[1] ?? "";

export function renderEnglish(index) {
  const css = between(index, "<!-- css:start -->", "<!-- css:end -->");
  const theme = between(index, "<script>(function(){var t;", "</script>");
  const sprite = between(index, '<svg width="0" height="0" class="sprite"', "</svg>\n").trimEnd();
  const gallery = between(index, '<ul class="campus-grid"', "</ul>").replace(/<li><figure>(<img[^>]*>)<figcaption>[^<]*<\/figcaption><\/figure><\/li>/g, (all, img) => {
    const name = photoName(img);
    const [caption, alt] = PHOTO[name] ?? (name.startsWith("classroom") ? ["Classroom for 15 to 17", "Classroom at Afarinesh High School, Shiraz"] : ["Afarinesh High School", "Afarinesh High School, Shiraz"]);
    return `<li><figure>${img.replace(/alt="[^"]*"/, `alt="${alt}"`)}<figcaption>${caption}</figcaption></figure></li>`;
  });
  const hero = between(index, '<picture class="hero-media">', "</picture>").replace(/alt="[^"]*"/, 'alt="Entrance and yard of Afarinesh High School on Narvan Street, Shiraz"');

  return `<!doctype html>
<html lang="en" dir="ltr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Afarinesh High School Shiraz | Private Research-Based Boys' School</title>
<meta name="description" content="Afarinesh High School is a private, research-based boys' lower-secondary school in Shiraz, Iran, since 2008: classes of 15 to 17, specialist teachers and year-long research, art, language and sport electives.">
<meta name="keywords" content="Afarinesh High School, Afarinesh School, Afarinesh High School Shiraz, Afarinesh School Shiraz, private school Shiraz, private high school Shiraz, non-governmental school Shiraz, research-based school, research-based high school, school in Shiraz, high school in Shiraz, boys school Shiraz">
<link rel="canonical" href="${SITE}/en">
<link rel="alternate" hreflang="fa" href="${SITE}/">
<link rel="alternate" hreflang="en" href="${SITE}/en">
<link rel="alternate" hreflang="x-default" href="${SITE}/">
<meta name="theme-color" content="#e8edf2">
<meta name="color-scheme" content="light dark">
<meta name="robots" content="index, follow, max-image-preview:large">
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
<link rel="preload" href="/assets/fonts/estedad-arabic.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" as="image" media="(max-width: 640px)" imagesrcset="/assets/img/hero-gate-510.webp 510w" imagesizes="100vw" fetchpriority="high">
<link rel="preload" as="image" media="(min-width: 641px)" imagesrcset="/assets/img/hero-wide-640.webp 640w, /assets/img/hero-wide-960.webp 960w, /assets/img/hero-wide-1280.webp 1280w" imagesizes="100vw" fetchpriority="high">
${theme}
${css}
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "HighSchool",
  "@id": "${SITE}/#school",
  "name": "Afarinesh High School Shiraz",
  "alternateName": ["Afarinesh School", "Afarinesh School Shiraz", "Afarinesh Private High School", "Afarinesh Research-Based High School", "Afarinesh Boys' Junior High School", "دبیرستان غیردولتی آفرینش شیراز", "مدرسه غیردولتی آفرینش شیراز"],
  "description": "A private (non-governmental), research-based boys' lower-secondary school (grades 7 to 9) in Shiraz, Iran, founded in 2008.",
  "url": "${SITE}/en",
  "logo": "${SITE}/assets/img/icon-512.png",
  "image": "${SITE}/assets/img/og-cover.jpg",
  "foundingDate": "2008",
  "email": "afarineshsch@afarineshshiraz.ir",
  "telephone": ["+98-71-32293194", "+98-71-32295122"],
  "address": {"@type": "PostalAddress", "streetAddress": "Narvan Street, corner of Alley 14, Chenchene", "addressLocality": "Shiraz", "addressRegion": "Fars", "addressCountry": "IR"},
  "geo": {"@type": "GeoCoordinates", "latitude": 29.6368, "longitude": 52.5353},
  "openingHoursSpecification": {"@type": "OpeningHoursSpecification", "dayOfWeek": ["Saturday","Sunday","Monday","Tuesday","Wednesday"], "opens": "07:00", "closes": "14:00"},
  "keywords": "Afarinesh High School, Afarinesh School Shiraz, private school Shiraz, research-based high school, high school in Shiraz",
  "sameAs": ["https://instagram.com/afarinesh_sch"]
}
</script>
</head>
<body class="lang-en">
${sprite}
<a class="skip" href="#main">Skip to content</a>
<header class="site-header" data-header><div class="read-progress" aria-hidden="true"></div>
  <div class="wrap header-row">
    <a class="brand" href="/en">
      <span class="brand-tile"><img src="/assets/img/logo-mark-80.webp" width="80" height="80" alt="Afarinesh High School logo" class="brand-mark"></span>
      <span class="brand-text"><b><span class="brand-l1">Afarinesh</span> <span class="brand-l2">High School</span></b><small>Research-based school</small></span>
    </a>
    <nav class="nav" id="nav" aria-label="Main menu">
      <ul>
        <li><a href="#approach">Our approach</a></li>
        <li><a href="#programs">Electives</a></li>
        <li><a href="#campus">The school</a></li>
        <li><a href="#faq">Questions</a></li>
        <li><a href="#contact">Contact</a></li>
        <li><a href="/" hreflang="fa" lang="fa">فارسی</a></li>
      </ul>
    </nav>
    <div class="header-actions">
      <button class="icon-btn" type="button" data-theme-toggle aria-label="Switch to dark mode">
        <svg class="ic ic-moon"><use href="#i-moon"/></svg><svg class="ic ic-sun"><use href="#i-sun"/></svg>
      </button>
      <a class="btn btn-cta btn-sm header-cta" href="/pre-registration" hreflang="fa"><span class="cta-long">Pre-register</span><span class="cta-short">Apply</span></a>
      <button class="icon-btn menu-btn" type="button" aria-controls="nav" aria-expanded="false" aria-label="Open menu" data-menu>
        <svg class="ic ic-open"><use href="#i-menu"/></svg><svg class="ic ic-shut"><use href="#i-close"/></svg>
      </button>
    </div>
  </div>
</header>

<main id="main">
  <section class="hero" aria-labelledby="hero-title">
    ${hero}
    <div class="wrap hero-body">
      <h1 id="hero-title" class="display"><span class="hero-school">Afarinesh High School, Shiraz</span> <span class="hero-line">Big ideas</span> <br><span class="hero-line">for curious minds</span></h1>
      <p class="hero-lede">A private, research-based boys' lower-secondary school in Shiraz, Iran, since 2008. Every student has his own talents and interests, so instead of one model for everyone, Afarinesh builds several paths of learning and lets each student choose.</p>
      <div class="hero-cta">
        <a class="btn btn-cta" href="/pre-registration" hreflang="fa">Pre-registration 2027-2028</a>
        <a class="btn btn-ghost" href="#contact">Contact the school</a>
      </div>
    </div>
  </section>

  <section class="facts" aria-label="The school at a glance">
    <dl class="wrap facts-wall">
      <div class="fact f-sun"><dt>students in each class</dt><dd>15-17</dd></div>
      <div class="fact f-sky"><dt>coordinated exams a year</dt><dd>4</dd></div>
      <div class="fact f-brick"><dt>counsellors: academic, clinical, nutrition</dt><dd>3</dd></div>
      <div class="fact f-paper"><dt>students at Afarinesh</dt><dd>100+</dd></div>
      <div class="fact-fill f-ink" aria-hidden="true"></div>
    </dl>
  </section>

  <section id="approach" class="section" aria-labelledby="approach-title">
    <div class="wrap split split-solo">
      <div class="split-text">
        <h2 id="approach-title" class="h2">A private, research-based school in Shiraz</h2>
        <p>Afarinesh (دبیرستان غیردولتی آفرینش) is a non-governmental boys' high school for grades 7, 8 and 9 on Narvan Street, Shiraz: a place for curious minds where students' big ideas are taken seriously. Its programme rests on variety, informed choice and attention to individual differences. A student who joins an activity out of real interest grows a lasting talent, so the research, art, language, cultural and sports electives run until the end of the school year.</p>
        <div class="approach-side">
          <p>Alongside teaching, three specialist counsellors (academic, clinical and nutrition) work with students at school.</p>
          <ul class="approach-tiles" role="list" aria-label="Electives">
            <li class="t-research"><a href="#programs">${icon("robot")}Research</a></li>
            <li class="t-art"><a href="#programs">${icon("palette")}Art</a></li>
            <li class="t-lang"><a href="#programs">${icon("lang")}Languages</a></li>
            <li class="t-culture"><a href="#programs">${icon("book")}Culture</a></li>
            <li class="t-sport"><a href="#programs">${icon("ball")}Sport</a></li>
          </ul>
        </div>
      </div>
    </div>

    <ul class="wrap features" role="list">
      <li>${icon("interview")}<h3>Admission</h3><p>Every new student has an interview at school with his parents, so the school and the family get to know each other before the year starts.</p><ul class="trail steps-line" role="list" aria-label="Admission steps"><li>Form</li><li>Call</li><li>Interview</li><li>Result</li></ul><a class="more" href="/pre-registration" hreflang="fa">Pre-registration form (Persian)</a></li>
      <li>${icon("teachers")}<h3>A specialist for every subject</h3><p>Each subject is taught by a teacher trained in that field; many hold a master's degree or a doctorate, and several have more than 30 years of teaching experience.</p><a class="more" href="/#team" hreflang="fa">Meet the teachers (Persian)</a></li>
      <li>${icon("desks")}<h3>Small classes</h3><p>15 to 17 students per class: the teacher knows every student by name, answers each one's questions and follows his progress closely.</p></li>
      <li>${icon("split")}<h3>Subjects taught separately</h3><p>Mathematics as arithmetic and geometry; science as physics-chemistry and biology-earth science, each with its own specialist.</p><ul class="trail" role="list"><li>Arithmetic</li><li>Geometry</li><li>Physics-chemistry</li><li>Biology-earth</li></ul></li>
      <li>${icon("counsel")}<h3>Three specialist counsellors</h3><p>Academic, clinical and nutrition counselling at school, for students and for their families.</p><ul class="trail" role="list"><li>Academic</li><li>Clinical</li><li>Nutrition</li></ul></li>
      <li>${icon("exam")}<h3>Exams and study books</h3><p>Four rounds of coordinated multiple-choice and written exams a year, and the school's own practice books, so each student's progress is seen and followed.</p><ol class="rounds" aria-label="Four exam rounds"><li>1<small>round</small></li><li>2<small>round</small></li><li>3<small>round</small></li><li>4<small>round</small></li></ol></li>
    </ul>
  </section>

  <section id="programs" class="section programs" aria-labelledby="programs-title">
    <div class="wrap">
      <div class="section-head">
        <h2 id="programs-title" class="h2">Electives that last the whole year</h2>
        <p>These paths are not one-off shows: they run until the end of the year and the student chooses them himself. That choice builds belonging and responsibility.</p>
      </div>
      <div class="mondrian">
        <article class="cell c-research"><div class="cell-head">${icon("robot")}<h3>Research</h3></div><p>A student takes an idea from a first sketch to a working build: he writes programs, builds robots and solves problems in a team.</p><ol class="path" aria-label="A project's path"><li>Idea</li><li>Sketch</li><li>Build</li><li>Solve</li></ol>${chips(["Programming", "Robotics", "Aerospace", "Artificial intelligence"])}</article>
        <article class="cell c-art"><div class="cell-head">${icon("palette")}<h3>Art</h3></div><p>From drawing and sculpture to graphic design, architecture, khatam inlay and cinema; each student picks his own field.</p>${chips(["Drawing", "Sculpture", "Graphic design", "Architecture", "Khatam", "Cinema"])}</article>
        <div class="cell c-blank c-blank-1" aria-hidden="true"></div>
        <article class="cell c-lang"><div class="cell-head">${icon("lang")}<h3>Languages</h3></div><p>English in term courses, and French for those interested; classes apart from the school's own language lessons.</p>${chips(["English", "French"])}</article>
        <article class="cell c-culture"><div class="cell-head">${icon("book")}<h3>Culture</h3></div><p>Reading, writing and talking about books and Persian literature.</p>${chips(["Book discussion", "Shahnameh reading", "Creative writing", "Research methods"])}</article>
        <div class="cell c-blank c-blank-2" aria-hidden="true"></div>
        <article class="cell c-sport"><div class="cell-head">${icon("ball")}<h3>Sport</h3></div><p>Sports electives that run until the end of the year.</p>${chips(["Futsal", "Chess"])}</article>
        <article class="cell c-special"><span class="cell-tag">Workshops</span><div class="cell-head">${icon("mask")}<h3>Special</h3></div><p>Workshops for making things by hand, going on stage and learning skills for everyday life.</p>${chips(["Creative drama", "Life skills", "Hands-on making"])}</article>
      </div>
    </div>
  </section>

  <section id="campus" class="section campus" aria-labelledby="campus-title">
    <div class="wrap">
      <div class="section-head">
        <h2 id="campus-title" class="h2">The school</h2>
        <p>The Afarinesh building on Narvan Street, Shiraz: the entrance, the grass yard, the library, the lab and classrooms with 15 to 17 seats each.</p>
      </div>
      ${gallery}
    </div>
  </section>

  <section id="faq" class="section" aria-labelledby="faq-title">
    <div class="wrap narrow">
      <h2 id="faq-title" class="h2">Questions</h2>
      <div class="faq">
        <details><summary>What kind of school is Afarinesh, and where is it?${icon("plus")}</summary><p>Afarinesh High School (Afarinesh School Shiraz) is a private, research-based boys' school for grades 7, 8 and 9. Since 2008 it has been on Narvan Street, corner of Alley 14, Chenchene, Shiraz.</p></details>
        <details><summary>How does admission work?${icon("plus")}</summary><p>Fill in the online pre-registration form; the school calls to arrange a visit and an interview with the student and his parents; then the result is announced.</p></details>
        <details><summary>How many students are in a class?${icon("plus")}</summary><p>15 to 17, so the teacher can work with every student.</p></details>
        <details><summary>Is teaching in English?${icon("plus")}</summary><p>Teaching follows the Iranian curriculum in Persian. English is taught as a subject and as an elective term course; French is offered as an elective.</p></details>
      </div>
    </div>
  </section>

  <section id="contact" class="section" aria-labelledby="contact-title">
    <div class="wrap narrow">
      <h2 id="contact-title" class="h2">Address and contact</h2>
      <p>Narvan Street, corner of Alley 14, Chenchene, Shiraz, Fars, Iran</p>
      <p>Office: Saturday to Wednesday, 7:00 to 14:00. Phone: <a href="tel:+987132293194">+98 71 3229 3194</a>, <a href="tel:+987132295122">+98 71 3229 5122</a></p>
      <p>Email: <a href="mailto:afarineshsch@afarineshshiraz.ir">afarineshsch@afarineshshiraz.ir</a> · Instagram: <a href="https://instagram.com/afarinesh_sch" rel="noopener">afarinesh_sch</a></p>
      <p><a class="btn btn-cta" href="/pre-registration" hreflang="fa">Pre-registration form (Persian)</a></p>
    </div>
  </section>
</main>

<footer class="site-footer">
  <div class="wrap copy"><button type="button" class="theme-foot" data-theme-toggle aria-label="Switch theme"><svg class="ic ic-moon" aria-hidden="true"><use href="#i-moon"/></svg><svg class="ic ic-sun" aria-hidden="true"><use href="#i-sun"/></svg><span>Light and dark</span></button><p>© Afarinesh High School, Shiraz, Iran · <a href="/" hreflang="fa" lang="fa">دبیرستان غیردولتی آفرینش شیراز</a></p></div>
</footer>
<a class="insta-fab" href="https://instagram.com/afarinesh_sch" target="_blank" rel="noopener" aria-label="The school's Instagram (afarinesh_sch)"><svg class="ic" aria-hidden="true"><use href="#i-insta"/></svg></a>
<button class="to-top icon-btn" type="button" aria-label="Back to top" data-to-top hidden><svg class="ic"><use href="#i-up"/></svg></button>
<div class="toasts" aria-live="polite" aria-atomic="false" data-toasts></div>
<script type="module" src="/assets/js/en.js"></script>
</body>
</html>
`;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const index = await readFile(new URL("public/index.html", root), "utf8");
  await writeFile(new URL("public/en.html", root), renderEnglish(index));
  console.log("rendered en.html");
}
