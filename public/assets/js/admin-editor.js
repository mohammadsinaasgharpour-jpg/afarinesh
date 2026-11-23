// Admin panel, page editor: the chosen page is shown in a frame without its scripts; text is edited in place, photos
// and sections through the toolbar. Publishing puts the page's own scripts back exactly as they were (their CSP hashes
// must not change). Also the Telegram test button in the settings.
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const api = async (url, options = {}) => {
  const res = await fetch(url, { credentials: "same-origin", ...options });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(body.error || "error"), { status: res.status });
  return body;
};
const post = (url, body) => api(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

const ED = { name: "", scripts: [], sel: null, dirty: false };
const frame = $("#ed-frame");
const edStatus = (t) => { $("#ed-status").textContent = t; };
const TEXT_TAGS = new Set(["H1", "H2", "H3", "H4", "H5", "H6", "P", "LI", "A", "SPAN", "B", "STRONG", "EM", "SMALL", "FIGCAPTION", "SUMMARY", "DT", "DD", "TD", "TH", "LABEL", "BLOCKQUOTE"]);
const BLOCKS = "div, ul, ol, section, article, figure, p, img, table, form, details, header, footer, nav";
const hasOwnText = (el) => [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
const editableText = (el) => TEXT_TAGS.has(el.tagName) && hasOwnText(el) && !el.querySelector(BLOCKS);
const imageOf = (el) => (el?.tagName === "IMG" ? el : el?.matches?.("figure, li, a, picture") ? el.querySelector("img") : null);
const describe = (el) => (el.tagName === "IMG" ? "عکس" : imageOf(el) ? "عکس و توضیحش" : editableText(el) ? "متن" : "بخش");
const changed = () => { ED.dirty = true; $("#ed-save").disabled = false; };

async function loadPages(keep) {
  try {
    const { pages } = await api("/api/site-edit?action=pages");
    $("#ed-page").replaceChildren(...pages.map((p) => {
      const o = document.createElement("option");
      o.value = p.name;
      o.textContent = p.title + (p.edited ? " (ویرایش‌شده)" : "");
      o.dataset.edited = p.edited ? "1" : "";
      return o;
    }));
    if (keep) $("#ed-page").value = keep;
  } catch { edStatus("فهرست صفحه‌ها نیامد؛ صفحه را تازه کنید."); }
}

function select(el) {
  const doc = frame.contentDocument;
  $$(".ed-sel", doc).forEach((n) => n.classList.remove("ed-sel"));
  $$("[contenteditable]", doc).forEach((n) => { if (n !== el) n.removeAttribute("contenteditable"); });
  if (!el || el === doc.body || el === doc.documentElement) { ED.sel = null; $("#ed-tools").hidden = true; return; }
  ED.sel = el;
  el.classList.add("ed-sel");
  const img = imageOf(el);
  $("#ed-what").textContent = `انتخاب شده: ${describe(el)}`;
  $('[data-ed="image"]').hidden = !img;
  $('[data-ed="alt"]').hidden = !img;
  $('[data-ed="link"]').hidden = !el.closest("a");
  $("#ed-tools").hidden = false;
  if (editableText(el)) { el.contentEditable = "true"; el.focus(); }
}

function wire() {
  const doc = frame.contentDocument;
  doc.addEventListener("click", (e) => {
    e.preventDefault();
    if (e.target === ED.sel && e.target.isContentEditable) return;
    const svg = e.target.closest("svg");
    select(svg ? svg.parentElement : e.target);
  }, true);
  doc.addEventListener("submit", (e) => e.preventDefault(), true);
  doc.addEventListener("input", changed);
}

$("#ed-open").addEventListener("click", async () => {
  if (ED.dirty && !confirm("تغییرهای منتشرنشده‌ی این صفحه از بین می‌رود. ادامه می‌دهید؟")) return;
  const name = $("#ed-page").value;
  if (!name) return;
  edStatus("در حال باز کردن…");
  try {
    const { html } = await api(`/api/site-edit?action=page&name=${encodeURIComponent(name)}`);
    const doc = new DOMParser().parseFromString(html, "text/html");
    ED.scripts = [...doc.scripts].map((s) => s.outerHTML);
    [...doc.scripts].forEach((s, i) => { const t = doc.createElement("template"); t.dataset.edScript = String(i); s.replaceWith(t); });
    const css = doc.createElement("link");
    css.rel = "stylesheet";
    css.href = "/assets/css/editor.css";
    css.dataset.edEditor = "";
    doc.head.append(css);
    Object.assign(ED, { name, dirty: false, sel: null });
    frame.hidden = false;
    frame.onload = () => { wire(); edStatus("آماده‌ی ویرایش: روی هر متن، عکس یا بخش بزنید."); };
    frame.srcdoc = "<!doctype html>\n" + doc.documentElement.outerHTML;
    $("#ed-save").disabled = true;
    $("#ed-revert").disabled = !$("#ed-page").selectedOptions[0]?.dataset.edited;
    $("#ed-tools").hidden = true;
  } catch { edStatus("صفحه باز نشد؛ دوباره امتحان کنید."); }
});

$("#ed-file").addEventListener("change", async () => {
  const file = $("#ed-file").files[0];
  $("#ed-file").value = "";
  const img = imageOf(ED.sel);
  if (!file || !img) return;
  if (file.size > 10e6) { edStatus("عکس بزرگ‌تر از ۱۰ مگابایت است."); return; }
  edStatus("در حال بارگذاری عکس…");
  try {
    const data = await new Promise((ok, fail) => { const r = new FileReader(); r.onload = () => ok(String(r.result).split(",")[1]); r.onerror = fail; r.readAsDataURL(file); });
    const up = await post("/api/site-edit?action=upload", { data });
    $$("source", img.closest("picture") ?? document.createElement("i")).forEach((s) => s.replaceWith());
    img.removeAttribute("srcset");
    img.removeAttribute("sizes");
    img.src = up.url;
    img.width = up.width;
    img.height = up.height;
    changed();
    edStatus("عکس عوض شد؛ برای دیده شدن روی سایت «انتشار روی سایت» را بزنید.");
  } catch (err) { edStatus(err.status === 415 ? "فقط عکس JPG، PNG یا WebP." : "عکس بارگذاری نشد."); }
});

for (const b of $$("[data-ed]")) b.addEventListener("click", () => {
  const el = ED.sel;
  if (!el) return;
  const img = imageOf(el);
  switch (b.dataset.ed) {
    case "parent": select(el.parentElement); break;
    case "image": $("#ed-file").click(); break;
    case "alt": {
      const v = prompt("توضیح کوتاه عکس (برای گوگل و کسانی که عکس را نمی‌بینند):", img?.alt || "");
      if (v !== null && img) { img.alt = v.trim(); changed(); }
      break;
    }
    case "link": {
      const a = el.closest("a");
      const v = prompt("نشانی پیوند:", a.getAttribute("href") || "");
      if (v !== null && /^(https?:\/\/|\/|#|tel:|mailto:)/.test(v.trim())) { a.setAttribute("href", v.trim()); changed(); }
      break;
    }
    case "up": if (el.previousElementSibling) { el.previousElementSibling.before(el); changed(); } break;
    case "down": if (el.nextElementSibling) { el.nextElementSibling.after(el); changed(); } break;
    case "copy": {
      const c = el.cloneNode(true);
      c.classList.remove("ed-sel");
      c.removeAttribute("contenteditable");
      c.removeAttribute("id");
      $$("[id]", c).forEach((n) => n.removeAttribute("id"));
      el.after(c);
      select(c);
      changed();
      break;
    }
    case "delete":
      if (confirm(`این ${describe(el)} از صفحه برداشته شود؟`)) { el.replaceWith(); select(null); changed(); }
      break;
  }
});

$("#ed-save").addEventListener("click", async () => {
  if (!ED.name) return;
  const doc = frame.contentDocument.cloneNode(true);
  $$("[data-ed-editor]", doc).forEach((n) => n.replaceWith());
  $$("[contenteditable]", doc).forEach((n) => n.removeAttribute("contenteditable"));
  $$(".ed-sel", doc).forEach((n) => { n.classList.remove("ed-sel"); if (!n.classList.length) n.removeAttribute("class"); });
  const html = ("<!doctype html>\n" + doc.documentElement.outerHTML)
    .replace(/<template data-ed-script="(\d+)"><\/template>/g, (_, i) => ED.scripts[Number(i)] ?? "");
  $("#ed-save").disabled = true;
  edStatus("در حال انتشار…");
  try {
    await post("/api/site-edit?action=save", { name: ED.name, html });
    ED.dirty = false;
    edStatus("منتشر شد ✓ صفحه‌ی سایت همین حالا عوض شد.");
    await loadPages(ED.name);
    $("#ed-revert").disabled = false;
  } catch { $("#ed-save").disabled = false; edStatus("منتشر نشد؛ دوباره امتحان کنید."); }
});

$("#ed-revert").addEventListener("click", async () => {
  if (!ED.name || !confirm("همه‌ی ویرایش‌های این صفحه کنار گذاشته شود و صفحه به نسخه‌ی اصلی برگردد؟")) return;
  try {
    await post("/api/site-edit?action=revert", { name: ED.name });
    ED.dirty = false;
    edStatus("به نسخه‌ی اصلی برگشت.");
    await loadPages(ED.name);
    $("#ed-open").click();
  } catch { edStatus("برگشت انجام نشد."); }
});

$("#site-editor").addEventListener("toggle", () => { if ($("#site-editor").open && !$("#ed-page").options.length) loadPages(); });
addEventListener("beforeunload", (e) => { if (ED.dirty) { e.preventDefault(); e.returnValue = ""; } });

$("#test-telegram").addEventListener("click", async () => {
  $("#telegram-state").textContent = "در حال فرستادن…";
  try { await post("/api/admin?action=test-telegram", {}); $("#telegram-state").textContent = "فرستاده شد ✓ در کانال تلگرام نگاه کنید."; }
  catch { $("#telegram-state").textContent = "فرستاده نشد؛ بعداً دوباره امتحان کنید."; }
});
