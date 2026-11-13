// Shared by every page: header, theme, menu, Instagram button, image protection, toasts and forms.
import { toPersianDigits } from "./validate.js";

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
export const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)");
// isolated left-to-right, so the area code stays first inside right-to-left sentences
const SCHOOL_PHONE = "⁦۰۷۱-۳۲۲۹۳۱۹۴⁩";
const PAPER = { light: "#e8edf2", dark: "#0d2131" };

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
    if (themeMeta) themeMeta.content = isDark() ? PAPER.dark : PAPER.light;
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
  const goTop = () => scrollTo({ top: 0, behavior: reduceMotion.matches ? "auto" : "smooth" });
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
    goTop();
    $("#main").focus({ preventScroll: true });
  });
  // on the home page the school name scrolls back to the top instead of reloading
  $("[data-home]")?.addEventListener("click", (e) => {
    if (location.pathname !== "/") return;
    e.preventDefault();
    setMenu(false);
    history.replaceState(null, "", "/");
    goTop();
  });

  // the share links carry the address this page is served from
  const shareText = $("[data-share-text]")?.textContent.trim() ?? "";
  const site = `${location.origin}/`;
  const tg = $('[data-share="tg"]'), wa = $('[data-share="wa"]');
  if (tg) tg.href = `https://t.me/share/url?url=${encodeURIComponent(site)}&text=${encodeURIComponent(shareText)}`;
  if (wa) wa.href = `https://wa.me/?text=${encodeURIComponent(`${shareText} ${site}`)}`;
  $("[data-copy-link]")?.addEventListener("click", async () => {
    try { await navigator.clipboard.writeText(`${shareText}\n${site}`); toast("متن معرفی و نشانی سایت رونوشت شد."); }
    catch { toast(`نشانی سایت: ${site}`); }
  });

  // links to the school's numbers land on the contact card and highlight it briefly
  const contacts = $("#school-contacts");
  if (contacts) {
    const flash = () => {
      if (location.hash !== "#school-contacts") return;
      // scrolled here rather than left to the browser: sections above change height once the page script runs
      contacts.scrollIntoView({ block: "start", behavior: "instant" });
      contacts.focus({ preventScroll: true });
      contacts.classList.add("is-flash");
      setTimeout(() => contacts.classList.remove("is-flash"), 1600);
    };
    addEventListener("hashchange", flash);
    setTimeout(flash, 0);
  }

  /* Instagram button fades and drops behind the content while it covers text */
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
  document.addEventListener("contextmenu", (e) => { if (e.target.closest("img, picture") && !e.target.closest(".map-card")) e.preventDefault(); });
  document.addEventListener("dragstart", (e) => { if (e.target.closest("img")) e.preventDefault(); });
}

/**
 * One controller for every form: one step at a time, errors only after a step is finished, a review
 * dialog, sending, and clear outcomes.
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
  // what the visitor actually touches for a field: a date keeps its value in a hidden input beside three selects
  const controls = (name) => fieldEls(name).flatMap((el) => (el.type === "hidden" ? $$("select", el.closest(".field")) : [el]));
  const showErrors = (errors, only = names) => {
    for (const name of only) {
      const els = controls(name);
      if (!els.length) continue;
      const msg = errors[name] || "";
      const slot = $("[data-error]", els[0].closest(".field"));
      if (slot) { slot.textContent = msg; if (!slot.id) slot.id = `${form.id || "f"}-${name}-err`; }
      els.forEach((el) => { el.setAttribute("aria-invalid", String(!!msg)); if (slot) el.setAttribute("aria-describedby", slot.id); });
    }
  };
  const errorsNow = () => { const r = validate(read()); return r.ok ? {} : r.errors; };

  /* a date picked from three lists (day, month, year) */
  for (const box of $$("[data-date]", form)) {
    const target = $('input[type="hidden"]', box.closest(".field"));
    box.addEventListener("change", () => {
      const [d, m, y] = ["day", "month", "year"].map((k) => $(`[data-date-part="${k}"]`, box).value);
      target.value = d && m && y ? `${y}/${m}/${d}` : "";
    });
  }

  form.addEventListener("input", (e) => {
    const counter = $(`[data-count-for="${e.target.name}"]`, form);
    if (counter) counter.textContent = toPersianDigits(e.target.value.length);
    if (draftKey) try { const { website, startedAt, ...draft } = read(); sessionStorage.setItem(draftKey, JSON.stringify(draft)); } catch {}
  });
  // a message already on screen clears as soon as the field is right; nothing new appears while typing
  const clearFixed = (e) => {
    const name = e.target.name || $('input[type="hidden"]', e.target.closest(".field") ?? form)?.name;
    if (!name || e.target.getAttribute("aria-invalid") !== "true") return;
    if (!errorsNow()[name]) showErrors({}, [name]);
  };
  form.addEventListener("input", clearFixed);
  form.addEventListener("change", clearFixed);

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

  /* steps */
  const steps = $$("[data-step]", form);
  const stepper = $("[data-stepper]", form);
  const backBtn = $("[data-step-back]", form);
  const nextBtn = $("[data-step-next]", form);
  const stepNames = steps.map((s) => [...new Set($$("[name]", s).map((el) => el.name))]);
  let current = 0;
  const showStep = (i, focus = true) => {
    current = Math.max(0, Math.min(steps.length - 1, i));
    steps.forEach((s, n) => s.classList.toggle("is-active", n === current));
    const last = current === steps.length - 1;
    backBtn.hidden = current === 0;
    nextBtn.hidden = last;
    submitBtn.hidden = !last;
    $("[data-step-label]", stepper).textContent = `مرحله‌ی ${toPersianDigits(current + 1)} از ${toPersianDigits(steps.length)}`;
    $("[data-step-progress]", stepper).style.setProperty("--p", String((current + 1) / steps.length));
    if (focus) $("input:not([type=hidden]), select, textarea", steps[current])?.focus({ preventScroll: true });
    if (focus) form.scrollIntoView({ block: "nearest", behavior: reduceMotion.matches ? "auto" : "smooth" });
  };
  const stepOf = (name) => stepNames.findIndex((list) => list.includes(name));
  const checkStep = () => {
    const errors = errorsNow();
    const mine = stepNames[current].filter((n) => errors[n]);
    showErrors(errors, stepNames[current]);
    if (mine.length) controls(mine[0])[0]?.focus();
    return !mine.length;
  };
  if (steps.length > 1) {
    stepper.hidden = false;
    nextBtn.addEventListener("click", () => { if (checkStep()) showStep(current + 1); });
    backBtn.addEventListener("click", () => showStep(current - 1));
    form.addEventListener("keydown", (e) => {
      if (e.key !== "Enter" || e.target.tagName === "TEXTAREA" || e.target.tagName === "BUTTON" || current === steps.length - 1) return;
      e.preventDefault();
      nextBtn.click();
    });
    showStep(0, false);
  }
  const showAllErrors = (errors) => {
    showErrors(errors);
    const first = Object.keys(errors)[0];
    if (steps.length > 1 && stepOf(first) >= 0) showStep(stepOf(first), false);
    controls(first)[0]?.focus();
  };

  let pending = null;
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const data = read();
    const r = validate(data);
    if (!r.ok) {
      showAllErrors(r.errors);
      toast("چند مورد نیاز به اصلاح دارد. پیام زیر هر مورد را ببینید.", "err");
      return;
    }
    showErrors({});
    pending = { ...r.value, website: data.website, startedAt: Number(data.startedAt) || 0 };
    $("[data-review]", dialog).replaceChildren(...review(r.value).filter(([, v]) => v).flatMap(([k, v]) => [
      Object.assign(document.createElement("dt"), { textContent: k }),
      Object.assign(document.createElement("dd"), { textContent: v }),
    ]));
    dialog.showModal();
  });

  $("[data-confirm-no]", dialog).addEventListener("click", () => { dialog.close(); if (steps.length > 1) showStep(0); else fieldEls(names[0])[0]?.focus(); });
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
      if (res.status === 422 && body.errors) { showAllErrors(body.errors); throw new Error("چند مورد نیاز به اصلاح دارد."); }
      if (res.status === 429 && body.error === "duplicate") throw new Error("این اطلاعات به‌تازگی ثبت شده است؛ نیازی به ارسال دوباره نیست.");
      if (res.status === 429) throw new Error("چند درخواست پشت سر هم ثبت شد. کمی بعد دوباره ارسال کنید.");
      if (res.status === 503) throw new Error(`ارسال آنلاین فعلاً در دسترس نیست. لطفاً با ${SCHOOL_PHONE} تماس بگیرید.`);
      if (!res.ok) throw new Error();
      form.reset();
      $$("[data-count-for]", form).forEach((c) => (c.textContent = "۰"));
      $("[data-started]", form).value = String(Date.now());
      if (steps.length > 1) showStep(0, false);
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
