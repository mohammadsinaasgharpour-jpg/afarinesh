// Shared by every page: header, theme, menu, Instagram button, image protection, toasts and forms.
import { toPersianDigits } from "./validate.js";

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
export const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)");
const SCHOOL_PHONE = "۰۷۱-۳۲۲۹۳۱۹۴";

/* toasts */
export function toast(text, kind = "ok", ms = 5200) {
  const box = $("[data-toasts]");
  const el = document.createElement("div");
  el.className = `toast ${kind}`;
  el.setAttribute("role", kind === "err" ? "alert" : "status");
  el.innerHTML = `<svg class="ic" aria-hidden="true"><use href="#i-${kind === "err" ? "alert" : "check"}"/></svg><span></span>`;
  el.lastChild.textContent = text;
  box.append(el);
  setTimeout(() => {
    el.classList.add("out");
    setTimeout(() => el.remove(), reduceMotion.matches ? 0 : 260);
  }, ms);
}

export function initChrome() {
  document.documentElement.classList.add("js");

  /* theme: the inline script in <head> picks light before 18:00 and dark after; the button overrides it for this visit */
  const themeBtn = $("[data-theme-toggle]");
  const themeMeta = $('meta[name="theme-color"]');
  const isDark = () => document.documentElement.dataset.theme === "dark";
  const syncTheme = () => {
    themeBtn.setAttribute("aria-label", isDark() ? "تغییر به حالت روشن" : "تغییر به حالت تاریک");
    if (themeMeta) themeMeta.content = isDark() ? "#0d2131" : "#f6f8fa";
  };
  // Every colour flips in the same frame: transitions are paused while the theme changes, the page is
  // forced to restyle, and where supported the switch is a single crossfade of the whole page.
  const setTheme = (next) => {
    const root = document.documentElement;
    root.classList.add("theme-switching");
    root.dataset.theme = next;
    void root.offsetHeight;
    syncTheme();
    requestAnimationFrame(() => requestAnimationFrame(() => root.classList.remove("theme-switching")));
  };
  themeBtn.addEventListener("click", () => {
    const next = isDark() ? "light" : "dark";
    try { sessionStorage.setItem("theme", next); } catch {}
    if (document.startViewTransition && !reduceMotion.matches) document.startViewTransition(() => setTheme(next));
    else setTheme(next);
  });
  syncTheme();

  /* header: menu and scrolled state */
  const header = $("[data-header]");
  const nav = $("#nav");
  const menuBtn = $("[data-menu]");
  const setMenu = (open) => {
    nav.classList.toggle("is-open", open);
    menuBtn.setAttribute("aria-expanded", String(open));
    menuBtn.setAttribute("aria-label", open ? "بستن منو" : "باز کردن منو");
  };
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

  /* Instagram button fades while it covers text */
  const fab = $(".insta-fab");
  const TEXTY = "p, h1, h2, h3, li, a, dt, dd, label, summary, figcaption, img, input, textarea, select, button, .btn";
  const fabOverText = () => {
    const r = fab.getBoundingClientRect();
    const points = [[r.left + r.width / 2, r.top + r.height / 2], [r.left + 4, r.top + 4], [r.right - 4, r.bottom - 4]];
    return points.some(([x, y]) => document.elementsFromPoint(x, y).some((el) => el !== fab && !fab.contains(el) && el.closest(TEXTY) && el.closest(TEXTY) !== fab));
  };
  let fabTick = false;
  const updateFab = () => {
    if (fabTick) return;
    fabTick = true;
    requestAnimationFrame(() => { fab.classList.toggle("is-over-text", fabOverText()); fabTick = false; });
  };
  addEventListener("scroll", updateFab, { passive: true });
  addEventListener("resize", updateFab);
  updateFab();

  /* images: no long-press save menu or drag-out */
  document.addEventListener("contextmenu", (e) => { if (e.target.closest("img, picture, .brand")) e.preventDefault(); });
  document.addEventListener("dragstart", (e) => { if (e.target.closest("img")) e.preventDefault(); });
}

/**
 * One controller for every form: inline validation, a review dialog, sending, and clear outcomes.
 * @param {{ form: HTMLFormElement, validate: (input: object) => {ok: boolean, value?: object, errors?: object},
 *   review: (value: object) => [string, string][], success: string, draftKey?: string }} opts
 */
export function createFormController({ form, validate, review, success, draftKey }) {
  const dialog = $("[data-confirm-dialog]");
  const submitBtn = $("[data-submit]", form);
  const submitLabel = $("[data-submit-label]", form);
  const idleLabel = submitLabel.textContent;
  const names = [...new Set($$("[name]", form).map((el) => el.name))].filter((n) => !["website", "startedAt"].includes(n));
  $("[data-started]", form).value = String(Date.now()); // the server ignores forms sent within seconds of page load (bots)

  const read = () => {
    const fd = new FormData(form);
    const out = Object.fromEntries([...names, "website", "startedAt"].map((k) => [k, fd.get(k) ?? ""]));
    for (const el of $$('input[type="checkbox"]', form)) out[el.name] = el.checked;
    return out;
  };
  const fieldEls = (name) => {
    const f = form.elements[name];
    return f instanceof RadioNodeList ? [...f] : f ? [f] : [];
  };
  const showErrors = (errors, touchedOnly) => {
    for (const name of names) {
      const els = fieldEls(name);
      if (!els.length || (touchedOnly && !els.some((el) => el.dataset.touched))) continue;
      const msg = errors[name] || "";
      const slot = $("[data-error]", els[0].closest(".field"));
      if (slot) { slot.textContent = msg; if (!slot.id) slot.id = `${form.id || "f"}-${name}-err`; }
      els.forEach((el) => { el.setAttribute("aria-invalid", String(!!msg)); if (slot) el.setAttribute("aria-describedby", slot.id); });
    }
  };
  const recheck = () => { const r = validate(read()); showErrors(r.ok ? {} : r.errors, true); };
  form.addEventListener("focusout", (e) => { if (e.target.name) { e.target.dataset.touched = "1"; recheck(); } });
  form.addEventListener("change", (e) => { if (e.target.name) { e.target.dataset.touched = "1"; recheck(); } });
  form.addEventListener("input", (e) => {
    const counter = $(`[data-count-for="${e.target.name}"]`, form);
    if (counter) counter.textContent = toPersianDigits(e.target.value.length);
    if (e.target.getAttribute("aria-invalid") === "true") recheck();
    if (draftKey) try { const { website, startedAt, ...draft } = read(); sessionStorage.setItem(draftKey, JSON.stringify(draft)); } catch {}
  });

  // forms with personal identifiers keep no draft; the short callback form restores an unsent draft (per tab)
  if (draftKey) try {
    const draft = JSON.parse(sessionStorage.getItem(draftKey) || "null");
    for (const [k, v] of Object.entries(draft || {})) {
      const f = form.elements[k];
      if (!f || !v || f.type === "checkbox") continue;
      f.value = v;
      $(`[data-count-for="${k}"]`, form)?.replaceChildren(toPersianDigits(String(v).length));
    }
  } catch {}

  let pending = null;
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const data = read();
    const r = validate(data);
    if (!r.ok) {
      $$("input, textarea, select", form).forEach((el) => (el.dataset.touched = "1"));
      showErrors(r.errors, false);
      fieldEls(Object.keys(r.errors)[0])[0]?.focus();
      toast("چند مورد نیاز به اصلاح دارد. پیام زیر هر فیلد را ببینید.", "err");
      return;
    }
    showErrors({}, false);
    pending = { ...r.value, website: data.website, startedAt: Number(data.startedAt) || 0 };
    $("[data-review]", dialog).replaceChildren(...review(r.value).filter(([, v]) => v).flatMap(([k, v]) => [
      Object.assign(document.createElement("dt"), { textContent: k }),
      Object.assign(document.createElement("dd"), { textContent: v }),
    ]));
    dialog.showModal();
  });

  $("[data-confirm-no]", dialog).addEventListener("click", () => { dialog.close(); fieldEls(names[0])[0]?.focus(); });
  $("[data-confirm-yes]", dialog).addEventListener("click", async () => {
    dialog.close();
    submitBtn.disabled = true;
    submitBtn.classList.add("is-busy");
    submitLabel.textContent = "در حال ارسال…";
    try {
      const res = await fetch(form.action, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(pending),
        signal: AbortSignal.timeout(15000),
      });
      const body = await res.json().catch(() => ({}));
      if (res.status === 422 && body.errors) { showErrors(body.errors, false); throw new Error("چند مورد نیاز به اصلاح دارد."); }
      if (res.status === 429 && body.error === "duplicate") throw new Error("این اطلاعات به‌تازگی ثبت شده است؛ نیازی به ارسال دوباره نیست.");
      if (res.status === 429) throw new Error("چند درخواست پشت سر هم ثبت شد. کمی بعد دوباره ارسال کنید.");
      if (res.status === 503) throw new Error(`ارسال آنلاین فعلاً در دسترس نیست. لطفاً با ${SCHOOL_PHONE} تماس بگیرید.`);
      if (!res.ok) throw new Error();
      form.reset();
      $$("[data-count-for]", form).forEach((c) => (c.textContent = "۰"));
      $$("[data-touched]", form).forEach((el) => delete el.dataset.touched);
      $("[data-started]", form).value = String(Date.now());
      if (draftKey) try { sessionStorage.removeItem(draftKey); } catch {}
      toast(`${success} کد پیگیری: ${String(body.id || "").slice(0, 8)}`, "ok", 9000);
    } catch (err) {
      const msg = err?.message || `ارسال انجام نشد. اتصال اینترنت را بررسی کنید یا با ${SCHOOL_PHONE} تماس بگیرید.`;
      toast(err?.name === "TimeoutError" ? `پاسخی از سرور نرسید. دوباره امتحان کنید یا با ${SCHOOL_PHONE} تماس بگیرید.` : msg, "err", 9000);
    } finally {
      submitBtn.disabled = false;
      submitBtn.classList.remove("is-busy");
      submitLabel.textContent = idleLabel;
    }
  });
}
