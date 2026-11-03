import { validateInquiry, toPersianDigits, GRADE_LABEL } from "./validate.js";
import { searchItem, searchTeachers } from "./search.js";
import { $, $$, initChrome, createFormController } from "./common.js";

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

/* team: skeleton, reveal on scroll, search */
const team = $("[data-team]");
const cards = $$(".teacher", team);
const search = $("[data-team-search]");
const status = $("[data-team-status]");
const empty = $("[data-team-empty]");

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

const items = cards.map((c) => searchItem(`${$("h3", c).textContent} ${$(".teacher-role", c).textContent}`, c.textContent));

function applyTeamSearch() {
  const q = search.value.trim();
  const { matches, partial } = searchTeachers(items, q);
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
