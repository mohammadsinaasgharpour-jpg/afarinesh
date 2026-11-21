import { validateInquiry, toPersianDigits, GRADE_LABEL } from "./validate.js";
import { searchItem, searchTeachers } from "./search.js";
import { $, $$, initChrome, createFormController, reduceMotion, scroller } from "./common.js";

initChrome();

// The page is drawn first; the teachers section, the menu highlight and the callback form are set up a
// moment later, when the browser is idle, so their work does not hold up the first paint on phones.
const whenIdle = (fn) => {
  let started = false;
  const start = () => { if (started) return; started = true; fn(); };
  // a link to a section further down needs the final layout at once
  if (location.hash) return start();
  // otherwise when the browser is idle after loading, or at once when the visitor starts to scroll, tap or type
  for (const type of ["scroll", "pointerdown", "keydown", "focusin"]) addEventListener(type, start, { once: true, passive: true });
  const run = () => (window.requestIdleCallback ? requestIdleCallback(start, { timeout: 1500 }) : setTimeout(start, 1));
  if (document.readyState === "complete") run();
  else addEventListener("load", run, { once: true });
};
/* motion (GSAP) loads in the background; until it is ready, or if it never is, everything works without it.
   It is set up on the visitor's first scroll, touch, pointer move or key: nothing on the first screen animates,
   so waiting costs nothing visible, and a phone spends its first seconds showing the page instead. */
let motion = null;
const MOTION_START = ["scroll", "wheel", "touchstart", "pointermove", "keydown"];
const startMotion = () => {
  MOTION_START.forEach((type) => removeEventListener(type, startMotion, true));
  import("./motion.js").then((m) => m.initMotion()).then((api) => { motion = api; }, () => {});
};
if (location.hash) startMotion();
else MOTION_START.forEach((type) => addEventListener(type, startMotion, { capture: true, passive: true }));
// once the page has loaded, the vendor files are fetched quietly, so the first interaction does not wait for them
addEventListener("load", () => setTimeout(() => {
  for (const f of ["gsap.min.js", "ScrollTrigger.min.js", "Flip.min.js", "lenis.min.js"]) {
    document.head.append(Object.assign(document.createElement("link"), { rel: "prefetch", href: `/assets/js/vendor/${f}`, as: "script" }));
  }
}, 2000), { once: true });

whenIdle(() => {
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

  /* FAQ: each answer slides open and shut in every browser (Safari has no animation to an intrinsic size).
     One answer at a time: opening a question folds the one that was open. When that one sits above, the
     page is moved frame by frame by exactly what it gives up, so the question just tapped stays under the
     finger. After opening, the page moves just enough for the whole answer to be visible. */
  const faqItems = $$(".faq details");
  const header = $(".site-header");
  const faqAnim = new WeakMap();
  const slide = (d, open) => {
    // with GSAP loaded the motion system animates it (height, answer fade); otherwise the browser does
    const animated = motion?.accordion(d, open);
    if (animated) return animated;
    faqAnim.get(d)?.cancel();
    const summary = $("summary", d);
    const closedH = summary.offsetHeight + (d.offsetHeight - d.clientHeight);
    const from = d.offsetHeight;
    if (open) d.open = true;
    d.classList.toggle("is-open", open);
    const to = open ? d.offsetHeight : closedH;

    const a = d.animate({ height: [`${from}px`, `${to}px`] }, { duration: 320, easing: "cubic-bezier(.22,1,.36,1)" });
    faqAnim.set(d, a);
    return a.finished.then(() => { if (!open) d.open = false; }, () => {});
  };
  const showWhole = (d) => {
    const r = d.getBoundingClientRect();
    const top = (header?.offsetHeight ?? 0) + 12;
    const over = r.bottom - (innerHeight - 16);
    if (over > 0) scroller.by(Math.min(over, r.top - top));
    else if (r.top < top) scroller.by(r.top - top);
  };
  // keeps `el` where it is on screen until `done` settles, while content above it changes height
  const holdInPlace = (el, done) => {
    const html = document.documentElement;
    html.style.overflowAnchor = "none"; // the browser's own correction would count the shift twice
    const y0 = el.getBoundingClientRect().top;
    let on = true;
    const tick = () => {
      const dy = el.getBoundingClientRect().top - y0;
      if (Math.abs(dy) >= 1) scroller.by(dy, false);
      if (on) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    return done.then(() => { on = false; tick(); html.style.overflowAnchor = ""; });
  };
  faqItems.forEach((d) => $("summary", d).addEventListener("click", (e) => {
    e.preventDefault();
    // an answer that is still closing counts as shut, so a quick second click opens it again
    if (d.open && d.classList.contains("is-open")) { slide(d, false); return; }
    const others = faqItems.filter((o) => o !== d && o.classList.contains("is-open"));
    const above = others.some((o) => o.compareDocumentPosition(d) & Node.DOCUMENT_POSITION_FOLLOWING);
    const closing = Promise.all(others.map((o) => slide(o, false)));
    const opening = slide(d, true);
    const settled = Promise.all([closing, opening]);
    (above ? holdInPlace($("summary", d), settled) : settled).then(() => showWhole(d));
  }));
  // answers opened before this script ran (or by the browser's find-in-page) carry the open state too
  faqItems.forEach((d) => d.classList.toggle("is-open", d.open));
  faqItems.forEach((d) => d.addEventListener("toggle", () => { if (d.open) d.classList.add("is-open"); }));

  const reveal = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      entry.target.classList.add("is-in");
      reveal.unobserve(entry.target);
    }
  }, { rootMargin: "0px 0px -12% 0px" });
  cards.forEach((c) => reveal.observe(c));

  // One at a time on every screen: the buttons, a sideways swipe or the arrow keys change teacher. The page
  // itself is never pinned or moved: every card sits in the same grid cell, so the row is always as tall as
  // the tallest card and changing teacher shifts nothing above or below it.
  // Pressing «نمایش همه» or searching gives the plain list instead.
  let wantsDeck = true;
  let index = -1;
  const inSwipe = () => track.classList.contains("is-swipe");

  const setIndex = (i) => {
    if (i === index) return;
    // the new card slides in from the side it comes from (next from the left in this right-to-left page)
    if (index >= 0) track.dataset.dir = i > index ? "next" : "prev";
    index = i;
    cards.forEach((c, n) => c.classList.toggle("is-current", n === i));
    $("[data-team-now]").textContent = toPersianDigits(i + 1);
    $("[data-team-progress]").style.setProperty("--p", String((i + 1) / cards.length));
  };
  // Turning a page: the sheet that moves turns over around its right edge (a Persian book opens to the right),
  // to -180 degrees for the next teacher; for the previous one the earlier sheet comes back over the stack.
  // Past 90 degrees its back is hidden, so the sheet underneath shows through.
  const ANGLE = 180;
  let turning = false;
  let drag = null;
  let target = 0; // where quick repeated clicks are heading; the pages turn one after another until there
  const pageFor = (forward, to) => (forward ? cards[index] : cards[to]);
  const underFor = (forward, to) => (forward ? cards[to] : cards[index]);
  // Phones: a curtain. The top card slides aside with the finger (a slight tilt, a soft shadow) while the next
  // one rises from behind it. Wider screens: the card turns over from its right edge like a book page.
  const curtain = matchMedia("(max-width: 700px)");
  const frame = (p) => curtain.matches
    ? { page: { transform: `translateX(${p * 112}%) rotate(${p * 7}deg)`, opacity: String(1 - 0.35 * p) }, under: { transform: `scale(${0.92 + 0.08 * p})`, opacity: String(0.55 + 0.45 * p) } }
    : { page: { transform: `rotateY(${-p * ANGLE}deg)`, filter: `brightness(${1 - 0.16 * Math.sin(p * Math.PI)})` }, under: { transform: "none", opacity: "1" } };
  const pose = (page, under, p) => { Object.assign(page.style, frame(p).page); Object.assign(under.style, frame(p).under); };
  const clear = (...els) => els.forEach((el) => { el.classList.remove("is-turning", "is-under-now", "is-dragging"); el.style.transform = ""; el.style.filter = ""; el.style.opacity = ""; });
  /** Turn to card `to`, starting from progress `from` (0 = flat, 1 = fully turned) when a drag hands over. */
  const turn = (to, from) => {
    if (turning || to < 0 || to >= cards.length || to === index) return;
    // the visitor starts this motion, so it plays even with reduced motion (shorter, see below)
    const forward = to > index;
    const page = pageFor(forward, to), under = underFor(forward, to);
    const start = from ?? (forward ? 0 : 1), end = forward ? 1 : 0;
    turning = true;
    page.classList.add("is-turning");
    under.classList.add("is-under-now");
    const ps = [start, (start + end) / 2, end];
    const queued = Math.abs(target - to);
    const timing = { duration: (420 + 380 * Math.abs(end - start)) / (queued ? 2 : 1) * (reduceMotion.matches ? 0.5 : 1), easing: "cubic-bezier(.3,.6,.2,1)" };
    under.animate(ps.map((p) => frame(p).under), timing);
    const anim = page.animate(ps.map((p) => frame(p).page), timing);
    anim.finished.catch(() => {}).then(() => {
      clear(page, under); setIndex(to); turning = false;
      if (target !== index) turn(index + Math.sign(target - index));
    });
  };
  const goTo = (i) => {
    if (!inSwipe()) return;
    target = Math.max(0, Math.min(cards.length - 1, i));
    if (!turning && target !== index) turn(index + Math.sign(target - index));
  };
  const step = (d) => goTo((turning ? target : index) + d);

  // Dragging (finger or mouse) turns the sheet as far as the pointer goes; letting go past a quarter of the
  // width finishes the turn, otherwise the sheet falls back. Dragging right brings the next teacher.
  const dragStart = (x, y) => { if (inSwipe() && !turning) drag = { x, y, sideways: null, forward: null, p: 0 }; };
  const dragMove = (x, y) => {
    if (!drag) return;
    const dx = x - drag.x, dy = y - drag.y;
    drag.sideways ??= Math.abs(dx) > 8 || Math.abs(dy) > 8 ? Math.abs(dx) > Math.abs(dy) : null;
    if (!drag.sideways) return;
    const forward = dx > 0;
    const to = index + (forward ? 1 : -1);
    if (to < 0 || to >= cards.length) return;
    if (drag.forward !== forward) {
      if (drag.forward !== null) clear(pageFor(drag.forward, drag.to), underFor(drag.forward, drag.to));
      drag.forward = forward; drag.to = to;
      pageFor(forward, to).classList.add("is-turning", "is-dragging");
      underFor(forward, to).classList.add("is-under-now");
    }
    const p = Math.min(1, Math.abs(dx) / (team.clientWidth * 0.9));
    drag.p = p;
    pose(pageFor(forward, to), underFor(forward, to), forward ? p : 1 - p);
  };
  const dragEnd = () => {
    if (!drag) return;
    const d = drag;
    drag = null;
    if (d.forward === null) return;
    const page = pageFor(d.forward, d.to), under = underFor(d.forward, d.to);
    page.classList.remove("is-dragging");
    if (d.p > 0.25) { clear(page, under); target = d.to; turn(d.to, d.forward ? d.p : 1 - d.p); return; }
    // not far enough: the sheet falls back to where it was
    const now = d.forward ? d.p : 1 - d.p, rest = d.forward ? 0 : 1;
    turning = true;
    under.animate([frame(now).under, frame(rest).under], { duration: 260, easing: "ease-out" });
    page.animate([frame(now).page, frame(rest).page], { duration: 260, easing: "ease-out" })
      .finished.catch(() => {}).then(() => { clear(page, under); turning = false; });
  };
  team.addEventListener("touchstart", (e) => { if (e.touches.length === 1) dragStart(e.touches[0].clientX, e.touches[0].clientY); }, { passive: true });
  // once a swipe is clearly sideways the page itself stops scrolling, so a sudden finger move cannot jump it
  team.addEventListener("touchmove", (e) => { dragMove(e.touches[0].clientX, e.touches[0].clientY); if (drag?.sideways) e.preventDefault(); }, { passive: false });
  team.addEventListener("touchend", dragEnd, { passive: true });
  team.addEventListener("touchcancel", dragEnd);
  team.addEventListener("mousedown", (e) => {
    if (e.button !== 0 || e.target.closest("button, a, input, textarea, select")) return;
    e.preventDefault(); // no text selection while dragging the page
    dragStart(e.clientX, e.clientY);
    team.classList.add("is-mouse-dragging");
  });
  addEventListener("mousemove", (e) => dragMove(e.clientX, e.clientY));
  const endMouse = () => { team.classList.remove("is-mouse-dragging"); dragEnd(); };
  addEventListener("mouseup", endMouse);
  addEventListener("blur", endMouse);
  // on: one at a time; off: the plain list
  const setDeck = (on) => {
    if (on === inSwipe()) return;
    track.classList.toggle("is-swipe", on);
    bar.hidden = false;
    $("[data-team-prev]").hidden = $("[data-team-next]").hidden = !on;
    bar.querySelector(".team-count").hidden = bar.querySelector(".team-progress").hidden = !on;
    allBtn.textContent = on ? "نمایش همه" : "نمایش یکی‌یکی";
    index = -1;
    delete track.dataset.dir;
    target = 0;
    if (on) setIndex(0);
    else cards.forEach((c) => c.classList.remove("is-current"));
  };
  $("[data-team-total]").textContent = toPersianDigits(cards.length);
  $("[data-team-prev]").addEventListener("click", () => step(-1));
  $("[data-team-next]").addEventListener("click", () => step(1));
  allBtn.addEventListener("click", () => {
    wantsDeck = !inSwipe();
    setDeck(wantsDeck);
    if (!wantsDeck) track.scrollIntoView({ behavior: reduceMotion.matches ? "instant" : "smooth" });
  });
  // with the focus on a card or its buttons, the left and right arrows change teacher (left is next in RTL)
  team.parentElement.addEventListener("keydown", (e) => {
    if (!inSwipe() || e.altKey || e.ctrlKey || e.metaKey || e.target.closest?.("input, textarea, select")) return;
    const dir = { ArrowLeft: 1, ArrowRight: -1 }[e.key];
    if (!dir) return;
    e.preventDefault();
    step(dir);
  });
  setDeck(wantsDeck);

  // the search index is built on first use, not while the page loads
  let items;
  const searchItems = () => (items ??= cards.map((c) => searchItem(`${$(".teacher-name", c).textContent} ${$(".teacher-role", c).textContent}`, c.textContent)));

  function applyTeamSearch() {
    const q = search.value.trim();
    const { matches, partial } = searchTeachers(searchItems(), q);
    const show = () => cards.forEach((c, i) => {
      const visible = !q || matches.has(i);
      c.hidden = !visible;
      if (visible) c.classList.add("is-in");
    });
    // results are a list; clearing the search goes back to one by one
    const listBefore = !inSwipe();
    setDeck(!q && wantsDeck);
    // narrowing or widening a list that stays a list: the cards glide to their new places
    if (listBefore && !inSwipe() && motion) motion.flip(cards, show, { root: team });
    else show();
    const shown = q ? matches.size : cards.length;
    empty.hidden = shown > 0;
    status.textContent = !q ? "" : partial
      ? `نتیجه‌ی دقیقی نبود؛ ${toPersianDigits(shown)} نفر مرتبط`
      : `${toPersianDigits(shown)} نفر از ${toPersianDigits(cards.length)} نفر`;
  }
  let searchTimer;
  search.addEventListener("input", () => { clearTimeout(searchTimer); searchTimer = setTimeout(applyTeamSearch, 120); });
  // text typed before this script started is applied now
  if (search.value.trim()) applyTeamSearch();
  $("[data-team-reset]").addEventListener("click", () => {
    search.value = "";
    applyTeamSearch();
    search.focus();
  });

  /* campus photos: a tap opens the photo large; arrows, swipe or the keyboard move through them */
  const shots = $$(".campus-grid figure");
  if (shots.length) {
    const box = document.createElement("dialog");
    box.className = "lightbox";
    box.setAttribute("aria-label", "عکس‌های مدرسه");
    box.innerHTML = '<figure><img alt=""><figcaption></figcaption></figure><button type="button" class="lb-close" aria-label="بستن">✕</button><button type="button" class="lb-prev" aria-label="عکس قبلی">›</button><button type="button" class="lb-next" aria-label="عکس بعدی">‹</button>';
    document.body.append(box);
    const big = $("img", box), cap = $("figcaption", box);
    let at = 0;
    const showShot = (i) => {
      at = (i + shots.length) % shots.length;
      const img = $("img", shots[at]);
      big.src = img.currentSrc.replace("-640.webp", "-1280.webp");
      big.alt = img.alt;
      cap.textContent = $("figcaption", shots[at]).textContent;
    };
    shots.forEach((f, i) => {
      f.tabIndex = 0;
      f.setAttribute("role", "button");
      const open = () => { showShot(i); box.showModal(); };
      f.addEventListener("click", open);
      f.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(); } });
    });
    $(".lb-close", box).addEventListener("click", () => box.close());
    $(".lb-prev", box).addEventListener("click", () => showShot(at - 1));
    $(".lb-next", box).addEventListener("click", () => showShot(at + 1));
    box.addEventListener("click", (e) => { if (e.target === box || e.target.tagName === "FIGURE") box.close(); });
    box.addEventListener("keydown", (e) => { if (e.key === "ArrowLeft") showShot(at + 1); if (e.key === "ArrowRight") showShot(at - 1); });
    let sx = null;
    box.addEventListener("touchstart", (e) => { sx = e.touches[0].clientX; }, { passive: true });
    box.addEventListener("touchend", (e) => { if (sx === null) return; const dx = e.changedTouches[0].clientX - sx; if (Math.abs(dx) > 40) showShot(at + (dx > 0 ? 1 : -1)); sx = null; }, { passive: true });
  }

  /* callback request */
  createFormController({
    form: $("[data-inquiry]"),
    validate: validateInquiry,
    draftKey: "inquiry-draft",
    success: "درخواست ثبت شد. مشاور مدرسه شنبه تا چهارشنبه، ساعت ۷ تا ۱۴ با شما تماس می‌گیرد.",
    review: (v) => [["نام ولی", v.parentName], ["شماره همراه", toPersianDigits(v.phone)], ["پایه", GRADE_LABEL[v.grade]], ["پیام", v.message]],
  });
});
