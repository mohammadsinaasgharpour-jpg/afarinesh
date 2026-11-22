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
    await page.locator("[data-theme-toggle]:visible").first().click();
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

test("teachers come one at a time, in the school's order, and changing teacher never moves the page", async ({ page }) => {
  await page.goto("/");
  const names = page.locator(".teacher .teacher-name");
  await expect(names).toHaveCount(29);
  await expect(names.nth(0)).toHaveText("فرشید فلاحی");
  await expect(names.nth(28)).toHaveText("حسین قاسمی");
  await expect(page.locator("[data-team]")).not.toContainText("قزلباش");
  await expect(page.locator(".teacher h3")).toHaveCount(0);
  const track = page.locator("[data-team-track]");
  // the section is set up when the visitor starts scrolling
  await page.evaluate(() => document.querySelector("#team").scrollIntoView({ behavior: "instant" }));
  await expect(track).toHaveClass(/is-swipe/);
  // nothing is pinned: the section is about one screen tall, not a long scroll
  expect(await track.evaluate((el) => el.offsetHeight)).toBeLessThan(page.viewportSize().height * 2);
  await page.evaluate(() => document.querySelector("#team").scrollIntoView({ behavior: "instant" }));
  await page.waitForTimeout(500); // any smooth scrolling still in motion settles
  const current = page.locator(".teacher.is-current .teacher-name");
  await expect(current).toHaveText("فرشید فلاحی");
  await expect(page.locator(".teacher.is-current")).toHaveCount(1);
  // every card shares one frame as tall as the tallest, so the row height and the page position stay put
  const where = () => page.evaluate(() => [Math.round(scrollY), Math.round(document.querySelector("[data-team]").getBoundingClientRect().height)]);
  const before = await where();
  for (let i = 0; i < 4; i++) await page.evaluate(() => document.querySelector("[data-team-next]").click());
  await expect(current).toHaveText("مجید میرزایی");
  await expect(page.locator("[data-team-now]")).toHaveText("۵");
  expect(await where()).toEqual(before);
  // with the focus in the section, the left arrow is next and the right arrow previous (right to left)
  await page.locator("[data-team-next]").focus();
  await page.keyboard.press("ArrowLeft");
  await expect(current).toHaveText("کریم کشاورز");
  await page.keyboard.press("ArrowRight");
  await expect(current).toHaveText("مجید میرزایی");
  await expect(page.locator(".team-strip")).toHaveCount(0);
  await page.locator("[data-team-all]").click();
  await expect(track).not.toHaveClass(/is-swipe/);
  await expect(page.locator(".teacher")).toHaveCount(29);
});

test("teacher search really hides non-matching teachers", async ({ page }) => {
  await page.goto("/");
  const search = page.locator("[data-team-search]");
  const visibleNames = () => page.locator(".teacher:visible .teacher-name").allTextContents();
  await search.fill("آمادگی دفاعی");
  await expect(page.locator("[data-team-track]")).not.toHaveClass(/is-swipe/);
  await expect(page.locator(".teacher:visible")).toHaveCount(1);
  expect(await visibleNames()).toEqual(["شهرام ده‌بزرگی"]);
  await search.fill("ریاضی");
  await expect(page.locator(".teacher:visible")).toHaveCount(3);
  await expect(page.locator("[data-team-status]")).toHaveText("۳ نفر از ۲۹ نفر");
  await search.fill("زبان");
  await expect(page.locator(".teacher:visible")).toHaveCount(4);
  await search.fill("zzzz");
  await expect(page.locator(".teacher:visible")).toHaveCount(0);
  await expect(page.locator("[data-team-empty]")).toBeVisible();
  await page.locator("[data-team-reset]").click();
  // with the search cleared the section goes back to one teacher at a time
  await expect(page.locator("[data-team-track]")).toHaveClass(/is-swipe/);
  await expect(page.locator(".teacher.is-current")).toHaveCount(1);
});

test("phones: teachers are swiped one at a time, starting with the founder, each card whole", async ({ page, isMobile }) => {
  test.skip(!isMobile, "swipe mode is for phones");
  await page.goto("/");
  // the page opens at the top, not inside the teachers section
  expect(await page.evaluate(() => scrollY)).toBe(0);
  const track = page.locator("[data-team-track]");
  await track.scrollIntoViewIfNeeded();
  await expect(track).toHaveClass(/is-swipe/);
  const current = page.locator(".teacher.is-current .teacher-name");
  await expect(current).toHaveText("فرشید فلاحی");
  await expect(page.locator("[data-team-now]")).toHaveText("۱");
  await expect(page.locator(".swipe-hint")).toBeVisible();
  // no empty space under a short card: only the 12px kept for the card's shadow under the curtain
  const gap = () => page.evaluate(() => document.querySelector("[data-team]").getBoundingClientRect().bottom - document.querySelector(".teacher.is-current").getBoundingClientRect().bottom);
  await expect.poll(gap).toBeLessThan(16);
  // the contact cards and the map sit inside the screen (a long e-mail address once pushed them off)
  const sticks = await page.evaluate(() => [...document.querySelectorAll(".contact > *")].map((el) => { const r = el.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth; }));
  expect(sticks.every(Boolean)).toBe(true);
  await page.locator("[data-team-next]").click();
  await expect(current).toHaveText("عبدالرحمان یدالهی");
  await page.locator("[data-team-next]").click();
  await expect(current).toHaveText("سینا عباسلو");
  // the card on screen is the one counted, its photo and name belong together, and it fits the screen width
  await page.waitForTimeout(500); // the new card slides in
  const fits = await page.evaluate(() => {
    const row = document.querySelector("[data-team]").getBoundingClientRect();
    const c = document.querySelector(".teacher.is-current");
    const r = c.getBoundingClientRect();
    return { inside: r.left >= row.left - 2 && r.right <= row.right + 2, alt: c.querySelector("img").alt };
  });
  expect(fits.inside).toBe(true);
  expect(fits.alt).toContain("سینا عباسلو");
  await page.locator("[data-team-prev]").click();
  await expect(current).toHaveText("عبدالرحمان یدالهی");
  // the page itself never scrolls sideways
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);
});

test("FAQ has no sports-hall question and opens and closes", async ({ page }) => {
  // the colours below are the daytime theme's; after dark in Iran the site turns dark by itself
  await page.addInitScript(() => sessionStorage.setItem("theme", "light"));
  await page.goto("/");
  await expect(page.locator(".faq")).not.toContainText("سالن ورزشی");
  await expect(page.locator(".faq details")).toHaveCount(9);
  const first = page.locator(".faq details").first();
  await first.locator("summary").click();
  await expect(first).toHaveAttribute("open", "");
  await first.locator("summary").click();
  await expect(first).not.toHaveAttribute("open", "");
  // one answer at a time: opening the next question folds the first, without moving the tapped question,
  // and the folding one turns back to yellow while it folds; an open one is blue
  const second = page.locator(".faq details").nth(1);
  await first.locator("summary").click();
  await expect(first).toHaveAttribute("open", "");
  await page.mouse.move(0, 0);
  await second.locator("summary").click();
  await expect(first).not.toHaveClass(/is-open/);
  await expect(second).toHaveAttribute("open", "");
  await expect(first).not.toHaveAttribute("open", "");
  await expect(second.locator("summary")).toBeInViewport();
  await expect.poll(() => first.locator("summary").evaluate((el) => getComputedStyle(el).backgroundColor)).toBe("rgb(242, 165, 22)");
  await expect.poll(() => second.locator("summary").evaluate((el) => getComputedStyle(el).backgroundColor)).toBe("rgb(22, 120, 156)");
});

test("elective classes: sport lists only futsal and chess", async ({ page }) => {
  await page.goto("/");
  const sport = page.locator(".c-sport .chips li");
  await expect(sport).toHaveText(["فوتسال", "شطرنج"]);
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
  const next = (page) => page.locator("#inquiry [data-step-next]").click();
  const fill = async (page, { name = "مریم احمدی", phone = "۰۹۱۷۱۲۳۴۵۶۷", grade = "هشتم" } = {}) => {
    await page.fill("#f-name", name);
    await next(page);
    await page.fill("#f-phone", phone);
    await next(page);
    await page.locator("#inquiry .segmented label", { hasText: grade }).click();
  };

  test("shows one step at a time and an error only after pressing next", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("#f-name")).toBeVisible();
    await expect(page.locator("#f-phone")).toBeHidden();
    await page.fill("#f-name", "Maryam");
    await page.locator("#f-name").blur();
    await expect(page.locator("#inquiry .step.is-active [data-error]")).toBeEmpty();
    await next(page);
    await expect(page.locator("#inquiry .step.is-active [data-error]")).toContainText("فارسی");
    await expect(page.locator("#f-phone")).toBeHidden();
    await page.fill("#f-name", "مریم احمدی");
    await expect(page.locator("#inquiry .step.is-active [data-error]")).toBeEmpty();
    await next(page);
    await expect(page.locator("#f-phone")).toBeVisible();
    await expect(page.locator("#inquiry [data-step-label]")).toHaveText("مرحله‌ی ۲ از ۳");
    await page.fill("#f-phone", "0911111111");
    await next(page);
    await expect(page.locator("#inquiry .step.is-active [data-error]")).not.toBeEmpty();
    await expect(page.locator("[data-confirm-dialog]")).not.toBeVisible();
  });

  test("asks for confirmation, then sends and confirms", async ({ page }) => {
    let sent;
    await page.route("**/api/inquiries", async (route) => {
      sent = route.request().postDataJSON();
      await route.fulfill({ status: 201, contentType: "application/json", body: '{"ok":true}' });
    });
    await page.goto("/");
    await fill(page);
    await page.locator("#inquiry [data-submit]").click();
    const dialog = page.locator("[data-confirm-dialog]");
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText("۰۹۱۷۱۲۳۴۵۶۷");
    await page.locator("[data-confirm-yes]").click();
    await expect(page.locator(".toast.ok")).toBeVisible();
    expect(sent).toMatchObject({ parentName: "مریم احمدی", phone: "09171234567", grade: "8" });
    await expect(page.locator("#f-name")).toHaveValue("");
    await expect(page.locator("#f-name")).toBeVisible();
  });

  test("tells parents to call when the inbox is down", async ({ page }) => {
    await page.route("**/api/inquiries", (route) => route.fulfill({ status: 503, contentType: "application/json", body: '{"error":"inbox_not_configured"}' }));
    await page.goto("/");
    await fill(page, { phone: "09171234567", grade: "هفتم" });
    await page.locator("#inquiry [data-submit]").click();
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

test("the hero names the school, its level, city and founding year", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("h1")).toContainText("دبیرستان غیردولتی آفرینش شیراز");
  await expect(page.locator(".hero-lede")).toContainText("دوره اول متوسطه در شیراز، از سال ۱۳۸۷");
});

test("touch targets in contact and footer are at least 44px tall", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/");
  const heights = await page.locator(".contact-list a, .site-footer a").evaluateAll((els) => els.map((el) => el.getBoundingClientRect().height));
  for (const h of heights) expect(h).toBeGreaterThanOrEqual(44);
});

test("the student count reads +۱۰۰, plus sign on the left", async ({ page }) => {
  await page.goto("/");
  const dd = page.locator(".f-paper dd");
  await expect(dd).toHaveText("+۱۰۰");
  const box = await dd.evaluate((el) => {
    const r = document.createRange(); const t = el.firstChild;
    r.setStart(t, 0); r.setEnd(t, 1); const plus = r.getBoundingClientRect();
    r.setStart(t, 1); r.setEnd(t, 4); const num = r.getBoundingClientRect();
    return { plus: plus.left, num: num.left };
  });
  expect(box.plus).toBeLessThan(box.num);
});

test("the school name in the header goes back to the top of the home page", async ({ page }) => {
  await page.goto("/#programs");
  await page.evaluate(() => document.querySelector("#faq").scrollIntoView());
  await page.locator("header a.brand").click();
  await expect.poll(() => page.evaluate(() => scrollY)).toBe(0);
  await expect(page).toHaveURL(/\/$/);
  await page.goto("/careers");
  await page.locator("header a.brand").click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.locator(".site-footer")).toContainText("طراحی و ساخت: محمدسینا اصغرپور");
  await expect(page.locator(".site-footer")).not.toContainText("سامانه");
});

test("Instagram button fades while over text and stays on top", async ({ page }) => {
  await page.goto("/");
  const fab = page.locator(".insta-fab");
  const box = await fab.boundingBox();
  // large enough to find and tap at once (it was too small on phones and tablets), still a corner button
  expect(box.width).toBeGreaterThanOrEqual(54);
  expect(box.width).toBeLessThanOrEqual(60);
  for (const y of [0, 600, 1400, 2600]) {
    await page.evaluate((top) => scrollTo(0, top), y);
    await page.waitForTimeout(120);
    const over = await fab.evaluate((el) => el.classList.contains("is-over-text"));
    expect(await fab.evaluate((el) => getComputedStyle(el).zIndex)).toBe("30");
    await expect.poll(() => fab.evaluate((el) => Number(getComputedStyle(el).opacity))).toBeCloseTo(over ? 0.62 : 1, 1);
  }
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


test("every part of the page follows the light/dark switch, even when toggled quickly", async ({ page }) => {
  await page.clock.setFixedTime(new Date(2026, 9, 31, 10));
  await page.goto("/");
  const probe = () => page.evaluate(() => {
    const bg = (sel) => getComputedStyle(document.querySelector(sel)).backgroundColor;
    const fg = (sel) => getComputedStyle(document.querySelector(sel)).color;
    return [bg("body"), bg(".site-header"), bg(".teacher"), bg(".form"), bg(".search input"), bg(".programs"), fg("h2"), fg(".teacher-name")].join("|");
  });
  const light = await probe();
  const btn = page.locator("[data-theme-toggle]:visible").first();
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

test("pre-registration buttons lead to our own page for 1406-1407", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator('a[href*="porsline"]')).toHaveCount(0);
  await expect(page.locator(".hero .btn-cta")).toContainText("۱۴۰۶-۱۴۰۷");
  expect(await page.locator(".hero .btn-cta").evaluate((el) => getComputedStyle(el).backgroundColor)).toBe("rgb(198, 56, 44)");
  await page.locator(".hero .btn-cta").click();
  await expect(page).toHaveURL(/\/pre-registration$/);
  await expect(page.locator("h1")).toContainText("۱۴۰۶-۱۴۰۷");
});

test("pre-registration goes step by step, validates each step, reviews and sends", async ({ page }) => {
  let sent;
  await page.route("**/api/pre-registration", async (route) => {
    sent = route.request().postDataJSON();
    await route.fulfill({ status: 201, contentType: "application/json", body: '{"ok":true,"id":"abcdef12-0000"}' });
  });
  await page.goto("/pre-registration");
  await expect(page.locator(".conditions")).toContainText("کارنامه‌ی پایه‌ی هشتم");
  const next = () => page.locator("[data-step-next]").click();
  const error = page.locator(".step.is-active [data-error]").first();
  // lists open in a sheet drawn by the site, not the phone's own picker
  const pick = async (trigger, option) => {
    await trigger.click();
    const sheet = page.locator(".sheet[open]");
    await expect(sheet).toBeVisible();
    await sheet.getByRole("option", { name: option, exact: true }).click();
    await expect(sheet).toBeHidden();
  };
  const picker = (sel) => page.locator(`${sel} + .picker`);
  await expect(page.locator("[data-step-label]")).toHaveText("مرحله‌ی ۱ از ۱۰");
  await expect(page.locator("#p-nationalId")).toBeHidden();
  await next();
  await expect(error).not.toBeEmpty();
  await page.fill("#p-fullName", "آرین رضایی");
  await next();
  await page.fill("#p-nationalId", "1234567890");
  await next();
  await expect(error).toContainText("کد ملی");
  await page.fill("#p-nationalId", "۰۴۹۹۳۷۰۸۹۹");
  await next();
  await next();
  await expect(error).toContainText("روز، ماه و سال");
  await pick(picker('[data-date-part="month"]'), "مهر");
  await pick(picker('[data-date-part="year"]'), "۱۳۹۳");
  // Mehr has 30 days: day 31 cannot be picked
  await picker('[data-date-part="day"]').click();
  await expect(page.locator(".sheet[open]").getByRole("option", { name: "۳۱", exact: true })).toBeDisabled();
  await page.locator(".sheet[open]").getByRole("option", { name: "۲۳", exact: true }).click();
  await next();
  await page.fill("#p-studentMobile", "09171234567");
  await next();
  await page.fill("#p-address", "Shiraz, Eram");
  await next();
  await expect(error).toContainText("فارسی");
  await page.fill("#p-address", "بلوار ارم، کوچه ۵، پلاک ۱۲");
  await next();
  await expect(error).toContainText("شهر");
  await page.fill("#p-address", "شیراز، بلوار ارم، کوچه ۵، پلاک ۱۲");
  await next();
  await page.fill("#p-motherName", "مریم");
  await page.fill("#p-motherMobile", "09171234567");
  await next();
  await expect(page.locator("#p-motherName ~ [data-error]")).toContainText("نام خانوادگی");
  await expect(page.locator("#p-motherMobile ~ [data-error]")).toContainText("دانش‌آموز");
  await page.fill("#p-motherName", "مریم احمدی");
  await pick(picker("#p-motherEducation"), "لیسانس");
  await page.fill("#p-motherMobile", "09171111112");
  await next();
  await page.fill("#p-fatherName", "علی رضایی");
  await page.fill("#p-fatherMobile", "۰۹۱۷۲۲۲۲۲۲۳");
  await next();
  // grade first; it decides whether a number or a descriptive grade is asked for
  await page.locator(".step.is-active .segmented label", { hasText: "هفتم" }).click();
  await expect(page.locator("#p-gpa")).toBeHidden();
  await expect(picker("#p-gpaDescriptive")).toBeVisible();
  await page.locator(".step.is-active .segmented label", { hasText: "هشتم" }).click();
  await expect(page.locator("[data-gpa-label]")).toHaveText("معدل کارنامه‌ی پایه‌ی هفتم");
  await page.fill("#p-currentSchool", "دبیرستان آفرینش");
  await page.fill("#p-gpa", "۱۹٫۵");
  await next();
  await expect(page.locator("#p-currentSchool ~ [data-error]")).toContainText("آفرینش");
  await page.fill("#p-currentSchool", "دبیرستان شهید دستغیب");
  await next();
  await page.locator(".step.is-active .segmented label", { hasText: "عالی" }).click();
  await next();
  await page.locator('.check input[name="consent"]').check();
  await page.locator("[data-submit]").click();
  const dialog = page.locator("[data-confirm-dialog]");
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("۰۴۹۹۳۷۰۸۹۹");
  await page.locator("[data-confirm-yes]").click();
  await expect(page.locator(".toast.ok")).toContainText("abcdef12");
  expect(sent).toMatchObject({ nationalId: "0499370899", birthDate: "1393/07/23", motherName: "مریم احمدی", fatherMobile: "09172222223", gpa: "19.5", grade: "8", motherEducation: "لیسانس", consent: true });
});

test("careers page sends a job application", async ({ page }) => {
  let sent;
  await page.route("**/api/careers", async (route) => {
    sent = route.request().postDataJSON();
    await route.fulfill({ status: 201, contentType: "application/json", body: '{"ok":true,"id":"12345678"}' });
  });
  await page.goto("/careers");
  const next = () => page.locator("[data-step-next]").click();
  await page.fill("#c-fullName", "مریم احمدی");
  await next();
  await page.fill("#c-field", "ریاضی محض");
  await page.locator(".segmented label", { hasText: "کارشناسی ارشد" }).click();
  await next();
  await page.locator(".segmented label", { hasText: "بالای ۵ سال" }).click();
  await next();
  await page.fill("#c-phone", "07132293194");
  await page.locator('.check input[name="consent"]').check();
  await page.locator("[data-submit]").click();
  await page.locator("[data-confirm-yes]").click();
  await expect(page.locator(".toast.ok")).toBeVisible();
  expect(sent).toMatchObject({ degree: "کارشناسی ارشد", experience: "بالای ۵ سال", phone: "07132293194" });
});

test("the contact section puts the form first on wide screens and links the map to Neshan", async ({ page }) => {
  await page.goto("/");
  const top = (sel) => page.locator(sel).evaluate((el) => el.getBoundingClientRect().top + scrollY);
  const wide = page.viewportSize().width > 860;
  if (wide) expect(await top("#inquiry")).toBeLessThan(await top(".contact-info"));
  else expect(await top(".contact-info")).toBeLessThan(await top("#inquiry"));
  await expect(page.locator(".map-card a")).toHaveAttribute("href", "https://nshn.ir/de_bguoSPFQe8V");
  await expect(page.locator(".contact-list")).toContainText("چنچنه");
  await expect(page.locator('a[href*="google.com/maps"], a[href*="maps.google"]')).toHaveCount(0);
});

test("the privacy page exists and every form links to it", async ({ page }) => {
  await page.goto("/privacy");
  await expect(page.locator("h1")).toContainText("حریم خصوصی");
  await expect(page.locator("main")).toContainText("۱۲ ماه");
  for (const path of ["/", "/pre-registration", "/careers"]) {
    await page.goto(path);
    await expect(page.locator('form a[href^="/privacy"]').first()).toBeAttached();
  }
});

test("subpages share the home page's header, theme and footer", async ({ page }) => {
  await page.clock.setFixedTime(new Date(2026, 10, 2, 20));
  await page.goto("/careers");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.locator('#nav a[href="/#team"]')).toHaveCount(1);
  await expect(page.locator(".site-footer")).toContainText("کتابخانه");
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.reload();
  expect(errors).toEqual([]);
});

test("links to the school's numbers open the contact card", async ({ page }) => {
  await page.goto("/pre-registration");
  await page.locator('a[href="/#school-contacts"]').click();
  await expect(page).toHaveURL(/#school-contacts$/);
  await expect(page.locator("#school-contacts")).toBeInViewport();
  await expect(page.locator("#school-contacts")).toContainText("071 3229 3194");
});

test("the share block carries a description, not just the address", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("[data-share-text]")).toContainText("پیش‌ثبت‌نام");
  const tg = await page.locator('[data-share="tg"]').getAttribute("href");
  expect(decodeURIComponent(tg)).toContain("کلاس‌های ۱۵ تا ۱۷ نفره");
  await expect(page.locator(".credit a")).toHaveCount(0);
});

test("the menu's contact link lands on the school's contact card", async ({ page, isMobile }) => {
  await page.goto("/");
  if (isMobile) await page.locator("[data-menu]").click();
  await page.locator('#nav a[href="#school-contacts"]').click();
  await expect(page.locator("#school-contacts")).toBeInViewport({ ratio: 0.9 });
});

test("phone fields keep digits only, at most 11", async ({ page }) => {
  await page.goto("/pre-registration");
  const f = page.locator("#p-studentMobile");
  await f.evaluate((el) => { el.value = "091552474551234"; el.dispatchEvent(new Event("input", { bubbles: true })); });
  await expect(f).toHaveValue("09155247455");
});

test("a typed address is looked up on the map, as advice only", async ({ page }) => {
  let asked = "";
  await page.route("**/api/geocode", async (route) => {
    asked = JSON.parse(route.request().postData()).address;
    await route.fulfill({ contentType: "application/json", body: JSON.stringify({ ok: true, found: "none" }) });
  });
  await page.goto("/pre-registration");
  const f = page.locator("#p-address");
  await f.evaluate((el) => { el.value = "شیراز، خیابان ناشناخته، کوچه ۵، پلاک ۱۲"; el.dispatchEvent(new Event("input", { bubbles: true })); });
  await expect(page.locator("[data-map-check]")).toContainText("روی نقشه پیدا نشد");
  await expect(page.locator("[data-map-check]")).toContainText("می‌توانید ادامه دهید");
  expect(asked).toContain("خیابان ناشناخته");
});
