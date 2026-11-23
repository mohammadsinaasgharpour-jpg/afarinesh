// Shared by every page: header, theme, menu, Instagram button, image protection, toasts and forms.
import { toPersianDigits, jalaliMonthDays } from "./validate.js";

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
export const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)");
/** Page scrolling by script goes through here, so the smooth-scroll engine (motion.js, desktops only) can
    take it over; without it the browser scrolls. `smooth` is ignored with reduced motion. */
export const scroller = {
  engine: null,
  to(y, smooth = true) {
    if (this.engine) return this.engine.to(y, smooth);
    scrollTo({ top: y, behavior: smooth && !reduceMotion.matches ? "smooth" : "instant" });
  },
  by(dy, smooth = true) {
    if (this.engine) return this.engine.by(dy, smooth);
    scrollBy({ top: dy, behavior: smooth && !reduceMotion.matches ? "smooth" : "instant" });
  },
};
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
  const contextBack = $("[data-context-back]");
  if (contextBack) {
    const from = new URLSearchParams(location.search).get("from");
    const named = {
      "pre-registration": ["/pre-registration", "بازگشت به فرم پیش‌ثبت‌نام"],
      careers: ["/careers", "بازگشت به فرم دعوت به همکاری"],
    }[from];
    let target = named;
    if (!target && document.referrer) {
      try {
        const ref = new URL(document.referrer);
        if (ref.origin === location.origin && ref.pathname !== location.pathname) target = [ref.pathname + ref.hash, "بازگشت به صفحه قبل"];
      } catch {}
    }
    target ??= ["/", "بازگشت به صفحه اصلی"];
    contextBack.href = target[0];
    $("span", contextBack).textContent = target[1];
  }
  // alignment guides for checking the layout; loaded only when the address asks for them (?guides)
  if (new URLSearchParams(location.search).has("guides")) import("./guides.js").then((m) => m.initGuides(), () => {});

  /* theme: the inline script in <head> picks light before 18:00 and dark after; the button overrides it for this visit */
  const themeBtns = $$("[data-theme-toggle]");
  const themeMeta = $('meta[name="theme-color"]');
  const isDark = () => document.documentElement.dataset.theme === "dark";
  const syncTheme = () => {
    themeBtns.forEach((b) => b.setAttribute("aria-label", isDark() ? "تغییر به حالت روشن" : "تغییر به حالت تاریک"));
    if (themeMeta) themeMeta.content = isDark() ? PAPER.dark : PAPER.light;
  };
  // The colours glide to the other theme in place. (A whole-page view transition was used before: on phones its
  // snapshot looked blurred for a moment and the page could jump to the top.) The scroll position is held.
  const setTheme = (next) => {
    const root = document.documentElement;
    const y = scrollY;
    root.classList.add(reduceMotion.matches ? "theme-switching" : "theme-fading");
    root.dataset.theme = next;
    syncTheme();
    if (scrollY !== y) scrollTo({ top: y, behavior: "instant" });
    setTimeout(() => root.classList.remove("theme-switching", "theme-fading"), reduceMotion.matches ? 50 : 450);
  };
  themeBtns.forEach((b) => b.addEventListener("click", () => {
    const next = isDark() ? "light" : "dark";
    try { sessionStorage.setItem("theme", next); } catch {}
    setTheme(next);
  }));
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
  const goTop = () => scroller.to(0);
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
    const flash = (e) => {
      if (location.hash !== "#school-contacts") return;
      e?.preventDefault?.();
      // scrolled here rather than left to the browser: sections above change height once the page script runs
      contacts.scrollIntoView({ block: "center", behavior: "instant" });
      // late layout above it (web fonts, the teachers section starting) can still push it away: for two
      // seconds, if the page grows or shrinks and the card has left the screen, it is brought back
      const keep = new ResizeObserver(() => {
        const r = contacts.getBoundingClientRect();
        if (r.bottom < 0 || r.top > innerHeight) contacts.scrollIntoView({ block: "center", behavior: "instant" });
      });
      keep.observe(document.body);
      setTimeout(() => keep.disconnect(), 2000);
      contacts.focus({ preventScroll: true });
      contacts.classList.add("is-flash");
      setTimeout(() => contacts.classList.remove("is-flash"), 1600);
    };
    addEventListener("hashchange", () => flash());
    setTimeout(flash, 0);
    // the same link pressed again (the address already ends in #school-contacts) still brings the card back
    document.addEventListener("click", (e) => {
      const a = e.target.closest?.('a[href$="#school-contacts"]');
      if (a && a.pathname === location.pathname && location.hash === "#school-contacts") flash(e);
    });
  }

  // phone fields take digits only (Persian or English), at most 11; a pasted +98 / 0098 number becomes 09…
  document.addEventListener("input", (e) => {
    const el = e.target;
    if (!(el instanceof HTMLInputElement) || el.type !== "tel") return;
    let digits = el.value.replace(/[^0-9۰-۹٠-٩]/g, "");
    const latin = digits.replace(/[۰-۹]/g, (d) => "۰۱۲۳۴۵۶۷۸۹".indexOf(d)).replace(/[٠-٩]/g, (d) => "٠١٢٣٤٥٦٧٨٩".indexOf(d));
    const intl = latin.match(/^(?:0098|98)(9\d*)$/);
    if (intl) digits = `0${intl[1]}`;
    digits = digits.slice(0, 11);
    if (digits !== el.value) el.value = digits;
  });

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
  // the first check waits for the first scroll or touch (the hit test lays the page out), or a while after loading
  for (const type of ["touchstart", "pointermove", "keydown"]) addEventListener(type, updateFab, { once: true, passive: true });
  addEventListener("load", () => setTimeout(updateFab, 12000), { once: true });

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
/**
 * An unsent form kept encrypted in this tab only (AES-GCM): the key cannot be read out of the browser (it lives in
 * IndexedDB as a non-extractable key), the text sits in sessionStorage and is gone when the tab closes, after
 * 30 minutes, or once the form is sent. A visitor who opens the rules or goes back comes back to a filled form.
 */
export function secureDraft(name) {
  const slot = `sd:${name}`;
  const keyDb = () => new Promise((ok, fail) => {
    const r = indexedDB.open("afarinesh-drafts", 1);
    r.onupgradeneeded = () => r.result.createObjectStore("keys");
    r.onsuccess = () => ok(r.result);
    r.onerror = () => fail(r.error);
  });
  const tx = async (mode, fn) => { const db = await keyDb(); return new Promise((ok, fail) => { const q = fn(db.transaction("keys", mode).objectStore("keys")); q.onsuccess = () => ok(q.result); q.onerror = () => fail(q.error); }); };
  const key = async () => {
    let k = await tx("readonly", (s) => s.get(name));
    if (!k) { k = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]); await tx("readwrite", (s) => s.put(k, name)); }
    return k;
  };
  const b64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
  const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
  return {
    async save(data) {
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const body = new TextEncoder().encode(JSON.stringify({ at: Date.now(), data }));
      const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await key(), body);
      sessionStorage.setItem(slot, `${b64(iv)}.${b64(ct)}`);
    },
    async load() {
      const raw = sessionStorage.getItem(slot);
      if (!raw) return null;
      const [iv, ct] = raw.split(".");
      const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(iv) }, await key(), unb64(ct));
      const { at, data } = JSON.parse(new TextDecoder().decode(plain));
      if (Date.now() - at > 30 * 60 * 1000) { this.clear(); return null; }
      return data;
    },
    clear() { try { sessionStorage.removeItem(slot); tx("readwrite", (s) => s.delete(name)).catch(() => {}); } catch {} },
  };
}

/** After a form is stored: a receipt that stays until closed, with the tracking code the office can look up. */
function showReceipt(text, id) {
  const box = document.createElement("dialog");
  box.className = "dialog receipt-dialog";
  box.setAttribute("aria-labelledby", "receipt-title");
  box.innerHTML = '<h3 id="receipt-title">ثبت شد ✓</h3><p data-text></p><p class="receipt-code">کد پیگیری: <b dir="ltr" data-code></b></p><p class="muted">این کد را نگه دارید؛ با آن می‌توانید از دفتر مدرسه پیگیری کنید.</p><div class="dialog-actions"><button type="button" class="btn btn-primary" data-close>باشه</button></div>';
  $("[data-text]", box).textContent = text;
  $("[data-code]", box).textContent = id ? String(id).slice(0, 8).toUpperCase() : "—";
  $("[data-close]", box).addEventListener("click", () => box.close());
  box.addEventListener("close", () => box.remove());
  document.body.append(box);
  box.showModal();
}

export function createFormController({ form, validate, review, success, draftKey, secureKey }) {
  const vault = secureKey && window.crypto?.subtle && window.indexedDB ? secureDraft(secureKey) : null;
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
      // a helper checkbox inside another field (noPlate under the address) must not blank that field's error
      if (!msg && els[0].type === "checkbox" && controls(name).length === 1 && $$("[name]", els[0].closest(".field")).some((el) => el.name !== name)) continue;
      const slot = $("[data-error]", els[0].closest(".field"));
      if (slot) { slot.textContent = msg; if (!slot.id) slot.id = `${form.id || "f"}-${name}-err`; }
      els.forEach((el) => { el.setAttribute("aria-invalid", String(!!msg)); if (slot) el.setAttribute("aria-describedby", slot.id); });
    }
  };
  const errorsNow = () => { const r = validate(read()); return r.ok ? {} : r.errors; };

  /* a date picked from three lists (day, month, year); days a month does not have cannot be picked */
  for (const box of $$("[data-date]", form)) {
    const target = $('input[type="hidden"]', box.closest(".field"));
    const part = (k) => $(`[data-date-part="${k}"]`, box);
    const sync = () => {
      const [d, m, y] = ["day", "month", "year"].map((k) => part(k).value);
      const max = m ? jalaliMonthDays(Number(y) || 1399, Number(m)) : 31;
      for (const o of part("day").options) if (o.value) o.disabled = Number(o.value) > max;
      target.value = d && m && y ? `${y}/${m}/${d}` : "";
      // a whole date that cannot exist is reported at once, not only when the step is left
      if (d && m && y) showErrors(errorsNow(), [target.name]);
    };
    box.addEventListener("change", sync);
    form.addEventListener("reset", () => setTimeout(sync, 0));
  }
  enhanceSelects(form);

  form.addEventListener("input", (e) => {
    const counter = $(`[data-count-for="${e.target.name}"]`, form);
    if (counter) counter.textContent = toPersianDigits(e.target.value.length);
    if (draftKey) try { const { website, startedAt, ...draft } = read(); sessionStorage.setItem(draftKey, JSON.stringify(draft)); } catch {}
    if (vault) { const { website, startedAt, ...draft } = read(); vault.save(draft).catch(() => {}); }
  });
  form.addEventListener("change", () => { if (vault) { const { website, startedAt, ...draft } = read(); vault.save(draft).catch(() => {}); } });
  // a message already on screen clears as soon as the field is right; nothing new appears while typing
  const clearFixed = (e) => {
    const name = e.target.name || $('input[type="hidden"]', e.target.closest(".field") ?? form)?.name;
    if (!name || e.target.getAttribute("aria-invalid") !== "true") return;
    if (!errorsNow()[name]) showErrors({}, [name]);
  };
  form.addEventListener("input", clearFixed);
  form.addEventListener("change", clearFixed);

  // The privacy page opens over the form instead of replacing it, so nothing typed is lost; leaving a
  // half-filled form by any other way asks first.
  let dirty = false;
  form.addEventListener("input", () => { dirty = true; });
  addEventListener("beforeunload", (e) => { if (dirty && !form.dataset.sent) { e.preventDefault(); e.returnValue = ""; } });
  for (const a of $$('a[href^="/privacy"]', form.closest("main") ?? form)) {
    a.addEventListener("click", async (e) => {
      e.preventDefault();
      let box = $("#privacy-dialog");
      if (!box) {
        box = document.createElement("dialog");
        box.id = "privacy-dialog";
        box.className = "dialog privacy-dialog";
        box.setAttribute("aria-label", "حریم خصوصی");
        box.innerHTML = '<div class="privacy-body"><p>در حال بارگذاری…</p></div><button type="button" class="btn btn-primary" data-close>بازگشت به فرم</button>';
        $("[data-close]", box).addEventListener("click", () => box.close());
        box.addEventListener("click", (ev) => { if (ev.target === box) box.close(); });
        document.body.append(box);
        box.showModal();
        try {
          const html = await (await fetch("/privacy")).text();
          const doc = new DOMParser().parseFromString(html, "text/html");
          const main = doc.querySelector("main .wrap, main");
          $$("script, form, .context-back, [data-context-back]", main).forEach((n) => n.remove());
          $(".privacy-body", box).replaceChildren(...main.children);
        } catch { $(".privacy-body", box).innerHTML = '<p>بارگذاری نشد. <a href="/privacy" target="_blank" rel="noopener">صفحه‌ی حریم خصوصی را در برگه‌ی تازه باز کنید</a>.</p>'; }
        const hash = a.hash && $(a.hash, box);
        if (hash) hash.scrollIntoView();
        return;
      }
      box.showModal();
    });
  }

  // the encrypted draft of a longer form: fields are filled back as if typed, so lists and dates show it too
  vault?.load().then((draft) => {
    if (!draft) return;
    for (const [k, v] of Object.entries(draft)) {
      const f = form.elements[k];
      if (!f || v === "" || v === false || v == null) continue;
      if (f.type === "checkbox") { f.checked = !!v; f.dispatchEvent(new Event("change", { bubbles: true })); continue; }
      if (f.type === "hidden") {
        const box = $("[data-date]", f.closest(".field") ?? form);
        const [y, m, d] = String(v).split("/");
        if (box && d) for (const [part, val] of [["year", y], ["month", m], ["day", d]]) {
          const sel = $(`[data-date-part="${part}"]`, box);
          sel.value = val;
          sel.dispatchEvent(new Event("change", { bubbles: true }));
        }
        continue;
      }
      f.value = v;
      (f instanceof RadioNodeList ? [...f].find((r) => r.checked) : f)?.dispatchEvent(new Event("change", { bubbles: true }));
      $(`[data-count-for="${k}"]`, form)?.replaceChildren(toPersianDigits(String(v).length));
    }
    dirty = true;
  }).catch(() => vault.clear());

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
    const target = Math.max(0, Math.min(steps.length - 1, i));
    // which side the new step slides in from (main.css); a jump without focus (reset, start) just fades
    if (focus && target !== current) form.dataset.stepDir = target > current ? "next" : "prev";
    else delete form.dataset.stepDir;
    current = target;
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
      dirty = false;
      $$("[data-count-for]", form).forEach((c) => (c.textContent = "۰"));
      $("[data-started]", form).value = String(Date.now());
      if (steps.length > 1) showStep(0, false);
      if (draftKey) try { sessionStorage.removeItem(draftKey); } catch {}
      vault?.clear();
      showReceipt(success, body.id);
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

/**
 * Lists drawn by the site instead of the phone's own picker (which looks different on every device):
 * each <select> stays in the form and keeps the value; a button shows the choice and opens a sheet in
 * the site's colours. Options disabled in the native list (days a month does not have) are disabled here.
 */
let sheet;
function getSheet() {
  if (sheet) return sheet;
  sheet = document.createElement("dialog");
  sheet.className = "sheet";
  sheet.innerHTML = `<div class="sheet-head"><h3 class="sheet-title"></h3><button type="button" class="icon-btn sheet-close" aria-label="بستن"><svg class="ic" aria-hidden="true"><use href="#i-close"/></svg></button></div><div class="sheet-list" role="listbox"></div>`;
  $(".sheet-close", sheet).addEventListener("click", () => sheet.close());
  // a tap on the dimmed backdrop closes the sheet: declared where the browser supports it, scripted in Safari
  sheet.setAttribute("closedby", "any");
  if (!("closedBy" in HTMLDialogElement.prototype)) sheet.addEventListener("click", (e) => { if (e.target === sheet) sheet.close(); });
  document.body.append(sheet);
  return sheet;
}

export function enhanceSelects(root) {
  for (const select of $$("select", root)) {
    if (select.dataset.enhanced) continue;
    select.dataset.enhanced = "1";
    const field = select.closest(".field");
    const own = select.id ? $(`label[for="${select.id}"]`) : null;
    const label = (select.getAttribute("aria-label") || own?.textContent || field?.querySelector("legend")?.textContent || "").replace("*", "").trim();
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "picker";
    btn.setAttribute("aria-haspopup", "dialog");
    if (select.dataset.datePart) btn.dataset.datePart = select.dataset.datePart;
    const text = document.createElement("span");
    btn.append(text);
    btn.insertAdjacentHTML("beforeend", '<svg class="ic" aria-hidden="true" viewBox="0 0 24 24"><path d="m6 9 6 6 6-6"/></svg>');
    select.classList.add("native-select");
    select.tabIndex = -1;
    select.setAttribute("aria-hidden", "true");
    select.after(btn);
    const sync = () => {
      const o = select.selectedOptions[0];
      text.textContent = o?.textContent || "";
      btn.classList.toggle("is-empty", !select.value);
      btn.setAttribute("aria-label", `${label}: ${select.value ? o.textContent : "انتخاب نشده"}`);
      btn.setAttribute("aria-invalid", select.getAttribute("aria-invalid") || "false");
    };
    // errors are written on the select; the button mirrors them
    new MutationObserver(sync).observe(select, { attributes: true, attributeFilter: ["aria-invalid"] });
    select.addEventListener("change", sync);
    select.form?.addEventListener("reset", () => setTimeout(sync, 0));
    select.addEventListener("focus", () => btn.focus());
    btn.addEventListener("click", () => {
      const s = getSheet();
      $(".sheet-title", s).textContent = label;
      const list = $(".sheet-list", s);
      list.setAttribute("aria-label", label);
      list.classList.toggle("is-grid", select.options.length > 14);
      list.replaceChildren(...[...select.options].filter((o) => o.value).map((o) => {
        const b = document.createElement("button");
        b.type = "button";
        b.setAttribute("role", "option");
        b.textContent = o.textContent;
        b.disabled = o.disabled;
        b.setAttribute("aria-selected", String(o.selected && !!select.value));
        b.addEventListener("click", () => {
          select.value = o.value;
          select.dispatchEvent(new Event("change", { bubbles: true }));
          s.close();
          btn.focus({ preventScroll: true });
        });
        return b;
      }));
      // closed with Escape or the backdrop: focus goes back to the button, unless the visitor has
      // already moved on to another field (the close event arrives a moment later)
      s.addEventListener("close", () => {
        const a = document.activeElement;
        if (!a || a === document.body || s.contains(a)) btn.focus({ preventScroll: true });
      }, { once: true });
      s.showModal();
      const current = $('[aria-selected="true"]', list) || $("button:not(:disabled)", list);
      current?.focus({ preventScroll: true });
      current?.scrollIntoView({ block: "center" });
    });
    sync();
  }
}
