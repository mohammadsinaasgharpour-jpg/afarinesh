// کتابخانه مدرسه آفرینش: catalog loading, search, sorting, the shelf and the details dialog. No dependencies.
"use strict";

// the live catalog (edited in the admin panel); the static export is the fallback
const DATA_URLS = ["/api/books", "data/books.json"];
const { faDigits, parseQuery, filterBooks, index } = window.AfarinashText;
const SPINES = 8; // --spine-1 … --spine-8 in styles.css
const SHELF_SIZE = 44;
const PREVIEW = 3;
const FIELDS = [["author", "نویسنده"], ["translator", "مترجم"], ["publisher", "ناشر"]];
const SORTS = new Set(["number", "title", "author"]);
const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)");

const $ = (id) => document.getElementById(id);
const els = {
  form: $("search-form"), search: $("search"), clear: $("search-clear"), kbd: $("search-kbd"), sort: $("sort"),
  count: $("result-count"), list: $("books"), empty: $("empty"), emptyQuery: $("empty-query"), emptyReset: $("empty-reset"),
  error: $("load-error"), retry: $("retry"), summary: $("intro-summary"), shelf: $("shelf"), tip: $("shelf-tip"),
  dialog: $("book-dialog"), dCard: document.querySelector("#book-dialog .dialog-card"), dClose: $("dialog-close"),
  dNumber: $("dialog-number"), dTitle: $("dialog-title"), dFields: $("dialog-fields"), dEmpty: $("dialog-empty"),
  dRelated: $("dialog-related"), dRelatedTitle: $("related-title"), dRelatedList: $("related-list"),
  copy: $("copy-link"), dRequest: $("dialog-request"), toast: $("toast"),
  wallBooks: $("wall-books"), wallAuthors: $("wall-authors"), wallPublishers: $("wall-publishers"),
  more: $("more"), moreStatus: $("more-status"), moreBtn: $("more-btn"),
  jump: $("jump"),
};

let books = [];
const byId = new Map();
const collator = new Intl.Collator("fa", { sensitivity: "base", numeric: true });

/* ---------- helpers ---------- */

function el(tag, attrs = {}, text) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  if (text != null) node.textContent = text;
  return node;
}

function spineFor(book) {
  let h = 0;
  for (const ch of book.id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return { color: `var(--spine-${(h % SPINES) + 1})`, seed: h };
}

let toastTimer;
function toast(message) {
  els.toast.textContent = message;
  els.toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { els.toast.hidden = true; }, 3000);
}

/* ---------- URL state: ?q= search, ?sort= order, ?book= open book ---------- */

function readUrl() {
  const p = new URL(location.href).searchParams;
  return { q: p.get("q") || "", sort: SORTS.has(p.get("sort")) ? p.get("sort") : "number", book: p.get("book") };
}

function writeUrl(changes) {
  const url = new URL(location.href);
  for (const [k, v] of Object.entries(changes)) {
    if (v && !(k === "sort" && v === "number")) url.searchParams.set(k, v);
    else url.searchParams.delete(k);
  }
  history.replaceState(null, "", url);
}

/* ---------- sort ---------- */

function sortBooks(list, key) {
  const byNumber = (a, b) => a.number - b.number || collator.compare(a.id, b.id);
  const byTitle = (a, b) => collator.compare(a.title, b.title) || byNumber(a, b);
  const sorted = [...list];
  if (key === "title") sorted.sort(byTitle);
  else if (key === "author") {
    // books without a recorded author go last, so the sort does not imply one
    sorted.sort((a, b) => (!a.author - !b.author) || collator.compare(a.author || "", b.author || "") || byTitle(a, b));
  } else sorted.sort(byNumber);
  return sorted;
}

/* ---------- catalog cards ---------- */

function bookCard(book) {
  const li = el("li");
  const card = el("article", { class: "book", "aria-labelledby": `t-${book.id}` });
  card.style.setProperty("--c", spineFor(book).color);
  card.append(el("span", { class: "book-number" }, `شماره ${faDigits(book.number)}`));

  const h3 = el("h3", { class: "book-title" });
  const open = el("button", { type: "button", class: "book-open", id: `t-${book.id}`, "aria-haspopup": "dialog", "data-id": book.id }, book.title);
  h3.append(open);
  card.append(h3);

  const people = FIELDS.slice(0, 2).filter(([k]) => book[k]);
  if (people.length) {
    const dl = el("dl", { class: "book-meta" });
    for (const [k, label] of people) {
      const row = el("div");
      row.append(el("dt", {}, label), el("dd", {}, book[k]));
      dl.append(row);
    }
    card.append(dl);
  }
  const foot = el("div", { class: "book-foot" });
  if (book.publisher) foot.append(el("p", { class: "book-publisher" }, `نشر ${book.publisher}`));
  foot.append(el("button", { type: "button", class: "request-btn", "data-request": book.id, "aria-haspopup": "dialog", "aria-label": `درخواست امانت «${book.title}»` }, "درخواست امانت"));
  card.append(foot);
  li.append(card);
  return li;
}

// one listener for every card instead of 105
els.list.addEventListener("click", (e) => {
  const req = e.target.closest(".request-btn");
  if (req) return openRequest(byId.get(req.dataset.request), req);
  const btn = e.target.closest(".book-open");
  if (btn) openDetails(byId.get(btn.dataset.id), btn);
});

// Browsing shows only the first PREVIEW books; "show more" opens the rest. A search shows every match.
let result = [];
let shown = 0;

let animateCards = true; // off for the first draw over server-rendered cards, so they don't "arrive" twice

function appendCards(from, to) {
  const frag = document.createDocumentFragment();
  for (let i = from; i < to; i++) {
    const li = bookCard(result[i]);
    if (animateCards) li.classList.add("enter");
    li.style.setProperty("--d", `${Math.min(i - from, 12) * 40}ms`); // 40ms per card (transitions.dev stagger), capped so long lists don't drag
    frag.append(li);
  }
  els.list.append(frag);
  shown = to;
  updateMore();
}

function updateMore() {
  const rest = result.length - shown;
  els.more.hidden = rest <= 0;
  if (rest <= 0) return;
  els.moreStatus.textContent = `${faDigits(shown)} کتاب از ${faDigits(result.length)} کتاب نمایش داده شده است`;
  els.moreBtn.textContent = `نمایش بیشتر (${faDigits(rest)} کتاب دیگر)`;
}

function revealMore() {
  const from = shown;
  appendCards(from, result.length);
  // keyboard users continue from the first book that just appeared
  els.list.children[from]?.querySelector(".book-open")?.focus({ preventScroll: true });
}

function render() {
  const raw = els.search.value;
  const query = parseQuery(raw);
  result = filterBooks(sortBooks(books, els.sort.value), query);

  els.list.replaceChildren();
  appendCards(0, query.tokens.length ? result.length : Math.min(PREVIEW, result.length));
  els.list.setAttribute("aria-busy", "false");

  const searching = query.tokens.length > 0;
  els.empty.hidden = result.length > 0;
  els.list.hidden = result.length === 0;
  els.emptyQuery.textContent = raw.trim();
  els.clear.hidden = !raw;
  els.kbd.hidden = Boolean(raw);
  els.count.replaceChildren();
  if (searching) {
    els.count.append(el("strong", {}, faDigits(result.length)), ` کتاب از ${faDigits(books.length)} کتاب پیدا شد`);
  } else {
    els.count.append("همه ", el("strong", {}, faDigits(books.length)), " کتاب کتابخانه");
  }
}

/* ---------- the shelf: real catalog entries, each one opens its book ---------- */

function renderShelf() {
  const frag = document.createDocumentFragment();
  // an even spread across the catalog rather than only the first numbers
  const step = Math.max(1, books.length / SHELF_SIZE);
  const picks = Array.from({ length: Math.min(SHELF_SIZE, books.length) }, (_, i) => books[Math.floor(i * step)]);
  picks.forEach((b, i) => {
    const { color, seed } = spineFor(b);
    const s = el("button", { type: "button", class: "spine", "aria-label": `${b.title}، شماره ${faDigits(b.number)}`, "data-id": b.id, tabindex: i === 0 ? "0" : "-1" });
    s.style.setProperty("--c", color);
    s.style.setProperty("--h", `${56 + (seed % 40)}%`);
    s.style.setProperty("--w", `${15 + Math.min(15, Math.round(b.title.length / 3))}px`);
    s.style.setProperty("--i", i);
    if (i % 11 === 6) s.classList.add("lean");
    if (seed % 5 === 0) s.classList.add("band");
    frag.append(s);
  });
  els.shelf.replaceChildren(frag);
}

function showTip(spine) {
  const b = byId.get(spine.dataset.id);
  els.tip.textContent = `${b.title}، شماره ${faDigits(b.number)}`;
  const shelfBox = els.shelf.getBoundingClientRect();
  const box = spine.getBoundingClientRect();
  els.tip.style.insetInlineStart = "0px";
  els.tip.classList.add("show");
  // keep the tip above the spine but inside the shelf
  const tipW = els.tip.offsetWidth;
  const fromRight = shelfBox.right - box.right + box.width / 2 - tipW / 2;
  els.tip.style.insetInlineStart = `${Math.max(0, Math.min(fromRight, shelfBox.width - tipW))}px`;
}
const hideTip = () => els.tip.classList.remove("show");

els.shelf.addEventListener("click", (e) => {
  const s = e.target.closest(".spine");
  if (s) openDetails(byId.get(s.dataset.id), s);
});
els.shelf.addEventListener("pointerover", (e) => { const s = e.target.closest(".spine"); if (s && e.pointerType === "mouse") showTip(s); });
els.shelf.addEventListener("pointerleave", hideTip);
els.shelf.addEventListener("focusin", (e) => { if (e.target.matches(".spine:focus-visible")) showTip(e.target); });
els.shelf.addEventListener("focusout", hideTip);
// roving focus: the shelf is one tab stop; arrow keys move along it (RTL: ArrowLeft goes forward)
els.shelf.addEventListener("keydown", (e) => {
  const spines = [...els.shelf.querySelectorAll(".spine")];
  const i = spines.indexOf(document.activeElement);
  if (i < 0) return;
  const moves = { ArrowLeft: 1, ArrowRight: -1, Home: -i, End: spines.length - 1 - i };
  if (!(e.key in moves)) return;
  e.preventDefault();
  const next = spines[Math.max(0, Math.min(spines.length - 1, i + moves[e.key]))];
  spines[i].tabIndex = -1;
  next.tabIndex = 0;
  next.focus();
});

// the three numbers on the wall, counted from the catalog itself
function renderSummary() {
  const count = (key) => new Set(books.map((b) => b[key]).filter(Boolean)).size;
  els.wallBooks.textContent = faDigits(books.length);
  els.wallAuthors.textContent = faDigits(count("author"));
  els.wallPublishers.textContent = faDigits(count("publisher"));
}

/* ---------- the jump button: down to the end of the page, or back up to the top ---------- */

let jumpUp = null;
function updateJump() {
  const max = document.documentElement.scrollHeight - innerHeight;
  els.jump.hidden = max < innerHeight * 0.5; // a short page (e.g. a search with few results) needs no button
  const up = scrollY > max / 2;
  if (up === jumpUp) return;
  jumpUp = up;
  els.jump.classList.toggle("up", up);
  els.jump.setAttribute("aria-label", up ? "رفتن به بالای صفحه" : "رفتن به پایین صفحه");
  els.jump.title = els.jump.getAttribute("aria-label");
}
let jumpQueued = false;
const queueJump = () => {
  if (jumpQueued) return;
  jumpQueued = true;
  requestAnimationFrame(() => { jumpQueued = false; updateJump(); });
};
addEventListener("scroll", queueJump, { passive: true });
addEventListener("resize", queueJump, { passive: true });
els.jump.addEventListener("click", () => {
  const behavior = reduceMotion.matches ? "auto" : "smooth";
  if (jumpUp) {
    scrollTo({ top: 0, behavior });
    els.search.focus({ preventScroll: true });
  } else {
    scrollTo({ top: document.documentElement.scrollHeight, behavior });
  }
});
new ResizeObserver(queueJump).observe(document.body); // "show more" and searches change the page height
// over the navy footer the navy button would vanish, so it switches to the school's yellow there
new IntersectionObserver(([entry]) => els.jump.classList.toggle("on-dark", entry.isIntersecting), { rootMargin: "0px 0px -40px 0px" })
  .observe(document.querySelector(".site-footer"));

/* ---------- details dialog ---------- */

let returnFocus = null;
let current = null;

function openDetails(book, from) {
  if (!book) return;
  if (from) returnFocus = from;
  current = book;
  els.dCard.style.setProperty("--c", spineFor(book).color);
  els.dNumber.textContent = `شماره کتاب ${faDigits(book.number)}`;
  els.dTitle.textContent = book.title;

  const fields = FIELDS.filter(([k]) => book[k]);
  els.dFields.replaceChildren(...fields.flatMap(([k, label]) => [el("dt", {}, label), el("dd", {}, book[k])]));
  els.dFields.hidden = fields.length === 0;
  els.dEmpty.hidden = fields.length > 0;

  const shared = books.filter((b) => b.number === book.number && b.id !== book.id);
  const sameAuthor = book.author ? books.filter((b) => b.author === book.author && b.id !== book.id) : [];
  const related = shared.length ? shared : sameAuthor;
  els.dRelated.hidden = related.length === 0;
  if (related.length) {
    els.dRelatedTitle.textContent = shared.length
      ? `کتاب دیگری با همین شماره (${faDigits(book.number)})`
      : `کتاب‌های دیگر از ${book.author}`;
    els.dRelatedList.replaceChildren(...sortBooks(related, "number").map((b) => {
      const li = el("li");
      const btn = el("button", { type: "button", class: "link-button" }, `${b.title} (شماره ${faDigits(b.number)})`);
      btn.addEventListener("click", () => openDetails(b));
      li.append(btn);
      return li;
    }));
  }

  writeUrl({ book: book.id });
  if (!els.dialog.open) els.dialog.showModal();
  els.dClose.focus();
}

// runs once per close, whichever way the dialog was closed
function afterClose() {
  if (!current) return;
  writeUrl({ book: null });
  current = null;
  if (returnFocus && document.contains(returnFocus)) returnFocus.focus();
  returnFocus = null;
}

function closeDetails() {
  if (!els.dialog.open || els.dialog.classList.contains("closing")) return;
  const finish = () => { els.dialog.classList.remove("closing"); els.dialog.close(); afterClose(); };
  if (reduceMotion.matches) return finish();
  els.dialog.classList.add("closing");
  setTimeout(finish, 150); // the close animation (--d-quick)
}

els.dialog.addEventListener("cancel", (e) => { e.preventDefault(); closeDetails(); }); // Escape, with the closing motion
els.dialog.addEventListener("close", afterClose);
els.dClose.addEventListener("click", closeDetails);
els.dialog.addEventListener("click", (e) => { if (e.target === els.dialog) closeDetails(); }); // backdrop

els.copy.addEventListener("click", async () => {
  if (!current) return;
  const url = new URL(location.origin + location.pathname);
  url.searchParams.set("book", current.id);
  try {
    await navigator.clipboard.writeText(url.href);
    toast("پیوند این کتاب کپی شد.");
  } catch {
    toast("کپی ممکن نشد؛ نشانی صفحه را از نوار مرورگر کپی کنید.");
  }
});

document.getElementById("copy-site")?.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(`${location.origin}/`);
    toast("نشانی سایت کپی شد.");
  } catch {
    toast("کپی ممکن نشد؛ نشانی صفحه را از نوار مرورگر کپی کنید.");
  }
});

els.dRequest.addEventListener("click", () => {
  const book = current;
  const back = returnFocus;
  // the details close first, so only one dialog is ever open; focus later returns to where the visitor started
  returnFocus = null; // the details' close handler runs after this and must not pull focus behind the form
  els.dialog.classList.remove("closing");
  els.dialog.close();
  openRequest(book, back);
});

/* ---------- borrowing request: name, grade, class and how long, sent to the librarian ---------- */

const MAX_DAYS = 14; // two weeks; the server enforces the same limit
const rq = {
  dialog: $("request-dialog"), close: $("request-close"), step: $("request-step"), book: $("request-book"),
  form: $("request-form"), name: $("rq-name"), grade: $("rq-grade"), cls: $("rq-class"), daysBox: $("days-custom"),
  days: $("rq-days"), error: $("request-error"), submit: $("request-submit"), cancel: $("request-cancel"),
  done: $("request-done"), doneTitle: $("done-title"), doneText: $("done-text"), doneCode: $("done-code"), doneClose: $("done-close"),
};
let rqBook = null;
let rqFrom = null;
let rqStarted = 0;
let rqBusy = false;

const toLatin = (s) => String(s).replace(/[۰-۹]/g, (d) => d.charCodeAt(0) - 0x06f0).replace(/[٠-٩]/g, (d) => d.charCodeAt(0) - 0x0660);
const period = () => rq.form.elements.period.value;

function fieldError(input, errorId, message) {
  input.setAttribute("aria-invalid", message ? "true" : "false");
  $(errorId).textContent = message || "";
}

function openRequest(book, from) {
  if (!book) return;
  rqBook = book;
  rqFrom = from || null;
  rq.book.replaceChildren(el("span", {}, `شماره ${faDigits(book.number)}`), book.title);
  rq.step.hidden = false;
  rq.done.hidden = true;
  rq.error.hidden = true;
  for (const [input, id] of [[rq.name, "rq-name-error"], [rq.grade, "rq-grade-error"], [rq.cls, "rq-class-error"], [rq.days, "rq-days-error"]]) fieldError(input, id, "");
  rqStarted = Date.now();
  if (!rq.dialog.open) rq.dialog.showModal();
  rq.name.focus();
}

function closeRequest() {
  if (!rq.dialog.open) return;
  rq.dialog.close();
}
rq.dialog.addEventListener("close", () => {
  if (rqFrom && document.contains(rqFrom)) rqFrom.focus();
  rqFrom = null;
});
rq.close.addEventListener("click", closeRequest);
rq.cancel.addEventListener("click", closeRequest);
rq.doneClose.addEventListener("click", closeRequest);
rq.dialog.addEventListener("click", (e) => { if (e.target === rq.dialog) closeRequest(); });

rq.form.addEventListener("change", (e) => {
  if (e.target.name !== "period") return;
  rq.daysBox.hidden = period() !== "custom";
  if (!rq.daysBox.hidden) rq.days.focus();
});

function checkRequest() {
  const name = rq.name.value.trim().replace(/\s+/g, " ");
  const cls = rq.cls.value.trim();
  const days = period() === "custom" ? Number(toLatin(rq.days.value.trim())) : Number(period());
  const errors = {
    name: name.length < 3 || !/^[\p{L}\p{M}][\p{L}\p{M}‌ .'-]*$/u.test(name) ? "نام و نام خانوادگی را با حروف بنویسید." : "",
    grade: rq.grade.value ? "" : "پایه را انتخاب کنید.",
    className: cls && /^[\p{L}\p{N}][\p{L}\p{N}‌ /-]*$/u.test(cls) ? "" : "کلاس را بنویسید (مثلاً ۲).",
    days: Number.isInteger(days) && days >= 1 && days <= MAX_DAYS ? "" : "مدت امانت باید بین ۱ تا ۱۴ روز باشد.",
  };
  return { name, cls, days, errors };
}

function showErrors(errors) {
  fieldError(rq.name, "rq-name-error", errors.name);
  fieldError(rq.grade, "rq-grade-error", errors.grade);
  fieldError(rq.cls, "rq-class-error", errors.className);
  fieldError(rq.days, "rq-days-error", errors.days);
  const first = [[errors.name, rq.name], [errors.grade, rq.grade], [errors.className, rq.cls], [errors.days, period() === "custom" ? rq.days : rq.form.querySelector('input[name="period"]:checked')]]
    .find(([m]) => m);
  if (first) first[1].focus();
  return Boolean(first);
}

rq.form.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (rqBusy || !rqBook) return;
  rq.error.hidden = true;
  const { name, cls, days, errors } = checkRequest();
  if (showErrors(errors)) return;

  rqBusy = true;
  rq.submit.disabled = true;
  rq.submit.classList.add("is-busy");
  let res = null;
  let data = {};
  try {
    res = await fetch("/api/request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        bookId: rqBook.id, name, grade: rq.grade.value, className: cls, days,
        website: rq.form.elements.website.value, startedAt: rqStarted,
      }),
      signal: AbortSignal.timeout(15000),
    });
    data = await res.json().catch(() => ({}));
  } catch { /* offline or timed out: handled below */ }
  rqBusy = false;
  rq.submit.disabled = false;
  rq.submit.classList.remove("is-busy");

  if (res?.ok) {
    rq.doneText.textContent = `درخواست امانت «${rqBook.title}» برای ${faDigits(days)} روز (تا ${data.dueLabel}) برای کتابدار مدرسه فرستاده شد.`;
    rq.doneCode.textContent = data.id || "";
    rq.step.hidden = true;
    rq.done.hidden = false;
    rq.form.reset();
    rq.daysBox.hidden = true;
    rq.doneTitle.focus();
    return;
  }
  if (res?.status === 422 && data.errors) {
    if (data.errors.book) rq.error.textContent = data.errors.book;
    if (!showErrors(data.errors) && !data.errors.book) rq.error.textContent = "اطلاعات فرم را بررسی کنید.";
    rq.error.hidden = !rq.error.textContent;
    return;
  }
  rq.error.textContent = !res ? "اتصال برقرار نشد. اینترنت را بررسی کنید و دوباره بفرستید."
    : res.status === 429 && data.error === "duplicate" ? "این درخواست را چند دقیقه پیش فرستاده‌اید؛ نیازی به فرستادن دوباره نیست."
    : res.status === 429 ? "درخواست‌های زیادی از این دستگاه فرستاده شده است. چند دقیقه بعد دوباره امتحان کنید."
    : res.status === 503 ? "فرستادن درخواست الان ممکن نیست. لطفاً حضوری به کتابدار مدرسه بگویید."
    : "درخواست فرستاده نشد. دوباره امتحان کنید.";
  rq.error.hidden = false;
});

/* ---------- search and sort controls ---------- */

els.search.addEventListener("input", () => { render(); writeUrl({ q: els.search.value.trim() }); });
els.form.addEventListener("submit", (e) => { e.preventDefault(); els.search.blur(); }); // Enter closes the phone keyboard
els.search.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && els.search.value) { e.preventDefault(); clearSearch(); }
});
els.sort.addEventListener("change", () => { render(); writeUrl({ sort: els.sort.value }); });

function clearSearch() {
  els.search.value = "";
  render();
  writeUrl({ q: null });
  els.search.focus();
}
els.clear.addEventListener("click", clearSearch);
els.emptyReset.addEventListener("click", clearSearch);

// "/" jumps to the search field from anywhere except while typing
document.addEventListener("keydown", (e) => {
  if (e.key !== "/" || e.ctrlKey || e.metaKey || e.altKey || els.dialog.open || rq.dialog.open) return;
  if (e.target instanceof Element && e.target.closest("input, textarea, select, [contenteditable]")) return;
  e.preventDefault();
  els.search.focus();
  els.search.select();
});

// the phone-only link in the intro: land in the field ready to type, not just next to it
document.querySelector(".intro-jump")?.addEventListener("click", (e) => {
  e.preventDefault();
  els.search.focus({ preventScroll: true });
  els.search.scrollIntoView({ block: "start" }); // honours scroll-padding, so the sticky header doesn't cover it
});

// the full hint does not fit a phone-width field
const narrow = matchMedia("(max-width: 40rem)");
const fullHint = els.search.placeholder;
const setHint = () => { els.search.placeholder = narrow.matches ? "عنوان، نام یا شماره کتاب…" : fullHint; };
narrow.addEventListener("change", setHint);
setHint();

/* ---------- loading ---------- */

// The homepage arrives with the catalog embedded (api/home.js); fetching is the fallback.
function embedded() {
  try {
    const json = JSON.parse($("catalog-data")?.textContent || "null");
    return json && Array.isArray(json.books) ? json : null;
  } catch { return null; }
}

async function load() {
  els.error.hidden = true;
  let data = embedded();
  animateCards = !data;
  if (!data) for (const url of DATA_URLS) {
    try {
      // a stalled request falls through to the next source instead of leaving the page on "loading"
      const res = await fetch(url, { cache: "no-cache", signal: AbortSignal.timeout(8000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (!Array.isArray(json.books)) throw new Error("no books array");
      data = json;
      break;
    } catch (err) {
      if (url === DATA_URLS.at(-1)) console.error("catalog load failed:", err);
    }
  }
  if (!data) {
    els.list.hidden = true;
    els.error.hidden = false;
    els.count.textContent = "";
    els.summary.textContent = "فهرست بارگذاری نشد.";
    return;
  }
  books = data.books.map(index);
  byId.clear();
  for (const b of books) byId.set(b.id, b);

  const state = readUrl();
  els.search.value = state.q;
  els.sort.value = state.sort;
  els.list.hidden = false;
  renderSummary();
  renderShelf();
  render();
  animateCards = true; // later batches ("show more", searches) animate in
  if (state.book && byId.has(state.book)) openDetails(byId.get(state.book));
}

els.retry.addEventListener("click", load);
els.moreBtn.addEventListener("click", revealMore);
load();
