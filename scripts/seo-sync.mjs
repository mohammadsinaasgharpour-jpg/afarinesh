// Keeps the home page's structured data in step with what the page shows: the FAQPage block is rebuilt from the
// visible questions and answers (search engines and AI answer engines reward markup that matches the page), and the
// WebSite block carries the @id other pages point to. Run after render-team.mjs and before render-en.mjs.
import { readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const root = new URL("../", import.meta.url);
const SITE = "https://afarineshshiraz.ir";
const strip = (s) => s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").replace(/ ([،.:؛])/g, "$1").trim();

export function syncSeo(html) {
  const faq = html.slice(html.indexOf('<section id="faq"'), html.indexOf("</section>", html.indexOf('<section id="faq"')));
  const items = [...faq.matchAll(/<details>\s*<summary>([\s\S]*?)<svg[\s\S]*?<\/summary>([\s\S]*?)<\/details>/g)]
    .map(([, q, a]) => ({ "@type": "Question", name: strip(q), acceptedAnswer: { "@type": "Answer", text: strip(a) } }));
  if (!items.length) throw new Error("seo-sync: no FAQ items found in index.html");
  const faqLd = JSON.stringify({ "@context": "https://schema.org", "@type": "FAQPage", "@id": `${SITE}/#faq`, inLanguage: "fa-IR", mainEntity: items }, null, 1).replace(/</g, "\\u003c");
  const out = html
    .replace(/<script type="application\/ld\+json">\s*\{[^<]*?"@type": ?"FAQPage"[\s\S]*?<\/script>/, `<script type="application/ld+json">\n${faqLd}\n</script>`)
    .replace(/("@type": "WebSite",)(?!\s*"@id")/, `$1\n  "@id": "${SITE}/#website",\n  "publisher": {"@id": "${SITE}/#school"},`);
  return { out, count: items.length };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const file = new URL("public/index.html", root);
  const { out, count } = syncSeo(await readFile(file, "utf8"));
  await writeFile(file, out);
  console.log(`structured data: FAQPage with ${count} questions`);
}
