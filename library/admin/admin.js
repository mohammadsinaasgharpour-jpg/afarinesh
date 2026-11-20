// Admin panel: sign in, then add, edit and delete books. Every change is checked and saved by /api/admin/catalog.
"use strict";

const $ = (id) => document.getElementById(id);
const FIELDS = ["number", "title", "author", "translator", "publisher"];
const LABELS = { number: "شماره", title: "عنوان", author: "نویسنده", translator: "مترجم", publisher: "ناشر" };

const state = { books: [], version: null, meta: {}, editing: null, deleting: null, filter: "all" };

/* ---------- small helpers ---------- */

function el(tag, attrs = {}, text) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  if (text != null) node.textContent = text;
  return node;
}

let toastTimer;
function toast(message) {
  const t = $("toast");
  t.textContent = message;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, 3500);
}

async function api(path, options = {}) {
  const res = await fetch(path, {
    credentials: "same-origin",
    headers: options.body ? { "Content-Type": "application/json" } : {},
    ...options,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  let data = {};
  try { data = await res.json(); } catch { /* empty body */ }
  return { status: res.status, ok: res.ok, data };
}

function show(view) {
  for (const id of ["login-view", "setup-view", "manage-view"]) $(id).hidden = id !== view;
  $("logout").hidden = view !== "manage-view";
}

const fa = (v) => window.AfarinashText.faDigits(v);

/* ---------- sign in / out ---------- */

async function start() {
  const { data } = await api("/api/session");
  if (!data.configured) return show("setup-view");
  if (!data.admin) {
    show("login-view");
    $("password").focus();
    return;
  }
  show("manage-view");
  await load();
  loadTelegram();
}

$("login-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const err = $("login-error");
  err.hidden = true;
  const password = $("password").value;
  if (!password) {
    err.textContent = "رمز پنل را وارد کنید.";
    err.hidden = false;
    return;
  }
  $("login-submit").disabled = true;
  const res = await api("/api/session", { method: "POST", body: { password } });
  $("login-submit").disabled = false;
  $("password").value = "";
  if (res.ok) return start();
  err.textContent = res.status === 401 ? "رمز درست نیست."
    : res.status === 429 ? `به‌خاطر چند تلاش نادرست، ورود از این دستگاه تا ${fa(Math.ceil((res.data.retryAfter || 900) / 60))} دقیقه دیگر بسته است.`
    : "ورود ممکن نشد. دوباره تلاش کنید.";
  err.hidden = false;
  $("password").focus();
});

$("logout").addEventListener("click", async () => {
  await api("/api/session", { method: "DELETE" });
  state.books = [];
  $("admin-rows").replaceChildren();
  show("login-view");
  toast("از پنل خارج شدید.");
});

/* ---------- catalog ---------- */

async function load() {
  const res = await api("/api/admin/catalog");
  if (res.status === 401) return start();
  if (!res.ok) return toast("فهرست بارگذاری نشد.");
  apply(res.data);
}

function apply({ data, version }) {
  state.version = version;
  state.meta = { updated: data.updated, exported: data.exported };
  state.books = data.books.map(window.AfarinashText.index);
  $("storage-notice").hidden = true;
  renderMeta();
  renderRows();
}

function renderMeta() {
  const stamp = state.meta.updated || (state.meta.exported && `${state.meta.exported}T12:00:00`);
  let when = "";
  if (stamp) {
    when = new Intl.DateTimeFormat("fa-IR-u-ca-persian", { dateStyle: "long", timeStyle: state.meta.updated ? "short" : undefined }).format(new Date(stamp));
  }
  $("manage-meta").textContent = `${fa(state.books.length)} کتاب در فهرست` +
    (when ? `؛ ${state.meta.updated ? "آخرین ذخیره" : "برگرفته از خروجی اکسل"}: ${when}` : "");
}

/* ---------- filters ---------- */

// Translator is not required: most books in the library were written in Persian and have none.
const REQUIRED = ["author", "publisher"];
const isIncomplete = (b) => REQUIRED.some((f) => !b[f]);

function numberCounts() {
  const counts = new Map();
  for (const b of state.books) counts.set(b.number, (counts.get(b.number) || 0) + 1);
  return counts;
}

// Numbers from 1 up to the highest number in use that no book has yet.
function gapNumbers() {
  const used = new Set(state.books.map((b) => b.number));
  const max = Math.max(0, ...used);
  const gaps = [];
  for (let n = 1; n <= max; n++) if (!used.has(n)) gaps.push(n);
  return { gaps, max };
}

const HINTS = {
  incomplete: "کتاب‌هایی که نویسنده یا ناشرشان ثبت نشده است. خانه‌های خالی با رنگ مشخص شده‌اند؛ با «ویرایش» کاملشان کنید. (نداشتن مترجم ناقص حساب نمی‌شود.)",
  shared: "کتاب‌هایی که شماره‌شان با کتاب دیگری یکی است. اگر واقعاً هر دو همین شماره را دارند، نیازی به تغییر نیست.",
  gaps: "شماره‌هایی که هنوز به هیچ کتابی داده نشده‌اند. روی هر شماره بزنید تا کتابی با همان شماره افزوده شود.",
};

for (const button of $("filter-tabs").querySelectorAll("button")) {
  button.addEventListener("click", () => {
    state.filter = button.dataset.filter;
    for (const b of $("filter-tabs").querySelectorAll("button")) b.setAttribute("aria-pressed", String(b === button));
    renderRows();
  });
}

function renderTabs(counts) {
  const n = {
    all: state.books.length,
    incomplete: state.books.filter(isIncomplete).length,
    shared: state.books.filter((b) => counts.get(b.number) > 1).length,
    gaps: gapNumbers().gaps.length,
  };
  for (const b of $("filter-tabs").querySelectorAll("button")) b.querySelector(".tab-count").textContent = fa(n[b.dataset.filter]);
  const hint = HINTS[state.filter];
  $("filter-hint").hidden = !hint;
  $("filter-hint").textContent = hint ?? "";
}

function renderGaps() {
  const { gaps, max } = gapNumbers();
  const digits = toDigits($("admin-search").value).replace(/\D/g, "");
  const shown = digits ? gaps.filter((n) => String(n).includes(digits)) : gaps;
  const frag = document.createDocumentFragment();
  for (const n of shown) {
    const add = el("button", { type: "button", "aria-label": `افزودن کتاب با شماره ${fa(n)}` }, fa(n));
    add.addEventListener("click", () => openEditor(null, n));
    const li = el("li");
    li.append(add);
    frag.append(li);
  }
  $("gap-list").replaceChildren(frag);
  $("gap-list").hidden = shown.length === 0;
  $("table-wrap").hidden = true;
  $("admin-empty").hidden = shown.length > 0;
  $("admin-empty").textContent = gaps.length ? "شماره خالی‌ای با این جست‌وجو پیدا نشد." : "همه شماره‌ها از ۱ تا آخرین شماره به کتابی داده شده‌اند.";
  $("admin-count").textContent = `${fa(shown.length)} شماره خالی از ۱ تا ${fa(max)}`;
}

function renderRows() {
  const { parseQuery, filterBooks } = window.AfarinashText;
  const counts = numberCounts();
  renderTabs(counts);
  if (state.filter === "gaps") return renderGaps();

  const q = parseQuery($("admin-search").value);
  const pool = state.filter === "incomplete" ? state.books.filter(isIncomplete)
    : state.filter === "shared" ? state.books.filter((b) => counts.get(b.number) > 1)
    : state.books;
  const rows = filterBooks(pool, q);
  $("gap-list").hidden = true;
  $("table-wrap").hidden = rows.length === 0;
  $("admin-empty").hidden = rows.length > 0;
  $("admin-empty").textContent = q.tokens.length ? "کتابی با این جست‌وجو پیدا نشد."
    : state.filter === "incomplete" ? "همه کتاب‌ها نویسنده و ناشر دارند."
    : state.filter === "shared" ? "هیچ شماره‌ای به بیش از یک کتاب داده نشده است."
    : "هنوز کتابی در فهرست نیست.";

  const frag = document.createDocumentFragment();
  for (const b of rows) {
    const tr = el("tr");
    const num = el("td", { class: "num", "data-label": LABELS.number }, fa(b.number));
    if (counts.get(b.number) > 1) num.append(el("span", { class: "shared", title: "این شماره به بیش از یک کتاب داده شده است" }, "مشترک"));
    tr.append(num, el("td", { class: "title", "data-label": LABELS.title }, b.title));
    for (const f of ["author", "translator", "publisher"]) {
      if (b[f]) tr.append(el("td", { "data-label": LABELS[f] }, b[f]));
      else if (state.filter === "incomplete" && REQUIRED.includes(f)) tr.append(el("td", { class: "empty-cell missing", "data-label": LABELS[f] }, "ثبت نشده"));
      else {
        // blank on screen, named for screen readers
        const td = el("td", { class: "empty-cell", "data-label": LABELS[f] });
        td.append(el("span", { class: "visually-hidden" }, "ثبت نشده"));
        tr.append(td);
      }
    }
    const actions = el("td");
    const box = el("div", { class: "row-actions" });
    const edit = el("button", { type: "button", "aria-label": `ویرایش «${b.title}»` }, "ویرایش");
    edit.addEventListener("click", () => openEditor(b));
    const del = el("button", { type: "button", class: "del", "aria-label": `حذف «${b.title}»` }, "حذف");
    del.addEventListener("click", () => openDelete(b));
    box.append(edit, del);
    actions.append(box);
    tr.append(actions);
    frag.append(tr);
  }
  $("admin-rows").replaceChildren(frag);
  $("admin-count").textContent = rows.length !== state.books.length ? `${fa(rows.length)} از ${fa(state.books.length)} کتاب` : `${fa(state.books.length)} کتاب`;
}

$("admin-search").addEventListener("input", renderRows);

/* ---------- add / edit ---------- */

const form = $("edit-form");
const dialog = $("edit-dialog");

function openEditor(book, number) {
  state.editing = book ?? null;
  $("edit-title").textContent = book ? "ویرایش کتاب" : number ? `افزودن کتاب با شماره ${fa(number)}` : "افزودن کتاب";
  for (const f of FIELDS) form.elements[f].value = book?.[f] ?? "";
  if (number) form.elements.number.value = fa(number);
  state.pristine = formValues();
  $("edit-error").hidden = true;
  checkNumber();
  dialog.showModal();
  (book || number ? form.elements.title : form.elements.number).focus();
}

const formValues = () => JSON.stringify(FIELDS.map((f) => form.elements[f].value.trim()));
const isDirty = () => dialog.open && formValues() !== state.pristine;

// closing the form with unsaved typing asks first; saving closes it without asking
function closeEditor() {
  if (isDirty() && !confirm("تغییرهای این فرم ذخیره نشده‌اند. فرم بسته شود؟")) return;
  dialog.close();
}
dialog.addEventListener("cancel", (e) => { e.preventDefault(); closeEditor(); });
window.addEventListener("beforeunload", (e) => { if (isDirty()) e.preventDefault(); });

function busy(button, busyLabel) {
  const label = button.textContent;
  button.disabled = true;
  button.textContent = busyLabel;
  return () => { button.disabled = false; button.textContent = label; };
}

function toDigits(s) {
  return String(s).trim().replace(/[۰-۹]/g, (d) => d.charCodeAt(0) - 0x06f0).replace(/[٠-٩]/g, (d) => d.charCodeAt(0) - 0x0660);
}

// Shared numbers are allowed (some books really share one), so this only warns.
function checkNumber() {
  const warn = $("number-warn");
  const n = Number(toDigits(form.elements.number.value));
  const others = Number.isInteger(n) && n > 0 ? state.books.filter((b) => b.number === n && b.id !== state.editing?.id) : [];
  warn.hidden = others.length === 0;
  if (others.length) {
    warn.textContent = `شماره ${fa(n)} پیش از این به «${others.map((b) => b.title).join("» و «")}» داده شده است. اگر هر دو کتاب واقعاً همین شماره را دارند، ذخیره کنید.`;
  }
}
form.elements.number.addEventListener("input", checkNumber);

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const err = $("edit-error");
  err.hidden = true;
  const book = Object.fromEntries(FIELDS.map((f) => [f, form.elements[f].value.trim()]));
  if (!/^\d{1,6}$/.test(toDigits(book.number)) || Number(toDigits(book.number)) < 1) {
    err.textContent = "شماره کتاب باید یک عدد مثبت باشد.";
    err.hidden = false;
    form.elements.number.focus();
    return;
  }
  if (!book.title) {
    err.textContent = "عنوان کتاب لازم است.";
    err.hidden = false;
    form.elements.title.focus();
    return;
  }
  if (state.editing) book.id = state.editing.id;
  const done = busy($("edit-submit"), "در حال ذخیره…");
  const res = await save({ action: state.editing ? "update" : "add", book });
  done();
  if (res.ok) {
    state.pristine = formValues();
    dialog.close();
    toast(state.editing ? "تغییرات ذخیره شد." : `کتاب «${res.data.changed.title}» با شماره ${fa(res.data.changed.number)} افزوده شد.`);
  } else {
    err.textContent = res.message;
    err.hidden = false;
  }
});

/* ---------- delete ---------- */

const delDialog = $("delete-dialog");

function openDelete(book) {
  state.deleting = book;
  $("delete-text").textContent = `«${book.title}» (شماره ${fa(book.number)}) از فهرست حذف شود؟ نسخه قبلی فهرست در تاریخچه ذخیره می‌ماند.`;
  $("delete-error").hidden = true;
  delDialog.showModal();
  delDialog.querySelector("[data-close]").focus();
}

$("delete-confirm").addEventListener("click", async () => {
  const done = busy($("delete-confirm"), "در حال حذف…");
  const res = await save({ action: "delete", id: state.deleting.id });
  done();
  if (res.ok) {
    delDialog.close();
    toast(`«${res.data.changed.title}» حذف شد.`);
  } else {
    $("delete-error").textContent = res.message;
    $("delete-error").hidden = false;
  }
});

dialog.addEventListener("click", (e) => { if (e.target === dialog || e.target.closest("[data-close]")) closeEditor(); });
delDialog.addEventListener("click", (e) => { if (e.target === delDialog || e.target.closest("[data-close]")) delDialog.close(); });

/* ---------- saving ---------- */

async function save(change) {
  const res = await api("/api/admin/catalog", { method: "POST", body: { ...change, version: state.version } });
  if (res.ok) {
    apply(res.data);
    return { ok: true, data: res.data };
  }
  if (res.status === 401) {
    start();
    return { ok: false, message: "نشست شما تمام شده است؛ دوباره وارد شوید." };
  }
  if (res.status === 409) {
    await load();
    return { ok: false, message: "فهرست در این فاصله تغییر کرده بود (شاید کس دیگری ذخیره کرده). فهرست تازه بارگذاری شد؛ لطفاً دوباره بررسی و ذخیره کنید." };
  }
  if (res.status === 503) {
    $("storage-notice").hidden = false;
    return { ok: false, message: "فضای ذخیره‌سازی هنوز به سایت وصل نشده است." };
  }
  return { ok: false, message: res.data.error && res.status === 422 ? res.data.error : "ذخیره ممکن نشد. دوباره تلاش کنید." };
}

/* ---------- downloads ---------- */

function download(name, type, text) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = el("a", { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const today = () => new Date().toISOString().slice(0, 10);
const clean = (b) => ({ id: b.id, number: b.number, title: b.title, author: b.author ?? null, translator: b.translator ?? null, publisher: b.publisher ?? null });

$("download-json").addEventListener("click", () => {
  const books = state.books.map(clean);
  download(`afarinash-books-${today()}.json`, "application/json",
    JSON.stringify({ ...state.meta, count: books.length, books }, null, 1));
  toast(`نسخه پشتیبان ${fa(books.length)} کتاب دریافت شد.`);
});

// Same column headers as the workbook's «فهرست کتاب‌ها» sheet; the BOM makes Excel read it as UTF-8.
$("download-csv").addEventListener("click", () => {
  const head = ["شناسه رکورد", "شماره کتاب", "عنوان کتاب", "نویسنده", "مترجم", "ناشر"];
  const cell = (v) => (v == null ? "" : /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
  const lines = [head, ...state.books.map((b) => [b.id, b.number, b.title, b.author, b.translator, b.publisher])].map((r) => r.map(cell).join(","));
  download(`afarinash-books-${today()}.csv`, "text/csv;charset=utf-8", "﻿" + lines.join("\r\n"));
  toast(`فایل اکسل (CSV) با ${fa(state.books.length)} کتاب دریافت شد.`);
});

$("add-book").addEventListener("click", () => openEditor());

/* ---------- Telegram bot ---------- */

function renderTelegram(s) {
  const rows = [
    ["توکن ربات", s.tokenSet ? "ثبت شده است" : "هنوز ثبت نشده"],
    ["ربات", s.bot ? `@${s.bot}` : "هنوز ثبت نشده"],
    ["کانال مقصد", s.chatTitle || (s.chatSet ? "ثبت شده است" : "هنوز ثبت نشده")],
    ["اتصال به سایت", s.connected ? "وصل است" : "وصل نیست"],
  ];
  $("tg-status").replaceChildren(...rows.flatMap(([k, v]) => [el("dt", {}, k), el("dd", {}, v)]));
  const ready = s.tokenSet && s.chatSet && s.connected;
  const badge = $("tg-badge");
  badge.textContent = ready ? "فعال" : "نیاز به تنظیم";
  badge.className = `tg-badge ${ready ? "ok" : "warn"}`;
  const help = !s.tokenSet ? "مدیر سایت باید توکنی را که BotFather داده در تنظیمات Vercel با نام TELEGRAM_BOT_TOKEN ثبت کند."
    : !s.chatSet ? "شناسه کانال مدرسه (TELEGRAM_CHAT_ID) در تنظیمات Vercel ثبت نشده است."
    : !s.connected ? "ربات آماده است؛ «اتصال ربات به سایت» را بزنید تا پیام‌هایش به سایت برسد. ربات باید در کانال مدیر (Admin) باشد."
    : s.lastError ? `آخرین خطای تلگرام: ${s.lastError}` : "";
  $("tg-help").textContent = help;
  $("tg-help").hidden = !help;
  $("tg-connect").disabled = !s.tokenSet;
  $("tg-test").disabled = !(s.tokenSet && s.chatSet);
}

async function loadTelegram() {
  const res = await api("/api/admin/telegram");
  if (res.ok) renderTelegram(res.data);
  else $("tg-badge").textContent = "بررسی نشد";
}

async function telegramAction(action, button, busyLabel, okMessage) {
  $("tg-error").hidden = true;
  const done = busy(button, busyLabel);
  const res = await api("/api/admin/telegram", { method: "POST", body: { action } });
  done();
  if (res.ok) {
    renderTelegram(res.data);
    toast(okMessage);
  } else {
    if (res.status === 401) return start();
    $("tg-error").textContent = `انجام نشد: ${res.data.error || "خطای ناشناخته"}`;
    $("tg-error").hidden = false;
  }
}

$("tg-connect").addEventListener("click", (e) => telegramAction("connect", e.currentTarget, "در حال اتصال…", "ربات به سایت وصل شد."));
$("tg-test").addEventListener("click", (e) => telegramAction("test", e.currentTarget, "در حال فرستادن…", "پیام آزمایشی به کانال فرستاده شد."));

start();
