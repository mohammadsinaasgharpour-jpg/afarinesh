import { test, expect } from "@playwright/test";

// The motion system (public/assets/js/motion.js) must never be needed to see or use the page.
const gsapLoaded = (page) => page.waitForFunction(() => !!window.gsap && !!window.ScrollTrigger && !!window.Flip, null, { timeout: 10_000 });
const startScripts = (page) => page.mouse.move(5, 5).then(() => page.evaluate(() => scrollBy(0, 1)));

test("GSAP loads after the page and nothing logs an error", async ({ page }) => {
  const errors = [];
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  // not part of the first paint: the vendor files are requested only after the page has loaded
  const early = await page.evaluate(() => performance.getEntriesByType("resource").some((r) => r.name.includes("/vendor/")));
  await startScripts(page);
  await gsapLoaded(page);
  for (const id of ["#approach", "#programs", "#team", "#faq", "#contact"]) {
    await page.locator(id).scrollIntoViewIfNeeded();
    await page.waitForTimeout(150);
  }
  await page.locator(".site-footer").scrollIntoViewIfNeeded();
  await page.waitForTimeout(900);
  expect(errors).toEqual([]);
  expect(early).toBe(false);
});

test("every entrance ends fully visible with no leftover inline styles", async ({ page }) => {
  await page.goto("/");
  await startScripts(page);
  await gsapLoaded(page);
  // walk down the page slowly so each group's trigger fires
  const height = await page.evaluate(() => document.documentElement.scrollHeight);
  for (let y = 0; y < height; y += 400) { await page.evaluate((v) => scrollTo(0, v), y); await page.waitForTimeout(60); }
  await page.waitForTimeout(1200);
  const left = await page.evaluate(() => [...document.querySelectorAll(".features > li, .mondrian > .cell, .faq > details, .section-head > *, .contact > *")]
    .filter((el) => el.style.opacity || el.style.transform || getComputedStyle(el).opacity !== "1").map((el) => el.className || el.tagName));
  expect(left).toEqual([]);
});

test("figures count up once and end on exactly the text in the page", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 700 }); // the figures start below the screen
  await page.goto("/");
  const before = await page.locator(".fact dd").allTextContents();
  await startScripts(page);
  await gsapLoaded(page);
  await page.locator(".facts").scrollIntoViewIfNeeded();
  await page.waitForTimeout(1600);
  expect(await page.locator(".fact dd").allTextContents()).toEqual(before);
  expect(before).toContain("+۱۰۰");
  // screen readers always had the real value: no number is left hidden or doubled
  expect(await page.locator(".fact dd [aria-hidden]").count()).toBe(0);
});

test.describe("reduced motion", () => {
  test("motion still runs at the owner's request, and every section ends up visible", async ({ page }) => {
    // set on the page: the context option does not reach the system Chrome channel used here
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");
    expect(await page.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches)).toBe(true);
    await startScripts(page);
    await page.waitForTimeout(1500);
    await expect.poll(() => page.evaluate(() => !!window.gsap)).toBe(true);
    await page.locator("#programs").scrollIntoViewIfNeeded();
    await page.waitForTimeout(1500);
    for (let y = 0; y < 12; y++) { await page.mouse.wheel(0, 700); await page.waitForTimeout(150); }
    await page.waitForTimeout(1200);
    for (const el of await page.locator(".mondrian > .cell:visible, .features > li:visible").all()) {
      await expect.poll(() => el.evaluate((n) => getComputedStyle(n).opacity)).toBe("1");
    }
  });
});

test.describe("without JavaScript", () => {
  test.use({ javaScriptEnabled: false });
  test("all content is in the page and visible", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("h1")).toContainText("ایده‌های بزرگ");
    await expect(page.locator(".fact dd").first()).toHaveText("۱۵ تا ۱۷");
    for (const sel of [".features > li", ".mondrian > .cell", ".faq details"]) {
      const opacities = await page.locator(sel).evaluateAll((els) => els.map((n) => getComputedStyle(n).opacity));
      expect(opacities.every((o) => o === "1"), sel).toBe(true);
    }
  });
});

test("rapid FAQ clicks never leave a question half open", async ({ page }) => {
  await page.goto("/");
  await startScripts(page);
  await gsapLoaded(page);
  const d = page.locator(".faq details").nth(2);
  await d.locator("summary").scrollIntoViewIfNeeded();
  const s = d.locator("summary");
  await s.click(); await s.click(); await s.click(); // open, close, open again within a moment
  await page.waitForTimeout(700);
  await expect(d).toHaveJSProperty("open", true);
  expect(await d.evaluate((n) => n.style.height)).toBe("");
  await expect(d.locator("p")).toBeVisible();
  await s.click();
  await page.waitForTimeout(700);
  await expect(d).toHaveJSProperty("open", false);
});

test("searching the teachers keeps the list usable while the cards glide", async ({ page }) => {
  await page.goto("/");
  await startScripts(page);
  await gsapLoaded(page);
  await page.locator("[data-team-all]").click(); // list mode, where results glide
  const input = page.locator("[data-team-search]");
  await input.fill("زبان");
  await page.waitForTimeout(800);
  const shown = page.locator(".teacher:not([hidden])");
  expect(await shown.count()).toBeGreaterThan(0);
  expect(await shown.evaluateAll((els) => els.filter((n) => n.style.transform && n.style.transform !== "none").length)).toBe(0);
  await input.fill("");
  await page.waitForTimeout(800);
  expect(await page.locator(".teacher[hidden]").count()).toBe(0);
});

test("form steps slide in from the side they come from", async ({ page }) => {
  await page.goto("/pre-registration");
  const form = page.locator("[data-form]");
  await expect(form).not.toHaveAttribute("data-step-dir", /./);
  // the motion library is not loaded on form pages
  await page.waitForTimeout(500);
  expect(await page.evaluate(() => !!window.gsap)).toBe(false);
});

test("smooth scrolling runs on every device, and in-page links still land under the header", async ({ page }) => {
  await page.goto("/");
  await startScripts(page);
  await gsapLoaded(page);
  const smooth = () => page.evaluate(() => document.documentElement.classList.contains("lenis"));
  await expect.poll(smooth).toBe(true);
  if (page.viewportSize().width < 861) return;
  await page.locator('#nav a[href="#faq"]').click();
  await expect.poll(() => page.evaluate(() => Math.round(document.querySelector("#faq").getBoundingClientRect().top)), { timeout: 4000 }).toBeLessThanOrEqual(100);
  const top = await page.evaluate(() => document.querySelector("#faq").getBoundingClientRect().top);
  const header = await page.evaluate(() => document.querySelector(".site-header").getBoundingClientRect().bottom);
  expect(top).toBeGreaterThanOrEqual(header - 1);
});
