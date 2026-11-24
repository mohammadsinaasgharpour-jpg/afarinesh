// Blog pages: the shared header and theme, category tabs on the index (from the address's #category, so a tab
// can be linked and the back button works), cards rising into view, and a reading bar on articles.
import { $, $$, initChrome } from "./common.js";

initChrome();

const grid = $("[data-post-grid]");
if (grid) {
  const cards = $$(".blog-list .post-card");
  const links = $$("[data-cat-link]");
  const empty = $("[data-blog-empty]");
  const apply = () => {
    const cat = location.hash.slice(1);
    const known = links.some((a) => a.dataset.catLink === cat) ? cat : "all";
    links.forEach((a) => a.setAttribute("aria-current", String(a.dataset.catLink === known)));
    let shown = 0;
    for (const c of cards) {
      const on = known === "all" || c.dataset.cat === known;
      c.hidden = !on;
      if (on) { shown++; c.classList.add("is-in"); }
    }
    empty.hidden = shown > 0;
  };
  addEventListener("hashchange", apply);
  if (location.hash) apply();
}

// cards below the screen rise into place as they arrive; those already visible are left alone
if (!matchMedia("(prefers-reduced-motion: reduce)").matches && "IntersectionObserver" in window) {
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) if (e.isIntersecting) { e.target.classList.add("is-in"); io.unobserve(e.target); }
  }, { rootMargin: "0px 0px -8% 0px" });
  const below = $$(".post-card").filter((c) => c.getBoundingClientRect().top > innerHeight && !c.classList.contains("is-in"));
  if (below.length) {
    document.documentElement.classList.add("js-reveal");
    below.forEach((c) => io.observe(c));
    $$(".post-card").filter((c) => !below.includes(c)).forEach((c) => c.classList.add("is-in"));
  }
}

// articles: a thin bar at the top shows how far the reader is
const post = $(".post .prose");
if (post) {
  const bar = Object.assign(document.createElement("div"), { className: "read-bar" });
  bar.setAttribute("aria-hidden", "true");
  document.body.append(bar);
  let ticking = false;
  const draw = () => {
    ticking = false;
    const r = post.getBoundingClientRect();
    const p = Math.min(1, Math.max(0, -r.top / Math.max(1, r.height - innerHeight * 0.6)));
    bar.style.setProperty("--read", p.toFixed(3));
  };
  addEventListener("scroll", () => { if (!ticking) { ticking = true; requestAnimationFrame(draw); } }, { passive: true });
  draw();
}
