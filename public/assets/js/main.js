import { validateInquiry, toPersianDigits, GRADE_LABEL } from "./validate.js";
import { fold, searchTeachers } from "./search.js";

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)");

/* ---------- toasts ---------- */
const toastBox = $("[data-toasts]");
function toast(text, kind = "ok", ms = 5200) {
  const el = document.createElement("div");
  el.className = `toast ${kind}`;
  el.setAttribute("role", kind === "err" ? "alert" : "status");
  el.innerHTML = `<svg class="ic" aria-hidden="true"><use href="#i-${kind === "err" ? "alert" : "check"}"/></svg><span></span>`;
  el.lastChild.textContent = text;
  toastBox.append(el);
  setTimeout(() => {
    el.classList.add("out");
    setTimeout(() => el.remove(), reduceMotion.matches ? 0 : 260);
  }, ms);
}

/* ---------- theme ---------- */
// The inline script in <head> picks light before 18:00 and dark after; the button overrides it for this visit.
const themeBtn = $("[data-theme-toggle]");
const themeMeta = $('meta[name="theme-color"]');
const isDark = () => document.documentElement.dataset.theme === "dark";
function syncTheme() {
  themeBtn.setAttribute("aria-label", isDark() ? "تغییر به حالت روشن" : "تغییر به حالت تاریک");
  if (themeMeta) themeMeta.content = isDark() ? "#0d2131" : "#f6f8fa";
}
themeBtn.addEventListener("click", () => {
  const next = isDark() ? "light" : "dark";
  document.documentElement.dataset.theme = next;
  try { sessionStorage.setItem("theme", next); } catch {}
  syncTheme();
});
syncTheme();

/* ---------- header: menu, scrolled state, active link ---------- */
const header = $("[data-header]");
const nav = $("#nav");
const menuBtn = $("[data-menu]");
function setMenu(open) {
  nav.classList.toggle("is-open", open);
  menuBtn.setAttribute("aria-expanded", String(open));
  menuBtn.setAttribute("aria-label", open ? "بستن منو" : "باز کردن منو");
}
menuBtn.addEventListener("click", () => setMenu(menuBtn.getAttribute("aria-expanded") !== "true"));
nav.addEventListener("click", (e) => { if (e.target.closest("a")) setMenu(false); });
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && nav.classList.contains("is-open")) { setMenu(false); menuBtn.focus(); }
});

const toTop = $("[data-to-top]");
let ticking = false;
addEventListener("scroll", () => {
  if (ticking) return;
  ticking = true;
  requestAnimationFrame(() => {
    header.classList.toggle("is-scrolled", scrollY > 8);
    toTop.hidden = scrollY < 900;
    ticking = false;
  });
}, { passive: true });
toTop.addEventListener("click", () => {
  scrollTo({ top: 0, behavior: reduceMotion.matches ? "auto" : "smooth" });
  $("#main").focus({ preventScroll: true });
});

const navLinks = $$('#nav a[href^="#"]');
const spy = new IntersectionObserver((entries) => {
  for (const entry of entries) {
    if (!entry.isIntersecting) continue;
    navLinks.forEach((a) => (a.hash === `#${entry.target.id}` ? a.setAttribute("aria-current", "true") : a.removeAttribute("aria-current")));
  }
}, { rootMargin: "-45% 0px -50% 0px" });
navLinks.forEach((a) => { const s = document.querySelector(a.hash); if (s) spy.observe(s); });

/* ---------- Instagram button fades while it covers text ---------- */
const fab = $(".insta-fab");
const TEXTY = "p, h1, h2, h3, li, a, dt, dd, label, summary, figcaption, img, input, textarea, button, .btn";
function fabOverText() {
  const r = fab.getBoundingClientRect();
  const points = [[r.left + r.width / 2, r.top + r.height / 2], [r.left + 4, r.top + 4], [r.right - 4, r.bottom - 4]];
  return points.some(([x, y]) => document.elementsFromPoint(x, y).some((el) => el !== fab && !fab.contains(el) && el.closest(TEXTY) && el.closest(TEXTY) !== fab));
}
let fabTick = false;
const updateFab = () => {
  if (fabTick) return;
  fabTick = true;
  requestAnimationFrame(() => { fab.classList.toggle("is-over-text", fabOverText()); fabTick = false; });
};
addEventListener("scroll", updateFab, { passive: true });
addEventListener("resize", updateFab);
updateFab();

/* ---------- images: no long-press save menu or drag-out ---------- */
document.addEventListener("contextmenu", (e) => { if (e.target.closest("img, picture, .brand")) e.preventDefault(); });
document.addEventListener("dragstart", (e) => { if (e.target.closest("img")) e.preventDefault(); });

/* ---------- team: skeleton, reveal on scroll, search ---------- */
document.documentElement.classList.add("js");
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

const items = cards.map((c) => ({
  primary: fold($("h3", c).textContent + $(".teacher-role", c).textContent),
  haystack: fold(c.textContent),
}));

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

/* ---------- inquiry form ---------- */
const form = $("[data-inquiry]");
const confirmDialog = $("[data-confirm-dialog]");
const submitBtn = $("[data-submit]");
const submitLabel = $("[data-submit-label]");
const counter = $("[data-count]");
const DRAFT_KEY = "inquiry-draft";
$("[data-started]").value = String(Date.now()); // the server ignores forms sent within seconds of page load (bots)

function readForm() {
  const fd = new FormData(form);
  return Object.fromEntries(["parentName", "phone", "grade", "message", "website", "startedAt"].map((k) => [k, fd.get(k) ?? ""]));
}
function errorSlot(name) {
  const field = form.elements[name];
  const el = field instanceof RadioNodeList ? field[0] : field;
  return $("[data-error]", el.closest(".field"));
}
function showErrors(errors, touchedOnly) {
  for (const name of ["parentName", "phone", "grade", "message"]) {
    const field = form.elements[name];
    const els = field instanceof RadioNodeList ? [...field] : [field];
    if (touchedOnly && !els.some((el) => el.dataset.touched)) continue;
    const msg = errors[name] || "";
    const slot = errorSlot(name);
    if (slot) slot.textContent = msg;
    els.forEach((el) => { el.setAttribute("aria-invalid", String(!!msg)); if (el.id) el.setAttribute("aria-describedby", `${el.id}-err`); });
  }
}
form.addEventListener("focusout", (e) => {
  if (!e.target.name) return;
  e.target.dataset.touched = "1";
  const r = validateInquiry(readForm());
  showErrors(r.ok ? {} : r.errors, true);
});
form.addEventListener("input", (e) => {
  if (e.target.name === "message") counter.textContent = toPersianDigits(e.target.value.length);
  if (e.target.getAttribute("aria-invalid") === "true") {
    const r = validateInquiry(readForm());
    showErrors(r.ok ? {} : r.errors, true);
  }
  try { const { website, startedAt, ...draft } = readForm(); sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft)); } catch {}
});

// restore an unsent draft (per tab)
try {
  const draft = JSON.parse(sessionStorage.getItem(DRAFT_KEY) || "null");
  if (draft) {
    for (const [k, v] of Object.entries(draft)) {
      const f = form.elements[k];
      if (!f || !v) continue;
      if (f instanceof RadioNodeList) f.value = v; else f.value = v;
    }
    counter.textContent = toPersianDigits(form.elements.message.value.length);
  }
} catch {}

let pending = null;
form.addEventListener("submit", (e) => {
  e.preventDefault();
  const data = readForm();
  const r = validateInquiry(data);
  if (!r.ok) {
    $$("input, textarea", form).forEach((el) => (el.dataset.touched = "1"));
    showErrors(r.errors, false);
    const first = Object.keys(r.errors)[0];
    const f = form.elements[first];
    (f instanceof RadioNodeList ? f[0] : f).focus();
    toast("چند مورد نیاز به اصلاح دارد. پیام زیر هر فیلد را ببینید.", "err");
    return;
  }
  showErrors({}, false);
  pending = { ...r.value, website: data.website, startedAt: Number(data.startedAt) || 0 };
  const rows = [["نام ولی", r.value.parentName], ["شماره همراه", toPersianDigits(r.value.phone)], ["پایه", GRADE_LABEL[r.value.grade]]];
  if (r.value.message) rows.push(["پیام", r.value.message]);
  $("[data-review]").replaceChildren(...rows.flatMap(([k, v]) => [
    Object.assign(document.createElement("dt"), { textContent: k }),
    Object.assign(document.createElement("dd"), { textContent: v }),
  ]));
  confirmDialog.showModal();
});

$("[data-confirm-no]").addEventListener("click", () => { confirmDialog.close(); form.elements.parentName.focus(); });
$("[data-confirm-yes]").addEventListener("click", async () => {
  confirmDialog.close();
  submitBtn.disabled = true;
  submitBtn.classList.add("is-busy");
  submitLabel.textContent = "در حال ارسال…";
  try {
    const res = await fetch(form.action, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(pending),
      signal: AbortSignal.timeout(12000),
    });
    const body = await res.json().catch(() => ({}));
    if (res.status === 422 && body.errors) { showErrors(body.errors, false); throw new Error("چند مورد نیاز به اصلاح دارد."); }
    if (res.status === 429) throw new Error("چند درخواست پشت سر هم ثبت شد. چند دقیقه بعد دوباره ارسال کنید.");
    if (res.status === 503) throw new Error("ارسال آنلاین فعلاً در دسترس نیست. لطفاً با ۰۷۱-۳۲۲۹۳۱۹۴ تماس بگیرید.");
    if (!res.ok) throw new Error();
    form.reset();
    counter.textContent = "۰";
    $$("[data-touched]", form).forEach((el) => delete el.dataset.touched);
    try { sessionStorage.removeItem(DRAFT_KEY); } catch {}
    toast("درخواست ثبت شد. مشاور مدرسه شنبه تا چهارشنبه، ساعت ۷ تا ۱۴ با شما تماس می‌گیرد.", "ok", 7000);
  } catch (err) {
    const msg = err?.message || "ارسال انجام نشد. اتصال اینترنت را بررسی کنید یا با ۰۷۱-۳۲۲۹۳۱۹۴ تماس بگیرید.";
    toast(err?.name === "TimeoutError" ? "پاسخی از سرور نرسید. دوباره امتحان کنید یا با ۰۷۱-۳۲۲۹۳۱۹۴ تماس بگیرید." : msg, "err", 8000);
  } finally {
    submitBtn.disabled = false;
    submitBtn.classList.remove("is-busy");
    submitLabel.textContent = "بررسی و ارسال";
  }
});
