// The English page: header, menu, theme switch and back-to-top, shared with the Persian site.
import { initChrome } from "./common.js";

initChrome();
// section titles show their underline at once (the Persian page draws it as each section scrolls in)
document.querySelectorAll(".section-head").forEach((h) => h.classList.add("is-seen"));
