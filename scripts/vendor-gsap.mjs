// Copies the three GSAP files the home page uses from node_modules into public/assets/js/vendor/.
// The site serves them itself: the CSP allows scripts from the site only, and there is no runtime npm.
// Run after changing the gsap version in package.json: npm run vendor:gsap
import { copyFile, mkdir, readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const from = new URL("node_modules/gsap/dist/", root);
const to = new URL("public/assets/js/vendor/", root);
const FILES = ["gsap.min.js", "ScrollTrigger.min.js", "Flip.min.js"];

await mkdir(to, { recursive: true });
for (const f of FILES) await copyFile(new URL(f, from), new URL(f, to));
const { version } = JSON.parse(await readFile(new URL("node_modules/gsap/package.json", root), "utf8"));
console.log(`copied GSAP ${version}: ${FILES.join(", ")}`);
