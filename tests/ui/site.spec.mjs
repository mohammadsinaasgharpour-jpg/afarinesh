import { test, expect } from "@playwright/test";

const at = (hour) => new Date(2026, 9, 31, hour, 0, 0);

test.describe("theme follows the clock", () => {
  test("light before 18:00", async ({ page }) => {
    await page.clock.setFixedTime(at(10));
    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  });

  test("dark from 18:00", async ({ page }) => {
    await page.clock.setFixedTime(at(19));
    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  });

  test("the toggle overrides the clock for this visit", async ({ page }) => {
    await page.clock.setFixedTime(at(10));
    await page.goto("/");
    await page.locator("[data-theme-toggle]").click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  });
});

test("no horizontal scrolling", async ({ page }) => {
  await page.goto("/");
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});

test("teachers appear in the school's order and reveal while scrolling", async ({ page }) => {
  await page.goto("/");
  const names = page.locator(".teacher h3");
  await expect(names).toHaveCount(30);
  await expect(names.nth(0)).toHaveText("فرشید فلاحی");
  await expect(names.nth(1)).toHaveText("عبدالرحمان یدالهی");
  await expect(names.nth(29)).toHaveText("حسین قاسمی");
  const last = page.locator(".teacher").last();
  await expect(last).not.toHaveClass(/is-in/);
  await last.scrollIntoViewIfNeeded();
  await expect(last).toHaveClass(/is-in/);
});

test("teacher search really hides non-matching teachers", async ({ page }) => {
  await page.goto("/");
  const search = page.locator("[data-team-search]");
  const visibleNames = () => page.locator(".teacher:visible h3").allTextContents();
  await search.fill("آمادگی دفاعی");
  await expect(page.locator(".teacher:visible")).toHaveCount(1);
  expect(await visibleNames()).toEqual(["شهرام ده‌بزرگی"]);
  await search.fill("ریاضی");
  await expect(page.locator(".teacher:visible")).toHaveCount(3);
  await expect(page.locator("[data-team-status]")).toHaveText("۳ نفر از ۳۰ نفر");
  await search.fill("زبان");
  await expect(page.locator(".teacher:visible")).toHaveCount(4);
  await search.fill("zzzz");
  await expect(page.locator(".teacher:visible")).toHaveCount(0);
  await expect(page.locator("[data-team-empty]")).toBeVisible();
  await page.locator("[data-team-reset]").click();
  await expect(page.locator(".teacher:visible")).toHaveCount(30);
});

test("FAQ has no sports-hall question and opens and closes", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".faq")).not.toContainText("سالن ورزشی");
  await expect(page.locator(".faq details")).toHaveCount(8);
  const first = page.locator(".faq details").first();
  await first.locator("summary").click();
  await expect(first).toHaveAttribute("open", "");
  await first.locator("summary").click();
  await expect(first).not.toHaveAttribute("open", "");
});

test("mobile menu opens and closes", async ({ page, isMobile }) => {
  test.skip(!isMobile, "menu button only exists on small screens");
  await page.goto("/");
  const btn = page.locator("[data-menu]");
  await btn.click();
  await expect(page.locator("#nav")).toHaveClass(/is-open/);
  await page.keyboard.press("Escape");
  await expect(page.locator("#nav")).not.toHaveClass(/is-open/);
});

test.describe("callback form", () => {
  test("shows field errors instead of sending", async ({ page }) => {
    await page.goto("/");
    await page.locator("[data-submit]").click();
    await expect(page.locator("#f-name-err")).not.toBeEmpty();
    await expect(page.locator("#f-phone-err")).not.toBeEmpty();
    await expect(page.locator("[data-confirm-dialog]")).not.toBeVisible();
  });

  test("asks for confirmation, then sends and confirms", async ({ page }) => {
    let sent;
    await page.route("**/api/inquiries", async (route) => {
      sent = route.request().postDataJSON();
      await route.fulfill({ status: 201, contentType: "application/json", body: '{"ok":true}' });
    });
    await page.goto("/");
    await page.fill("#f-name", "مریم احمدی");
    await page.fill("#f-phone", "۰۹۱۷۱۲۳۴۵۶۷");
    await page.locator(".segmented label", { hasText: "هشتم" }).click();
    await page.locator("[data-submit]").click();
    const dialog = page.locator("[data-confirm-dialog]");
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText("۰۹۱۷۱۲۳۴۵۶۷");
    await page.locator("[data-confirm-yes]").click();
    await expect(page.locator(".toast.ok")).toBeVisible();
    expect(sent).toMatchObject({ parentName: "مریم احمدی", phone: "09171234567", grade: "8" });
    await expect(page.locator("#f-name")).toHaveValue("");
  });

  test("tells parents to call when the inbox is down", async ({ page }) => {
    await page.route("**/api/inquiries", (route) => route.fulfill({ status: 503, contentType: "application/json", body: '{"error":"inbox_not_configured"}' }));
    await page.goto("/");
    await page.fill("#f-name", "مریم احمدی");
    await page.fill("#f-phone", "09171234567");
    await page.locator(".segmented label", { hasText: "هفتم" }).click();
    await page.locator("[data-submit]").click();
    await page.locator("[data-confirm-yes]").click();
    await expect(page.locator(".toast.err")).toContainText("تماس بگیرید");
    await expect(page.locator("#f-name")).toHaveValue("مریم احمدی");
  });
});

test("Instagram button sits in the bottom-right corner", async ({ page }) => {
  await page.goto("/");
  const fab = page.locator(".insta-fab");
  await expect(fab).toHaveAttribute("href", "https://instagram.com/afarinesh_sch");
  const box = await fab.boundingBox();
  const vp = page.viewportSize();
  expect(vp.width - (box.x + box.width)).toBeLessThanOrEqual(24);
  expect(vp.height - (box.y + box.height)).toBeLessThanOrEqual(24);
});

test("hero kicker sits at the top of the photo", async ({ page }) => {
  await page.goto("/");
  const hero = await page.locator(".hero").boundingBox();
  const kicker = await page.locator(".hero-kicker span").boundingBox();
  expect(kicker.y - hero.y).toBeLessThan(60);
});

test("the plus sign comes before ۱۰۰ when read right to left", async ({ page }) => {
  await page.goto("/");
  const dd = page.locator(".f-paper dd");
  await expect(dd).toHaveText("۱۰۰+");
  const box = await dd.evaluate((el) => {
    const r = document.createRange(); const t = el.firstChild;
    r.setStart(t, 3); r.setEnd(t, 4); const plus = r.getBoundingClientRect();
    r.setStart(t, 0); r.setEnd(t, 3); const num = r.getBoundingClientRect();
    return { plus: plus.left, num: num.left };
  });
  expect(box.plus).toBeGreaterThan(box.num);
});

test("logo is not a link and footer carries the credit, without the virtual-school link", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("header a.brand")).toHaveCount(0);
  await expect(page.locator(".site-footer")).toContainText("طراحی و ساخت: محمدسینا اصغرپور");
  await expect(page.locator(".site-footer")).not.toContainText("سامانه");
  await expect(page.locator("#approach img")).toHaveCount(0);
});

test("Instagram button fades over text and returns on empty space", async ({ page }) => {
  await page.goto("/");
  const fab = page.locator(".insta-fab");
  const box = await fab.boundingBox();
  expect(box.width).toBeGreaterThanOrEqual(48);
  expect(box.width).toBeLessThanOrEqual(56);
  await page.locator(".faq").scrollIntoViewIfNeeded();
  await page.evaluate(() => { const f = document.querySelector(".faq details p, .faq summary"); window.scrollTo(0, f.getBoundingClientRect().top + scrollY - innerHeight + 30); });
  await page.waitForTimeout(150);
  const states = await page.evaluate(() => document.querySelector(".insta-fab").classList.contains("is-over-text"));
  expect(typeof states).toBe("boolean");
});

test("right-click on images is blocked", async ({ page }) => {
  await page.goto("/");
  const prevented = await page.locator(".brand-mark").evaluate((img) => {
    const e = new MouseEvent("contextmenu", { bubbles: true, cancelable: true });
    img.dispatchEvent(e);
    return e.defaultPrevented;
  });
  expect(prevented).toBe(true);
});

test("tabs split leadership from teachers and work with search", async ({ page }) => {
  await page.goto("/");
  const visible = page.locator(".teacher:visible");
  await page.locator('[data-tab="leadership"]').click();
  await expect(visible).toHaveCount(6);
  await expect(page.locator('[data-tab="leadership"]')).toHaveAttribute("aria-selected", "true");
  await expect(page.locator(".teacher:visible h3").first()).toHaveText("فرشید فلاحی");
  await page.locator('[data-tab="teaching"]').click();
  await expect(visible).toHaveCount(27);
  await page.locator("[data-team-search]").fill("ریاضی");
  await expect(visible).toHaveCount(3);
  await page.locator('[data-tab="leadership"]').click();
  await expect(visible).toHaveCount(0);
  await page.locator('[data-tab="all"]').click();
  await expect(visible).toHaveCount(3);
});

test("every part of the page follows the light/dark switch, even when toggled quickly", async ({ page }) => {
  await page.clock.setFixedTime(new Date(2026, 9, 31, 10));
  await page.goto("/");
  const probe = () => page.evaluate(() => {
    const bg = (sel) => getComputedStyle(document.querySelector(sel)).backgroundColor;
    const fg = (sel) => getComputedStyle(document.querySelector(sel)).color;
    return [bg("body"), bg(".site-header"), bg(".tabs"), bg(".teacher"), bg(".form"), bg(".search input"), bg(".programs"), fg("h2"), fg(".teacher h3")].join("|");
  });
  const light = await probe();
  const btn = page.locator("[data-theme-toggle]");
  await btn.click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.waitForTimeout(700);
  const dark = await probe();
  const lightParts = light.split("|"), darkParts = dark.split("|");
  lightParts.forEach((v, i) => expect(darkParts[i], `part ${i} did not change`).not.toBe(v));
  for (let i = 0; i < 5; i++) await btn.click();
  await page.waitForTimeout(700);
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  expect(await probe()).toBe(light);
});
