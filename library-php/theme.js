// Light or dark, the same way as the school's main site: light from 6:00 to 18:00, dark otherwise, and the
// button in the header overrides it for this visit. Loaded without defer in <head> so the page never flashes
// the wrong colours (an inline script would do the same, but the site's CSP allows only files from this site).
"use strict";
(function () {
  var root = document.documentElement;
  var saved = null;
  try { saved = sessionStorage.getItem("theme"); } catch (e) { /* storage blocked: fall back to the clock */ }
  var hour = new Date().getHours();
  root.dataset.theme = saved === "dark" || saved === "light" ? saved : hour >= 18 || hour < 6 ? "dark" : "light";

  function sync(button) {
    var dark = root.dataset.theme === "dark";
    button.setAttribute("aria-label", dark ? "تغییر به حالت روشن" : "تغییر به حالت تاریک");
    button.title = button.getAttribute("aria-label");
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = dark ? "#0d2131" : "#e8edf2";
  }

  document.addEventListener("DOMContentLoaded", function () {
    var button = document.querySelector("[data-theme-toggle]");
    if (!button) return;
    sync(button);
    button.addEventListener("click", function () {
      var next = root.dataset.theme === "dark" ? "light" : "dark";
      try { sessionStorage.setItem("theme", next); } catch (e) { /* this visit only */ }
      // every colour flips in the same frame; where supported the switch is one crossfade
      var apply = function () {
        root.classList.add("theme-switching");
        root.dataset.theme = next;
        void root.offsetHeight;
        sync(button);
        requestAnimationFrame(function () { requestAnimationFrame(function () { root.classList.remove("theme-switching"); }); });
      };
      var calm = matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (document.startViewTransition && !calm) document.startViewTransition(apply);
      else apply();
    });
  });
})();
