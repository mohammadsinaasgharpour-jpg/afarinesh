import { validateInquiry, toPersianDigits, GRADE_LABEL } from "./validate.js";
import { searchItem, searchTeachers } from "./search.js";
import { $, $$, initChrome, createFormController, reduceMotion } from "./common.js";

initChrome();

/* nav: highlight the section in view */
const navLinks = $$('#nav a[href^="#"]');
const spy = new IntersectionObserver((entries) => {
  for (const entry of entries) {
    if (!entry.isIntersecting) continue;
    navLinks.forEach((a) => (a.hash === `#${entry.target.id}` ? a.setAttribute("aria-current", "true") : a.removeAttribute("aria-current")));
  }
}, { rootMargin: "-45% 0px -50% 0px" });
navLinks.forEach((a) => { const s = document.querySelector(a.hash); if (s) spy.observe(s); });

/* team: skeleton, one-by-one scroll, list mode, search */
const track = $("[data-team-track]");
const team = $("[data-team]");
const cards = $$(".teacher", team);
const search = $("[data-team-search]");
const status = $("[data-team-status]");
const empty = $("[data-team-empty]");
const bar = $("[data-team-bar]");
const allBtn = $("[data-team-all]");

for (const img of $$(".teacher-photo img", team)) {
  const box = img.parentElement;
  const done = () => { img.classList.add("is-loaded"); box.classList.remove("is-loading"); };
  if (img.complete && img.naturalWidth) done();
  else {
    box.classList.add("is-loading");
    img.addEventListener("load", done, { once: true });
    img.addEventListener("error", () => box.classList.remove("is-loading"), { once: true });
  }
}

const reveal = new IntersectionObserver((entries) => {
  for (const entry of entries) {
    if (!entry.isIntersecting) continue;
    entry.target.classList.add("is-in");
    reveal.unobserve(entry.target);
  }
}, { rootMargin: "0px 0px -12% 0px" });
cards.forEach((c) => reveal.observe(c));

// One by one: the section pins and each stretch of scrolling brings the next teacher. Pressing
// «نمایش همه» or searching gives the plain list instead. Under reduced motion the cards swap without moving.
let wantsDeck = true;
let index = -1;
const inDeck = () => track.classList.contains("is-deck");
const stepLen = () => innerHeight * 0.3;
const setIndex = (i) => {
  if (i === index) return;
  index = i;
  cards.forEach((c, n) => {
    c.classList.toggle("is-current", n === i);
    c.classList.toggle("is-near", Math.abs(n - i) <= 1);
    c.classList.toggle("is-before", n < i);
  });
  $("[data-team-now]").textContent = toPersianDigits(i + 1);
  $("[data-team-progress]").style.setProperty("--p", String((i + 1) / cards.length));
};
const syncDeck = () => {
  if (!inDeck()) return;
  const passed = -track.getBoundingClientRect().top;
  setIndex(Math.max(0, Math.min(cards.length - 1, Math.floor(passed / stepLen()))));
};
const setDeck = (on) => {
  if (on === inDeck()) return;
  track.classList.toggle("is-deck", on);
  bar.hidden = false;
  $("[data-team-prev]").hidden = $("[data-team-next]").hidden = !on;
  bar.querySelector(".team-count").hidden = bar.querySelector(".team-progress").hidden = !on;
  allBtn.textContent = on ? "نمایش همه" : "نمایش یکی‌یکی";
  index = -1;
  if (on) syncDeck();
  else cards.forEach((c) => c.classList.remove("is-current", "is-near", "is-before"));
};
const goTo = (i) => scrollTo({ top: scrollY + track.getBoundingClientRect().top + (i + 0.5) * stepLen(), behavior: reduceMotion.matches ? "auto" : "smooth" });
track.style.setProperty("--steps", String(cards.length));
$("[data-team-total]").textContent = toPersianDigits(cards.length);
$("[data-team-prev]").addEventListener("click", () => goTo(Math.max(0, index - 1)));
$("[data-team-next]").addEventListener("click", () => (index >= cards.length - 1 ? $("#faq").scrollIntoView() : goTo(index + 1)));
allBtn.addEventListener("click", () => {
  wantsDeck = !inDeck();
  setDeck(wantsDeck);
  track.scrollIntoView();
});
let deckTick = false;
addEventListener("scroll", () => {
  if (deckTick) return;
  deckTick = true;
  requestAnimationFrame(() => { syncDeck(); deckTick = false; });
}, { passive: true });
setDeck(wantsDeck);

const items = cards.map((c) => searchItem(`${$(".teacher-name", c).textContent} ${$(".teacher-role", c).textContent}`, c.textContent));

function applyTeamSearch() {
  const q = search.value.trim();
  const { matches, partial } = searchTeachers(items, q);
  // results are a list; clearing the search goes back to one by one
  setDeck(!q && wantsDeck);
  cards.forEach((c, i) => {
    const show = !q || matches.has(i);
    c.hidden = !show;
    if (show) c.classList.add("is-in");
  });
  const shown = q ? matches.size : cards.length;
  empty.hidden = shown > 0;
  status.textContent = !q ? "" : partial
    ? `نتیجه‌ی دقیقی نبود؛ ${toPersianDigits(shown)} نفر مرتبط`
    : `${toPersianDigits(shown)} نفر از ${toPersianDigits(cards.length)} نفر`;
}
let searchTimer;
search.addEventListener("input", () => { clearTimeout(searchTimer); searchTimer = setTimeout(applyTeamSearch, 120); });
$("[data-team-reset]").addEventListener("click", () => {
  search.value = "";
  applyTeamSearch();
  search.focus();
});

/* callback request */
createFormController({
  form: $("[data-inquiry]"),
  validate: validateInquiry,
  draftKey: "inquiry-draft",
  success: "درخواست ثبت شد. مشاور مدرسه شنبه تا چهارشنبه، ساعت ۷ تا ۱۴ با شما تماس می‌گیرد.",
  review: (v) => [["نام ولی", v.parentName], ["شماره همراه", toPersianDigits(v.phone)], ["پایه", GRADE_LABEL[v.grade]], ["پیام", v.message]],
});
