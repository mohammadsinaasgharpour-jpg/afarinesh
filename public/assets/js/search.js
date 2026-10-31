// Teacher search: Persian-aware normalising, ignorable words and subject synonyms.
// A query matches when every meaningful word (or one of its synonyms) appears in the teacher's text.

/** Folds the variations Persian keyboards produce (ي/ی، ك/ک، ة/ه، أ/ا، zero-width joiners, spaces). */
export function fold(text) {
  return String(text ?? "")
    .toLowerCase()
    .replace(/[يى]/g, "ی")
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
};
const SYN = Object.fromEntries(Object.entries(SYNONYMS).map(([k, v]) => [fold(k), v.map(fold)]));

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
        if (key === w || (w.length >= 3 && key.startsWith(w))) list.forEach((x) => alts.add(x));
      }
      return [...alts];
    }),
  };
}

/** 2 = every word matched, 1 = some words matched, 0 = no match. */
export function score(haystack, parsed) {
  if (!parsed.groups.length) return 2;
  if (parsed.joined.length >= 2 && haystack.includes(parsed.joined)) return 2;
  const hits = parsed.groups.filter((alts) => alts.some((a) => haystack.includes(a))).length;
  if (hits === parsed.groups.length) return 2;
  return hits > 0 ? 1 : 0;
}

/**
 * Name and role are searched first; degrees and notes only when nothing matches there,
 * so «زبان» lists the language teachers, not everyone with «زبان و ادبیات فارسی» in a degree.
 * @param {{ primary?: string, haystack: string }[]} items  both strings already folded
 * @returns {{ matches: Set<number>, partial: boolean }}  partial = only some words matched anywhere
 */
export function searchTeachers(items, query) {
  const parsed = parseQuery(query);
  if (!parsed.groups.length) return { matches: new Set(items.map((_, i) => i)), partial: false };
  const pick = (field, want) => new Set(items.flatMap((it, i) => (score(it[field] ?? it.haystack, parsed) === want ? [i] : [])));
  for (const field of ["primary", "haystack"]) {
    const full = pick(field, 2);
    if (full.size) return { matches: full, partial: false };
  }
  return { matches: pick("haystack", 1), partial: true };
}
