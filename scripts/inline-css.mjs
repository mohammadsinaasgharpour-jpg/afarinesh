// Puts public/assets/css/main.css into public/index.html between the css markers, so the first paint
// does not wait for a second request. The other pages copy the block from index.html (render-pages.mjs)
// and the CSP allows it by hash (vercel-config.mjs, server/app.mjs). Re-run after every CSS change.
import { readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const root = new URL("../", import.meta.url);
const START = "<!-- css:start -->";
const END = "<!-- css:end -->";

/** Comments and indentation removed; spacing inside declarations is left alone (calc() needs it). */
export const compactCss = (css) => css.replace(/\/\*[\s\S]*?\*\//g, "").split("\n").map((l) => l.trim()).filter(Boolean).join("\n");

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const css = compactCss(await readFile(new URL("public/assets/css/main.css", root), "utf8"));
  if (css.includes("</style")) throw new Error("main.css must not contain </style");
  const file = new URL("public/index.html", root);
  const html = await readFile(file, "utf8");
  const a = html.indexOf(START), b = html.indexOf(END);
  if (a < 0 || b < a) throw new Error("css markers not found in public/index.html");
  await writeFile(file, `${html.slice(0, a + START.length)}<style>${css}</style>${html.slice(b)}`);
  console.log(`inlined ${css.length} bytes of CSS`);
}
