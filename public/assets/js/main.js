import { validateInquiry, toPersianDigits, GRADE_LABEL } from "./validate.js";
import { searchItem, searchTeachers } from "./search.js";
import { $, $$, initChrome, createFormController, reduceMotion } from "./common.js";

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
whenIdle(() => {
  /* motion (GSAP) loads in the background; until it is ready, or if it never is, everything works without it */
  let motion = null;
  if (!reduceMotion.matches) import("./motion.js").then((m) => m.initMotion()).then((api) => { motion = api; }, () => {});

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
     Answers stay open independently: closing one automatically pushed the question just tapped off screen.
     After opening, the page moves just enough for the whole answer to be visible. */
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
    if (reduceMotion.matches) { if (!open) d.open = false; return Promise.resolve(); }
    const a = d.animate({ height: [`${from}px`, `${to}px`] }, { duration: 320, easing: "cubic-bezier(.22,1,.36,1)" });
    faqAnim.set(d, a);
    return a.finished.then(() => { if (!open) d.open = false; }, () => {});
  };
  const showWhole = (d) => {
    const r = d.getBoundingClientRect();
    const top = (header?.offsetHeight ?? 0) + 12;
    const over = r.bottom - (innerHeight - 16);
    if (over > 0) scrollBy({ top: Math.min(over, r.top - top), behavior: reduceMotion.matches ? "instant" : "smooth" });
    else if (r.top < top) scrollBy({ top: r.top - top, behavior: reduceMotion.matches ? "instant" : "smooth" });
  };
  faqItems.forEach((d) => $("summary", d).addEventListener("click", (e) => {
    e.preventDefault();
    // an answer that is still closing counts as shut, so a quick second click opens it again
    if (d.open && d.classList.contains("is-open")) { slide(d, false); return; }
    slide(d, true).then(() => showWhole(d));
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
    // phones: the new card slides in from the side it comes from (next from the left in this right-to-left page)
    if (inSwipe() && index >= 0) track.dataset.dir = i > index ? "next" : "prev";
    index = i;
    cards.forEach((c, n) => {
      c.classList.toggle("is-current", n === i);
      c.classList.toggle("is-near", Math.abs(n - i) <= 1);
      c.classList.toggle("is-before", n < i);
    });
    $("[data-team-now]").textContent = toPersianDigits(i + 1);
    $("[data-team-progress]").style.setProperty("--p", String((i + 1) / cards.length));
  };
  /* phones: one card at a time; a sideways swipe moves to the next or previous teacher */
  const swipeTo = (i) => {
    i = Math.max(0, Math.min(cards.length - 1, i));
    if (i === index) return;
    setIndex(i);
    // the whole card stays on screen when its height changes
    const top = track.getBoundingClientRect().top;
    if (top < 0) track.scrollIntoView({ block: "start", behavior: "instant" });
  };
  let touch = null;
  team.addEventListener("touchstart", (e) => {
    if (!inSwipe() || e.touches.length !== 1) return;
    touch = { x: e.touches[0].clientX, y: e.touches[0].clientY, sideways: null };
  }, { passive: true });
  team.addEventListener("touchmove", (e) => {
    if (!touch) return;
    const dx = e.touches[0].clientX - touch.x, dy = e.touches[0].clientY - touch.y;
    touch.sideways ??= Math.abs(dx) > 8 || Math.abs(dy) > 8 ? Math.abs(dx) > Math.abs(dy) : null;
    if (!touch.sideways) return;
    // the card follows the finger a little, so the swipe feels attached
    const card = cards[index];
    card.classList.add("is-dragging");
    card.style.transform = `translateX(${dx * 0.4}px)`;
  }, { passive: true });
  team.addEventListener("touchend", (e) => {
    if (!touch) return;
    const dx = e.changedTouches[0].clientX - touch.x;
    const card = cards[index];
    card.classList.remove("is-dragging");
    card.style.transform = "";
    // dragging to the right brings the next card (it waits on the left in this right-to-left page)
    if (touch.sideways && Math.abs(dx) > 40) swipeTo(index + (dx > 0 ? 1 : -1));
    touch = null;
  }, { passive: true });
  team.addEventListener("touchcancel", () => { if (touch) { cards[index].classList.remove("is-dragging"); cards[index].style.transform = ""; } touch = null; });

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
    delete track.dataset.dir;
    if (mode === "swipe") setIndex(0);
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
    const show = () => cards.forEach((c, i) => {
      const visible = !q || matches.has(i);
      c.hidden = !visible;
      if (visible) c.classList.add("is-in");
    });
    // results are a list; clearing the search goes back to one by one
    const listBefore = !inDeck() && !inSwipe();
    setDeck(!q && wantsDeck);
    // narrowing or widening a list that stays a list: the cards glide to their new places
    if (listBefore && !inDeck() && !inSwipe() && motion) motion.flip(cards, show, { root: team });
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

  /* callback request */
  createFormController({
    form: $("[data-inquiry]"),
    validate: validateInquiry,
    draftKey: "inquiry-draft",
    success: "درخواست ثبت شد. مشاور مدرسه شنبه تا چهارشنبه، ساعت ۷ تا ۱۴ با شما تماس می‌گیرد.",
    review: (v) => [["نام ولی", v.parentName], ["شماره همراه", toPersianDigits(v.phone)], ["پایه", GRADE_LABEL[v.grade]], ["پیام", v.message]],
  });
});
