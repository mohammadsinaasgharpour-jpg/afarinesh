// A ruler over every public page: each content column (.wrap) sits exactly in the middle of the screen, nothing
// sticks out sideways, and the page never scrolls horizontally, at phone, tablet and desktop widths.
import { test, expect } from "@playwright/test";

const PAGES = ["/", "/en", "/blog/", "/blog/research-based-school", "/pre-registration", "/careers", "/privacy"];
const WIDTHS = [375, 768, 1024, 1280, 1600];

for (const path of PAGES) {
  test(`everything is centred on ${path}`, async ({ page }) => {
    for (const width of WIDTHS) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(path);
      const off = await page.evaluate(() => {
        const vw = document.documentElement.clientWidth;
        const bad = [];
        for (const el of document.querySelectorAll(".wrap")) {
          const r = el.getBoundingClientRect();
          if (!r.width || getComputedStyle(el).display === "none") continue;
          const left = r.left, right = vw - r.right;
          if (Math.abs(left - right) > 1.5) bad.push(`${el.className} left ${Math.round(left)} right ${Math.round(right)}`);
        }
        if (document.documentElement.scrollWidth > vw + 1) bad.push(`page is ${document.documentElement.scrollWidth}px wide`);
        return bad;
      });
      expect(off, `${path} at ${width}px`).toEqual([]);
    }
  });
}
