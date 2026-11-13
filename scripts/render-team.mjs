// Renders content/team.json into public/index.html between the team markers,
// so the staff list is in the HTML for search engines and no-JS visitors.
import { readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const root = new URL("../", import.meta.url);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

export function renderTeam(people) {
  return people.map((p) => {
    const edu = p.edu.map((e) => `<li>${esc(e)}</li>`).join("");
    const note = p.note ? `\n              <p class="teacher-note">${esc(p.note)}</p>` : "";
    return `        <li class="teacher">
          <div class="teacher-photo"><img src="/assets/img/team/${esc(p.id)}.webp" width="400" height="400" loading="lazy" decoding="async" alt="${esc(p.name)}، ${esc(p.role)}"></div>
          <div class="teacher-body">
            <p class="teacher-role">${esc(p.role)}</p>
            <p class="teacher-name">${esc(p.name)}</p>
            <ul class="teacher-edu" role="list">${edu}</ul>${note}
          </div>
        </li>`;
  }).join("\n");
}

const START = "<!-- team:start -->";
const END = "<!-- team:end -->";

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const people = JSON.parse(await readFile(new URL("content/team.json", root), "utf8"));
  const file = new URL("public/index.html", root);
  const html = await readFile(file, "utf8");
  const a = html.indexOf(START), b = html.indexOf(END);
  if (a < 0 || b < a) throw new Error("team markers not found in public/index.html");
  await writeFile(file, html.slice(0, a + START.length) + "\n" + renderTeam(people) + "\n" + html.slice(b));
  console.log(`rendered ${people.length} people`);
}
