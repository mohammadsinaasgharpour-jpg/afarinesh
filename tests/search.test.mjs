import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fold, parseQuery, searchTeachers, searchItem, distance } from "../public/assets/js/search.js";

const team = JSON.parse(await readFile(new URL("../content/team.json", import.meta.url), "utf8"));
const items = team.map((p) => searchItem(`${p.name} ${p.role}`, [p.name, p.role, ...p.edu, p.note ?? ""].join(" ")));
const names = (q) => [...searchTeachers(items, q).matches].map((i) => team[i].name).sort();

test("fold unifies Arabic and Persian letters, joiners and spaces", () => {
  assert.equal(fold("علي كريمي"), fold("علی کریمی"));
  assert.equal(fold("ده‌بزرگی"), fold("ده بزرگی"));
  assert.equal(fold("برنامه‌نویسی"), fold("برنامه نویسی"));
});

test("ignored words like «دبیر» do not narrow the search", () => {
  assert.deepEqual(parseQuery("دبیر ریاضی").groups.length, 1);
});

const cases = {
  "آمادگی دفاعی": ["شهرام ده‌بزرگی"],
  "دفاعی": ["شهرام ده‌بزرگی"],
  "ریاضی": ["شهرام صدری", "کریم کشاورز", "مجید میرزایی"],
  "دبیر حساب": ["شهرام صدری", "کریم کشاورز"],
  "هندسه": ["شهرام صدری", "مجید میرزایی"],
  "زیست": ["هومن یزدان‌پور"],
  "مشاوره": ["سجاد محمدی", "شهرام ده‌بزرگی", "محمدرضا شکوهی"],
  "رباتیک": ["حسین مهبودی"],
  "هوش مصنوعی": ["علیرضا علیزاده"],
  "برنامه نویسی": ["علیرضا علیزاده"],
  "سينما": ["پدرام اردشیرزاده"],
  "مدیر": ["عبدالرحمان یدالهی"],
  "تاریخ": ["فرشید عباسی", "منوچهر جعفریان"],
};
for (const [q, expected] of Object.entries(cases)) {
  test(`«${q}» finds ${expected.join("، ")}`, () => {
    for (const name of expected) assert.ok(names(q).includes(name), `${name} missing for ${q}: ${names(q)}`);
  });
}

test("«زبان» finds exactly the four language teachers", () => {
  assert.deepEqual(names("زبان"), ["امین محب", "حسن ابراهیمی", "عبدالحسین ده‌بزرگی", "محمد عطارزاده"].sort());
});

test("degree-only words still find people", () => {
  assert.ok(names("روانشناسی").includes("شهرام ده‌بزرگی"));
  assert.ok(names("میکروبیولوژی").includes("هومن یزدان‌پور"));
});

test("a typed name finds that teacher", () => {
  assert.deepEqual(names("میرزایی"), ["مجید میرزایی"]);
  assert.deepEqual(names("فلاحی"), ["فرشید فلاحی"]);
});

test("nonsense finds nobody", () => {
  assert.equal(searchTeachers(items, "zzzz").matches.size, 0);
});

test("a partly matching query falls back to related results", () => {
  const r = searchTeachers(items, "رباتیک فوتبال");
  assert.equal(r.partial, true);
  assert.ok([...r.matches].some((i) => team[i].name === "حسین مهبودی"));
});

test("edit distance", () => {
  assert.equal(distance("ریاضی", "ریاظی"), 1);
  assert.equal(distance("abc", "abcdef", 2), 3);
});

test("typos still find the right teachers", () => {
  assert.ok(names("ریاظی").includes("مجید میرزایی"));
  assert.deepEqual(names("میرزائی"), ["مجید میرزایی"]);
  assert.ok(names("رباطیک").includes("حسین مهبودی"));
});

test("more everyday words and English work", () => {
  assert.ok(names("ناظم").includes("سینا عباسلو"));
  assert.ok(names("پرورشی").includes("فرهاد نادری"));
  assert.ok(names("math").includes("کریم کشاورز"));
  assert.ok(names("english").includes("امین محب"));
});
