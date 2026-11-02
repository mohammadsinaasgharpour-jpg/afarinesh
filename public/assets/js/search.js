// Teacher search: Persian-aware normalising, ignorable words and subject synonyms.
// A query matches when every meaningful word (or one of its synonyms) appears in the teacher's text.

/** Folds the variations Persian keyboards produce (ي/ی، ك/ک، ة/ه، أ/ا، zero-width joiners, spaces). */
export function fold(text) {
  return String(text ?? "")
    .toLowerCase()
    .replace(/[يىئ]/g, "ی")
    .replace(/ك/g, "ک")
    .replace(/ة/g, "ه")
    .replace(/[أإآ]/g, "ا")
    .replace(/ؤ/g, "و")
    .replace(/[ً-ٰٟ]/g, "") // harakat
    .replace(/[‌‍\s\-‌_.,،؛:()«»"']+/g, "");
}

// words people type that say nothing about who they are looking for
const IGNORED = ["دبیر", "معلم", "آقای", "آقا", "استاد", "جناب", "دکتر", "کلاس", "درس", "مدرس", "و", "یا"].map(fold);

// what parents type → words that appear in teachers' roles and degrees
const SYNONYMS = {
  ریاضی: ["ریاضی", "حساب", "هندسه"],
  ریاضیات: ["ریاضی", "حساب", "هندسه"],
  علوم: ["علوم", "فیزیک", "شیمی", "زیست", "زمین"],
  تجربی: ["فیزیک", "شیمی", "زیست", "زمین"],
  زیست: ["زیست", "میکروبیولوژی"],
  زبان: ["زبان", "انگلیسی", "ترمیک", "فرانسه"],
  انگلیسی: ["انگلیسی", "ترمیک"],
  ادبیات: ["ادبیات", "فارسی", "شاهنامه", "کتاب‌خوانی", "نویسندگی"],
  فارسی: ["فارسی", "ادبیات"],
  قرآن: ["قرآن", "پیام", "معارف"],
  دینی: ["قرآن", "پیام", "معارف", "حوزوی"],
  دین: ["قرآن", "پیام", "معارف"],
  معارف: ["معارف", "قرآن", "پیام"],
  اجتماعی: ["مطالعات", "اجتماعی", "تاریخ"],
  مطالعات: ["مطالعات", "اجتماعی"],
  تاریخ: ["تاریخ", "مطالعات"],
  جغرافیا: ["مطالعات"],
  دفاعی: ["دفاعی"],
  آمادگی: ["دفاعی"],
  ورزش: ["ورزش"],
  تربیت: ["ورزش"],
  بدنی: ["ورزش"],
  کامپیوتر: ["کامپیوتر", "برنامه‌نویسی", "هوشواره"],
  رایانه: ["کامپیوتر", "برنامه‌نویسی", "هوشواره"],
  برنامه: ["برنامه‌نویسی"],
  برنامهنویسی: ["برنامه‌نویسی"],
  هوش: ["هوشواره", "کامپیوتر"],
  مصنوعی: ["هوشواره", "کامپیوتر"],
  هوشواره: ["هوشواره"],
  رباتیک: ["رباتیک"],
  ربات: ["رباتیک"],
  هوافضا: ["هوافضا"],
  هنر: ["هنر", "گرافیک", "نقاشی", "سینما", "نمایش"],
  نقاشی: ["نقاشی", "گرافیک"],
  طراحی: ["گرافیک", "نقاشی"],
  گرافیک: ["گرافیک"],
  سینما: ["سینما", "فیلم"],
  فیلم: ["سینما", "فیلمنامه"],
  نمایش: ["نمایش"],
  تئاتر: ["نمایش"],
  نویسندگی: ["نویسندگی", "فیلمنامه"],
  مشاور: ["مشاور", "روان‌شناسی"],
  مشاوره: ["مشاور", "روان‌شناسی"],
  روانشناس: ["روان‌شناسی", "مشاور"],
  روانشناسی: ["روان‌شناسی", "مشاور"],
  تغذیه: ["تغذیه"],
  مدیر: ["مدیر"],
  مدیریت: ["مدیر", "مدیریت"],
  معاون: ["معاون"],
  موسس: ["موسس"],
  مؤسس: ["موسس"],
  بنیانگذار: ["موسس"],
  ناظم: ["معاون"],
  پرورشی: ["پرورشی", "معاون"],
  پایه: ["مسئول پایه", "معاون"],
  شاهنامه: ["شاهنامه"],
  کتابخوانی: ["کتاب‌خوانی"],
  عربی: ["عربی"],
  حساب: ["حساب"],
  هندسه: ["هندسه"],
  فیزیک: ["فیزیک"],
  شیمی: ["شیمی"],
  زمین: ["زمین"],
  پیام: ["پیام", "قرآن"],
  تربیتبدنی: ["ورزش"],
  math: ["ریاضی", "حساب", "هندسه"],
  science: ["فیزیک", "شیمی", "زیست"],
  english: ["انگلیسی", "ترمیک"],
  robotics: ["رباتیک"],
  programming: ["برنامه‌نویسی"],
  art: ["گرافیک", "نقاشی", "سینما"],
  history: ["تاریخ", "مطالعات"],
  sport: ["ورزش"],
};
const SYN = Object.fromEntries(Object.entries(SYNONYMS).map(([k, v]) => [fold(k), v.map(fold)]));

/** Edit distance, capped: returns cap+1 as soon as the distance is known to exceed cap. */
export function distance(a, b, cap = 2) {
  if (Math.abs(a.length - b.length) > cap) return cap + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      row[j] = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      best = Math.min(best, row[j]);
    }
    if (best > cap) return cap + 1;
    prev = row;
  }
  return prev[b.length];
}
// a typo of one letter is forgiven in words of 4+ letters, two letters in words of 7+
const allowedTypos = (w) => (w.length >= 7 ? 2 : w.length >= 4 ? 1 : 0);

/** Splits a query into word groups; each group is the list of alternatives one word may match. */
export function parseQuery(query) {
  const words = String(query ?? "").split(/[\s‌،,؛;]+/).map(fold).filter(Boolean);
  const meaningful = words.filter((w) => !IGNORED.includes(w));
  const terms = meaningful.length ? meaningful : words;
  // "آمادگی دفاعی" or "برنامه نویسی" typed with a space: also try the words joined
  const joined = fold(query);
  return {
    joined,
    groups: terms.map((w) => {
      const alts = new Set([w]);
      for (const [key, list] of Object.entries(SYN)) {
        const close = key === w || (w.length >= 3 && key.startsWith(w)) || (allowedTypos(w) && distance(w, key, allowedTypos(w)) <= allowedTypos(w));
        if (close) list.forEach((x) => alts.add(fold(x)));
      }
      return [...alts];
    }),
  };
}

/** Does one query alternative appear in the text: exactly, or as a near-spelling of one of its words? */
function hit(haystack, words, alt) {
  if (haystack.includes(alt)) return true;
  const cap = allowedTypos(alt);
  return cap > 0 && words.some((w) => distance(alt, w, cap) <= cap || (w.length > alt.length && distance(alt, w.slice(0, alt.length), cap) <= cap));
}

/** 2 = every word matched, 1 = some words matched, 0 = no match. */
export function score(haystack, parsed, words = []) {
  if (!parsed.groups.length) return 2;
  if (parsed.joined.length >= 2 && haystack.includes(parsed.joined)) return 2;
  const hits = parsed.groups.filter((alts) => alts.some((a) => hit(haystack, words, a))).length;
  if (hits === parsed.groups.length) return 2;
  return hits > 0 ? 1 : 0;
}

/**
 * Name and role are searched first; degrees and notes only when nothing matches there,
 * so «زبان» lists the language teachers, not everyone with «زبان و ادبیات فارسی» in a degree.
 * @param {{ primary?: string, haystack: string, primaryWords?: string[], words?: string[] }[]} items
 *   strings already folded; `words` are the folded single words, used for typo-tolerant matching
 * @returns {{ matches: Set<number>, partial: boolean }}  partial = only some words matched anywhere
 */
export function searchTeachers(items, query) {
  const parsed = parseQuery(query);
  if (!parsed.groups.length) return { matches: new Set(items.map((_, i) => i)), partial: false };
  const pick = (field, want) => new Set(items.flatMap((it, i) => (score(it[field] ?? it.haystack, parsed, field === "primary" ? it.primaryWords : it.words) === want ? [i] : [])));
  for (const field of ["primary", "haystack"]) {
    const full = pick(field, 2);
    if (full.size) return { matches: full, partial: false };
  }
  return { matches: pick("haystack", 1), partial: true };
}

/** Builds a search item from a teacher's name/role text and full text. */
export function searchItem(primaryText, fullText) {
  const words = (t) => String(t).split(/[\s‌،,.:()|]+/).map(fold).filter((w) => w.length >= 2);
  return { primary: fold(primaryText), haystack: fold(fullText), primaryWords: words(primaryText), words: words(fullText) };
}
