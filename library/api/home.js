// GET / (rewritten here by vercel.json): the homepage with the live catalog already in the HTML, so search
// engines and slow phones see the books without waiting for JavaScript. The browser script then takes over
// the same list (search, sort, "show more") without fetching the catalog again.
import { readFile } from "node:fs/promises";
import { origin } from "./_lib/http.js";
import { current } from "./_lib/store.js";

const SITE = `${(process.env.SITE_URL || "https://library.afarineshshiraz.ir").replace(/\/$/, "")}/`;
const PREVIEW = 3; // keep in step with PREVIEW in app.js
const TEMPLATE = new URL("./_lib/home.html", import.meta.url);

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const fa = (v) => String(v).replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[d]);
// JSON inside <script>: "<" is escaped so no text can close the element early
const scriptJson = (v) => JSON.stringify(v).replace(/</g, "\\u003c");

// Mirrors bookCard() in app.js, minus the per-book spine colour: app.js redraws the list on load and adds it then
// (an inline style here would be blocked by the CSP anyway).
function card(b, hidden) {
  const people = [["author", "نویسنده"], ["translator", "مترجم"]].filter(([k]) => b[k]);
  return `<li${hidden ? " hidden" : ""}><article class="book" aria-labelledby="t-${esc(b.id)}">`
    + `<span class="book-number">شماره ${fa(b.number)}</span>`
    + `<h3 class="book-title"><button type="button" class="book-open" id="t-${esc(b.id)}" aria-haspopup="dialog" data-id="${esc(b.id)}">${esc(b.title)}</button></h3>`
    + (people.length ? `<dl class="book-meta">${people.map(([k, l]) => `<div><dt>${l}</dt><dd>${esc(b[k])}</dd></div>`).join("")}</dl>` : "")
    + `<div class="book-foot">`
    + (b.publisher ? `<p class="book-publisher">نشر ${esc(b.publisher)}</p>` : "")
    + `<button type="button" class="request-btn" data-request="${esc(b.id)}" aria-haspopup="dialog" aria-label="درخواست امانت «${esc(b.title)}»">درخواست امانت</button>`
    + `</div></article></li>`;
}

// The bot's public @username, once the library's Telegram bot exists (set in the Vercel project settings).
function botLink() {
  const name = (process.env.TELEGRAM_BOT_USERNAME || "").trim();
  if (!/^[A-Za-z][A-Za-z0-9_]{4,31}$/.test(name)) return "";
  return `<p>سؤالی دارید یا کتابی را پیدا نکردید؟ در تلگرام به <a href="https://t.me/${name}" rel="noopener" target="_blank" dir="ltr" translate="no">@${name}</a> پیام بدهید؛ پیام شما به کتابدار می‌رسد.</p>`;
}

function structuredData(books) {
  const person = (name) => (name ? { "@type": "Person", name } : undefined);
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebSite", "@id": `${SITE}#website`, url: SITE, inLanguage: "fa",
        name: "کتابخانه مدرسه آفرینش",
        publisher: { "@id": `${SITE}#school` },
        potentialAction: {
          "@type": "SearchAction",
          target: { "@type": "EntryPoint", urlTemplate: `${SITE}?q={search_term_string}` },
          "query-input": "required name=search_term_string",
        },
      },
      {
        "@type": "EducationalOrganization", "@id": `${SITE}#school`,
        name: "دبیرستان آفرینش", url: "http://afarineshshiraz.ir/",
        logo: `${SITE}assets/apple-touch-icon.png`,
      },
      {
        "@type": "CollectionPage", "@id": `${SITE}#catalog`, url: SITE, inLanguage: "fa",
        name: "فهرست کتاب‌های کتابخانه مدرسه آفرینش",
        isPartOf: { "@id": `${SITE}#website` },
        mainEntity: {
          "@type": "ItemList", numberOfItems: books.length,
          itemListElement: books.map((b, i) => ({
            "@type": "ListItem", position: i + 1,
            item: {
              "@type": "Book", name: b.title, identifier: b.id, inLanguage: "fa",
              author: person(b.author), translator: person(b.translator),
              publisher: b.publisher ? { "@type": "Organization", name: b.publisher } : undefined,
            },
          })),
        },
      },
    ],
  };
}

export default async function handler(req, res) {
  let html = await readFile(TEMPLATE, "utf8");
  let rendered = false;
  try {
    const { data } = await current(SITE.replace(/\/$/, ""));
    const books = [...data.books].sort((a, b) => a.number - b.number || a.id.localeCompare(b.id));
    const count = (key) => new Set(books.map((b) => b[key]).filter(Boolean)).size;
    const rest = books.length - PREVIEW;
    html = html
      .replace(/<!--SSR:BOOKS-N-->[\s\S]*?<!--\/SSR:BOOKS-N-->/, fa(books.length))
      .replace(/<!--SSR:AUTHORS-N-->[\s\S]*?<!--\/SSR:AUTHORS-N-->/, fa(count("author")))
      .replace(/<!--SSR:PUBLISHERS-N-->[\s\S]*?<!--\/SSR:PUBLISHERS-N-->/, fa(count("publisher")))
      .replace(/<!--SSR:BOOKS-->[\s\S]*?<!--\/SSR:BOOKS-->/, books.map((b, i) => card(b, i >= PREVIEW)).join(""))
      .replace(/<!--SSR:MORE-HIDDEN-->[\s\S]*?<!--\/SSR:MORE-HIDDEN-->/, rest > 0 ? "" : " hidden")
      .replace("<!--SSR:MORE-STATUS-->", `${fa(Math.min(PREVIEW, books.length))} کتاب از ${fa(books.length)} کتاب نمایش داده شده است`)
      .replace("<!--SSR:MORE-BTN-->", rest > 0 ? `نمایش بیشتر (${fa(rest)} کتاب دیگر)` : "")
      .replace("<!--SSR:HEAD-->",
        `<script type="application/ld+json">${scriptJson(structuredData(books))}</script>\n`
        + `  <script type="application/json" id="catalog-data">${scriptJson(data)}</script>`)
      .replace('aria-busy="true"', 'aria-busy="false"');
    rendered = true;
  } catch (e) {
    console.error("home render:", e.message); // the page still works: app.js loads the catalog itself
  }
  html = html.replace("<!--SSR:BOT-->", botLink());
  if (!rendered) {
    html = html.replace(/<!--SSR:MORE-HIDDEN-->([\s\S]*?)<!--\/SSR:MORE-HIDDEN-->/, "$1").replace(/<!--\/?SSR:[A-Z-]+-->/g, "");
  }
  res.statusCode = 200;
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  // edits in the admin panel reach the cached page within about a minute
  res.setHeader("Cache-Control", "public, max-age=0, s-maxage=60, stale-while-revalidate=600");
  res.end(html);
}
