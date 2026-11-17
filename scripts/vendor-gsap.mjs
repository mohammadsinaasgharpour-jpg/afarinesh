// Copies the three GSAP files and Lenis the home page uses from node_modules into public/assets/js/vendor/.
// The site serves them itself: the CSP allows scripts from the site only, and there is no runtime npm.
// Run after changing the gsap or lenis version in package.json: npm run vendor:gsap
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const from = new URL("node_modules/gsap/dist/", root);
const to = new URL("public/assets/js/vendor/", root);
const FILES = ["gsap.min.js", "ScrollTrigger.min.js", "Flip.min.js"];

await mkdir(to, { recursive: true });
for (const f of FILES) await copyFile(new URL(f, from), new URL(f, to));
const { version } = JSON.parse(await readFile(new URL("node_modules/gsap/package.json", root), "utf8"));
console.log(`copied GSAP ${version}: ${FILES.join(", ")}`);

// Lenis (smooth wheel scrolling on desktops), for the same reason. Its source-map comment is dropped:
// the map is not shipped, and the browser would ask for it.
const lenisJs = await readFile(new URL("node_modules/lenis/dist/lenis.min.js", root), "utf8");
const MAP_COMMENT = /\n?\/\/# sourceMappingURL=\S*\s*$/;
await writeFile(new URL("lenis.min.js", to), `${lenisJs.replace(MAP_COMMENT, "")}\n`);
const lenis = JSON.parse(await readFile(new URL("node_modules/lenis/package.json", root), "utf8"));
console.log(`copied Lenis ${lenis.version}: lenis.min.js`);
