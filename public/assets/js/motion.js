// Motion system for the home page (GSAP 3, served from /assets/js/vendor/).
//
// Rules this file keeps:
// - Content never waits for motion. Nothing is hidden in CSS ahead of time; an element is only prepared
//   for an entrance here, after GSAP has loaded, and only while it is still below the screen. Without
//   JavaScript, before this file runs, or with reduced motion, every element is simply there.
// - transform and opacity only; reads (positions) happen before writes; one shared trigger per group.
// - One timing scale, mirrored from main.css (--ease, --dur-*), so CSS and GSAP motion feel the same.
// - Right-to-left: a sequence reads from the right, so its steps arrive from the right (positive x).
// - Wide screens get the full set; phones skip the scroll-linked parts (parallax, scrubbing).
// - Every tween is made inside gsap.matchMedia(), so switching breakpoint or turning on reduced motion
//   reverts it cleanly (inline styles removed, triggers killed).
import { toPersianDigits } from "./validate.js";

/** Shared timing. ease ≈ main.css --ease: cubic-bezier(.22, 1, .36, 1). */
export const MOTION = {
  ease: "power3.out",
  dur: { quick: 0.15, fast: 0.25, slow: 0.4, verySlow: 0.5, count: 1.1 },
  stagger: 0.06,
  rise: { wide: 18, narrow: 10 }, // px an element travels on entrance
  start: "top 88%", // when an entrance plays: the element's top passes 88% of the screen height
};

const WIDE = "(min-width: 861px)";
const NARROW = "(max-width: 860px)";
const STILL = "(prefers-reduced-motion: reduce)";
const VENDOR = "/assets/js/vendor/";

let loading;
/** Loads GSAP and the two plugins once, in order (async=false keeps execution order for added scripts). */
function loadGsap() {
  const load = (name) => new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = VENDOR + name;
    s.async = false;
    s.onload = resolve;
    s.onerror = () => reject(new Error(`could not load ${name}`));
    document.head.append(s);
  });
  return (loading ??= Promise.all(["gsap.min.js", "ScrollTrigger.min.js", "Flip.min.js"].map(load)).then(() => {
    const { gsap, ScrollTrigger, Flip } = window;
    gsap.registerPlugin(ScrollTrigger, Flip);
    return { gsap, ScrollTrigger, Flip };
  }));
}

/** Below the visible screen right now (only those get an entrance; anything already seen stays put). */
const belowScreen = (el) => el.getBoundingClientRect().top > innerHeight;
/** Elements that have had their entrance; a breakpoint change must not hide them again. */
const shown = new WeakSet();

/* Entrances: [container, children]. Children of one container that enter together arrive in order. */
const GROUPS = [
  [".section-head", ":scope > *"], // heading, then its paragraph
  ["#approach .split-text", ":scope > *"],
  [".features", ":scope > li"],
  [".mondrian", ":scope > .cell"],
  [".faq", ":scope > details"],
  [".enrol-row", ":scope > *"],
  [".contact", ":scope > *"],
];

function entrances(gsap, ScrollTrigger, rise) {
  for (const [container, children] of GROUPS) {
    for (const box of document.querySelectorAll(container)) {
      const items = [...box.querySelectorAll(children)].filter((el) => !shown.has(el) && belowScreen(el));
      if (!items.length) continue;
      // the cards' own CSS hover transition would chase every frame of the entrance; it waits until the end
      gsap.set(items, { opacity: 0, y: rise, transition: "none" });
      ScrollTrigger.batch(items, {
        start: MOTION.start,
        once: true,
        onEnter: (batch) => {
          batch.forEach((el) => shown.add(el));
          gsap.to(batch, {
            opacity: 1, y: 0, duration: MOTION.dur.verySlow, stagger: MOTION.stagger,
            overwrite: true, clearProps: "opacity,transform,transition",
          });
        },
      });
    }
  }
}

/** Pictures settle from a slight zoom inside their frame (the frame clips, so nothing moves around it). */
function pictures(gsap) {
  for (const img of document.querySelectorAll(".map-card img")) {
    if (shown.has(img) || !belowScreen(img)) continue;
    gsap.fromTo(img, { scale: 1.06, opacity: 0.6 }, {
      scale: 1, opacity: 1, duration: 0.9, clearProps: "transform,opacity",
      scrollTrigger: { trigger: img, start: MOTION.start, once: true, onEnter: () => shown.add(img) },
    });
  }
}

/**
 * Figures count up once when they come into view and end on exactly the text in the page. The live count
 * is hidden from screen readers, which read the real value from a visually hidden copy the whole time.
 */
function counters(gsap) {
  const FA = /([۰-۹]+)/;
  const toNumber = (s) => Number(s.replace(/[۰-۹]/g, (d) => "۰۱۲۳۴۵۶۷۸۹".indexOf(d)));
  const restores = [];
  for (const dd of document.querySelectorAll(".fact dd")) {
    if (shown.has(dd) || !belowScreen(dd)) continue;
    const text = dd.textContent;
    const parts = text.split(FA); // odd entries are the numbers
    if (parts.length < 2) continue;
    const real = Object.assign(document.createElement("span"), { className: "visually-hidden", textContent: text });
    const live = document.createElement("span");
    live.setAttribute("aria-hidden", "true");
    const state = { p: 0 };
    const draw = () => { live.textContent = parts.map((s, i) => (i % 2 ? toPersianDigits(Math.round(toNumber(s) * state.p)) : s)).join(""); };
    const restore = () => { dd.textContent = text; };
    restores.push(restore);
    dd.replaceChildren(real, live);
    draw();
    gsap.to(state, {
      p: 1, duration: MOTION.dur.count, ease: "power2.out", onUpdate: draw, onComplete: restore,
      scrollTrigger: { trigger: dd, start: "top 92%", once: true, onEnter: () => shown.add(dd) },
    });
  }
  return () => restores.forEach((r) => r()); // matchMedia revert: the real text comes back
}

/**
 * Step sequences (a project's path, the admission steps) light up one after another. On wide screens
 * the lighting follows the scroll, so the story moves at the reader's pace without pinning anything;
 * on phones it plays once.
 */
function sequences(gsap, wide) {
  for (const list of document.querySelectorAll(".mondrian .path, .features .steps-line")) {
    const steps = [...list.children];
    if (shown.has(list) || !belowScreen(list)) continue;
    shown.add(list);
    const from = { opacity: 0.25, x: 12 };
    const to = { opacity: 1, x: 0, stagger: wide ? 0.5 : MOTION.stagger * 1.5, duration: wide ? 1 : MOTION.dur.slow, ease: wide ? "none" : MOTION.ease };
    gsap.fromTo(steps, from, {
      ...to,
      scrollTrigger: wide
        ? { trigger: list, start: "top 85%", end: "center 55%", scrub: 0.5 }
        : { trigger: list, start: "top 85%", once: true },
    });
  }
}

/** The hero photo drifts a little slower than the page (wide screens only, about 8% of its height). */
function heroDepth(gsap) {
  const media = document.querySelector(".hero-media");
  if (!media) return;
  gsap.to(media, {
    yPercent: 8, ease: "none",
    scrollTrigger: { trigger: ".hero", start: "top top", end: "bottom top", scrub: 0.4 },
  });
}

/** Trigger positions follow layout changes below them (sections drawn late, the teacher deck finishing). */
function followLayout(ScrollTrigger) {
  let timer;
  const ro = new ResizeObserver(() => { clearTimeout(timer); timer = setTimeout(() => ScrollTrigger.refresh(), 200); });
  ro.observe(document.body);
}

/**
 * FAQ answer open/shut: height, a short fade of the answer, and the plus icon turning (CSS, on .is-open).
 * A new click on the same question replaces the running animation from where it is, so fast clicks never
 * stack. Resolves when the motion ends.
 */
function makeAccordion(gsap) {
  return (d, open) => new Promise((resolve) => {
    const summary = d.querySelector("summary");
    const answer = [...d.children].filter((c) => c !== summary);
    gsap.killTweensOf([d, ...answer]);
    const from = d.offsetHeight;
    const frame = d.offsetHeight - d.clientHeight;
    d.style.height = "";
    if (open) d.open = true;
    d.classList.toggle("is-open", open);
    const to = open ? d.offsetHeight : summary.offsetHeight + frame;
    gsap.fromTo(d, { height: from }, {
      height: to, duration: 0.32, ease: MOTION.ease, overwrite: true,
      onComplete: () => {
        if (!open) d.open = false;
        gsap.set([d, ...answer], { clearProps: "height,opacity,transform" });
        resolve();
      },
    });
    if (open) gsap.fromTo(answer, { opacity: 0, y: 6 }, { opacity: 1, y: 0, duration: MOTION.dur.slow, delay: 0.06 });
    else gsap.to(answer, { opacity: 0, duration: MOTION.dur.quick });
  });
}

/**
 * Moves elements smoothly from where they were to where `change()` puts them (search results narrowing
 * or widening). Elements that appear fade in; ones that leave go at once. Any previous move is finished
 * first, so typing quickly never leaves cards halfway.
 */
function makeFlip(gsap, Flip) {
  let running;
  return (targets, change, { root } = {}) => {
    running?.progress(1);
    const state = Flip.getState(targets);
    change();
    root?.classList.add("is-flipping");
    running = Flip.from(state, {
      duration: MOTION.dur.slow, ease: MOTION.ease, prune: true,
      onEnter: (els) => gsap.fromTo(els, { opacity: 0, scale: 0.97 }, { opacity: 1, scale: 1, duration: MOTION.dur.slow, clearProps: "opacity,transform" }),
      onComplete: () => root?.classList.remove("is-flipping"),
    });
  };
}

/** Starts the motion system; returns helpers for UI code, or null when motion is off or GSAP failed. */
export async function initMotion() {
  if (matchMedia(STILL).matches) return null;
  let lib;
  try { lib = await loadGsap(); } catch { return null; }
  const { gsap, ScrollTrigger, Flip } = lib;
  gsap.defaults({ ease: MOTION.ease, duration: MOTION.dur.slow });
  ScrollTrigger.config({ ignoreMobileResize: true });

  const mm = gsap.matchMedia();
  mm.add({ wide: WIDE, narrow: NARROW, still: STILL }, (ctx) => {
    const { wide, still } = ctx.conditions;
    if (still) return;
    entrances(gsap, ScrollTrigger, wide ? MOTION.rise.wide : MOTION.rise.narrow);
    pictures(gsap);
    const undoCount = counters(gsap);
    sequences(gsap, wide);
    if (wide) heroDepth(gsap);
    return undoCount;
  });
  followLayout(ScrollTrigger);

  const still = () => matchMedia(STILL).matches;
  const accordion = makeAccordion(gsap);
  const flip = makeFlip(gsap, Flip);
  return {
    accordion: (d, open) => (still() ? null : accordion(d, open)),
    flip: (targets, change, opts) => (still() ? change() : flip(targets, change, opts)),
  };
}
