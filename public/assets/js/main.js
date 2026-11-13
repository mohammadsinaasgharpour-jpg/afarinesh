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

/* FAQ: opening one question closes the others (browsers without the details name attribute) */
const faqItems = $$(".faq details");
faqItems.forEach((d) => d.addEventListener("toggle", () => {
  if (d.open) faqItems.forEach((o) => { if (o !== d && o.open) o.open = false; });
}));

const reveal = new IntersectionObserver((entries) => {
  for (const entry of entries) {
    if (!entry.isIntersecting) continue;
    entry.target.classList.add("is-in");
    reveal.unobserve(entry.target);
  }
}, { rootMargin: "0px 0px -12% 0px" });
cards.forEach((c) => reveal.observe(c));

// One by one: the section pins and each short stretch of scrolling (or one arrow key) brings the next
// teacher. Once the visitor has scrolled past the last one the section stops pinning for the rest of the
// visit, so scrolling back up does not replay the list; the buttons and the faces still change teacher.
// Pressing «نمایش همه» or searching gives the plain list instead.
let wantsDeck = true;
let index = -1;
let done = false;
try { done = sessionStorage.getItem("team-seen") === "1"; } catch {}
const inDeck = () => track.classList.contains("is-deck");
const stepLen = () => innerHeight * 0.14;
const phone = matchMedia("(max-width: 700px)");
const inSwipe = () => track.classList.contains("is-swipe");

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
/* phones: swipe mode, no pinning */
// the horizontal distance that centres card i in the row (from the rectangles, so it works right to left)
const swipeTo = (i, smooth = true) => {
  i = Math.max(0, Math.min(cards.length - 1, i));
  const row = team.getBoundingClientRect();
  const card = cards[i].getBoundingClientRect();
  team.scrollBy({ left: card.left - row.left - (row.width - card.width) / 2, behavior: smooth && !reduceMotion.matches ? "smooth" : "instant" });
  setIndex(i);
};
const nearestCard = () => {
  const row = team.getBoundingClientRect();
  const mid = row.left + row.width / 2;
  let best = 0, dist = Infinity;
  cards.forEach((c, n) => {
    const r = c.getBoundingClientRect();
    const d = Math.abs(r.left + r.width / 2 - mid);
    if (d < dist) { dist = d; best = n; }
  });
  return best;
};
let swipeTick = false;
team.addEventListener("scroll", () => {
  if (!inSwipe() || swipeTick) return;
  swipeTick = true;
  requestAnimationFrame(() => { setIndex(nearestCard()); swipeTick = false; });
}, { passive: true });

const pinned = () => {
  const r = track.getBoundingClientRect();
  return inDeck() && !done && r.top <= 80 && r.bottom >= innerHeight - 4;
};
const finish = () => {
  // the track shrinks to one screen; move the page by the same amount so nothing jumps
  // (measured on the next section, which also covers the browser clamping scrollY on the shorter page)
  // Browser scroll anchoring is paused meanwhile, or it would correct the same shift a second time.
  const anchor = track.nextElementSibling;
  const was = anchor.getBoundingClientRect().top;
  const html = document.documentElement;
  html.style.overflowAnchor = "none";
  done = true;
  track.classList.add("is-done");
  scrollBy({ top: anchor.getBoundingClientRect().top - was, behavior: "instant" });
  requestAnimationFrame(() => { html.style.overflowAnchor = ""; });
  try { sessionStorage.setItem("team-seen", "1"); } catch {}
};
const syncDeck = () => {
  if (!inDeck() || done) return;
  const r = track.getBoundingClientRect();
  if (r.bottom < innerHeight * 0.6) { setIndex(cards.length - 1); finish(); return; }
  setIndex(Math.max(0, Math.min(cards.length - 1, Math.floor(-r.top / stepLen()))));
};
// on: one at a time (pinned deck on wide screens, swipe row on phones); off: the plain list
const setDeck = (on) => {
  const mode = !on ? "list" : phone.matches ? "swipe" : "deck";
  const was = inDeck() ? "deck" : inSwipe() ? "swipe" : "list";
  if (mode === was) return;
  track.classList.toggle("is-deck", mode === "deck");
  track.classList.toggle("is-swipe", mode === "swipe");
  track.classList.toggle("is-done", mode === "deck" && done);
  bar.hidden = false;
  $("[data-team-prev]").hidden = $("[data-team-next]").hidden = !on;
  bar.querySelector(".team-count").hidden = bar.querySelector(".team-progress").hidden = !on;
  allBtn.textContent = on ? "نمایش همه" : "نمایش یکی‌یکی";
  index = -1;
  if (mode === "swipe") { team.scrollLeft = 0; setIndex(0); }
  else if (mode === "deck" && done) setIndex(0);
  else if (mode === "deck") syncDeck();
  else cards.forEach((c) => c.classList.remove("is-current", "is-near", "is-before"));
};
const goTo = (i) => {
  i = Math.max(0, Math.min(cards.length - 1, i));
  if (inSwipe()) return swipeTo(i);
  if (done) return setIndex(i);
  scrollTo({ top: scrollY + track.getBoundingClientRect().top + (i + 0.5) * stepLen(), behavior: "instant" });
  setIndex(i);
};
phone.addEventListener("change", () => { if (wantsDeck && !search.value.trim()) { setDeck(false); setDeck(true); } });
track.style.setProperty("--steps", String(cards.length));
// the scroll length is set in pixels from the same numbers the script counts with
const sizeDeck = () => { track.style.setProperty("--deck-h", `${innerHeight}px`); track.style.setProperty("--step-len", `${stepLen()}px`); };
sizeDeck();
addEventListener("resize", sizeDeck);
$("[data-team-total]").textContent = toPersianDigits(cards.length);
$("[data-team-prev]").addEventListener("click", () => goTo(index - 1));
$("[data-team-next]").addEventListener("click", () => (index >= cards.length - 1 && inDeck() && !done ? $("#faq").scrollIntoView() : goTo(index + 1)));
allBtn.addEventListener("click", () => {
  wantsDeck = !(inDeck() || inSwipe());
  setDeck(wantsDeck);
  track.scrollIntoView();
});
// while pinned, one arrow key (or Page Up/Down) is one teacher
addEventListener("keydown", (e) => {
  if (!pinned() || e.altKey || e.ctrlKey || e.metaKey || e.target.closest?.("input, textarea, select")) return;
  const dir = { ArrowDown: 1, PageDown: 1, ArrowUp: -1, PageUp: -1 }[e.key];
  if (!dir) return;
  const next = index + dir;
  if (next < 0 || next >= cards.length) return; // at either end the key scrolls the page as usual
  e.preventDefault();
  goTo(next);
});
let deckTick = false;
addEventListener("scroll", () => {
  if (deckTick) return;
  deckTick = true;
  requestAnimationFrame(() => { syncDeck(); deckTick = false; });
}, { passive: true });
setDeck(wantsDeck);

// the search index is built on first use, not while the page loads
let items;
const searchItems = () => (items ??= cards.map((c) => searchItem(`${$(".teacher-name", c).textContent} ${$(".teacher-role", c).textContent}`, c.textContent)));

function applyTeamSearch() {
  const q = search.value.trim();
  const { matches, partial } = searchTeachers(searchItems(), q);
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
