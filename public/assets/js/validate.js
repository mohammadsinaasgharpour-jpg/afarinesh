// Shared by the browser forms and the server, so both reject the same input with the same message.

const FA_DIGITS = "۰۱۲۳۴۵۶۷۸۹";
const AR_DIGITS = "٠١٢٣٤٥٦٧٨٩";

// Form fields arrive as strings (or numbers); objects and arrays from a crafted request count as empty.
const scalar = (value) => (typeof value === "string" || typeof value === "number" ? String(value) : "");

export function toLatinDigits(value) {
  return scalar(value).replace(/[۰-۹٠-٩]/g, (d) => {
    const i = FA_DIGITS.indexOf(d);
    return String(i >= 0 ? i : AR_DIGITS.indexOf(d));
  });
}

export function toPersianDigits(value) {
  return String(value).replace(/\d/g, (d) => FA_DIGITS[d]);
}

/**
 * Plain, single-line text: control characters and invisible formatting marks removed (the Persian
 * half-space ZWNJ is kept), angle brackets and braces dropped, whitespace collapsed.
 */
export function cleanText(value, { multiline = false } = {}) {
  let s = scalar(value)
    .normalize("NFC")
    // C0/C1 controls except tab/newline, bidi overrides and isolates, zero-width chars other than ZWNJ, BOM
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F​‍-‏‪-‮⁠-⁩﻿]/g, "")
    .replace(/[<>{}\\]/g, "");
  s = multiline
    ? s.replace(/\r\n?/g, "\n").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n")
    : s.replace(/\s+/g, " ");
  return s.trim();
}

/** Normalises 0917…, +98917…, 0098917… and Persian digits to 09xxxxxxxxx, or returns null. */
export function normalizeMobile(value) {
  let v = toLatinDigits(value).replace(/[\s\-()]/g, "");
  if (v.startsWith("+98")) v = "0" + v.slice(3);
  else if (v.startsWith("0098")) v = "0" + v.slice(4);
  else if (v.startsWith("98") && v.length === 12) v = "0" + v.slice(2);
  else if (v.startsWith("9") && v.length === 10) v = "0" + v;
  if (!/^09\d{9}$/.test(v)) return null;
  // placeholders people type to get past a form: one digit repeated, or the keyboard run
  if (/^09(\d)\1{8}$/.test(v) || v === "09123456789") return null;
  return v;
}

/** A mobile number, or an Iranian landline with its area code (e.g. 07132293194). */
export function normalizePhone(value) {
  const mobile = normalizeMobile(value);
  if (mobile) return mobile;
  let v = toLatinDigits(value).replace(/[\s\-()]/g, "");
  if (v.startsWith("+98")) v = "0" + v.slice(3);
  return /^0[1-8]\d{9}$/.test(v) ? v : null;
}

/** Iranian national ID (کد ملی): 10 digits with the official check digit. */
export function isValidNationalId(value) {
  const v = toLatinDigits(value).replace(/\D/g, "");
  if (!/^\d{10}$/.test(v) || /^(\d)\1{9}$/.test(v)) return false;
  const sum = [...v.slice(0, 9)].reduce((acc, d, i) => acc + Number(d) * (10 - i), 0) % 11;
  const check = Number(v[9]);
  return sum < 2 ? check === sum : check === 11 - sum;
}

/** Solar Hijri leap year (33-year cycle; right for every year this form can see). */
export const isJalaliLeap = (y) => [1, 5, 9, 13, 17, 22, 26, 30].includes(((y % 33) + 33) % 33);
/** Days in a Solar Hijri month: 31 for the first six, 30 for the next five, 29 or 30 for Esfand. */
export const jalaliMonthDays = (y, m) => (m <= 6 ? 31 : m <= 11 ? 30 : isJalaliLeap(y) ? 30 : 29);
/** Birth years the pre-registration form offers (students entering grades 7 to 9). */
export const BIRTH_YEARS = { min: 1380, max: 1400 };

/** Solar Hijri date written as 1394/05/12 (Persian digits allowed); returns the normalised string or null. */
export function normalizeJalaliDate(value, { minYear = BIRTH_YEARS.min, maxYear = BIRTH_YEARS.max } = {}) {
  const m = toLatinDigits(value).trim().replace(/[-.\s]/g, "/").match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (y < minYear || y > maxYear || mo < 1 || mo > 12 || d < 1) return null;
  if (d > jalaliMonthDays(y, mo)) return null;
  return `${y}/${String(mo).padStart(2, "0")}/${String(d).padStart(2, "0")}`;
}

export const LIMITS = { nameMin: 3, nameMax: 60, messageMax: 500, shortMax: 80, addressMax: 250 };
const NAME_ERR = "نام و نام خانوادگی را کامل و به فارسی بنویسید.";
const FA_ERR = "لطفاً به فارسی بنویسید.";
const looksLikeName = (s) => !/https?:|www\.|@/i.test(s);
const PERSIAN_LETTERS = /^[ء-غف-يپچژکگۀیٔ‌ ]+$/;
/** Persian letters only (no digits, Latin or symbols), with no letter typed three times in a row. */
export const isPersianName = (s) => PERSIAN_LETTERS.test(s) && !/(.)\1\1/.test(s.replace(/[ ‌]/g, ""));
/** A person's full name: at least two Persian words of two letters or more. */
export const isFullPersianName = (s) => isPersianName(s) && s.split(/[ ‌]+/).filter((w) => w.length >= 2).length >= 2;
/** Free text (address, school, job, message): Persian letters present and no Latin letters. */
export const isPersianText = (s) => /[ء-ی]/.test(s) && !/[A-Za-z]/.test(s);

// Rows of the standard Persian keyboard: four neighbouring keys in a row are typed, not written.
const KEY_ROWS = ["ضصثقفغعهخحجچ", "شسیبلاتنمکگ", "ظطزرذدپو"];
const LETTERS_ONLY = (s) => s.replace(/[^ء-یپچژکگ]/g, "");
/**
 * Keyboard mashing and filler: a run of four neighbouring keys, one letter typed three times in a row,
 * a long word with no vowel letter, or the same short chunk repeated.
 */
export function looksLikeGibberish(value) {
  const s = scalar(value);
  const letters = LETTERS_ONLY(s);
  if (!letters) return false;
  if (/(.)\1\1/.test(letters) || /(.{2,3})\1\1/.test(letters)) return true;
  for (const row of KEY_ROWS) {
    for (const line of [row, [...row].reverse().join("")]) {
      for (let i = 0; i + 4 <= line.length; i++) if (letters.includes(line.slice(i, i + 4))) return true;
    }
  }
  for (const word of s.split(/[\s‌،,.\-/]+/).map(LETTERS_ONLY)) {
    if (word.length >= 7 && !/[اآویهئأؤ]/.test(word)) return true;
    if (word.length >= 4 && /^(.{1,3})\1+$/.test(word)) return true;
  }
  return false;
}
/** A person's full name in Persian that is not keyboard filler. */
export const isRealFullName = (s) => isFullPersianName(s) && !looksLikeGibberish(s);

function result(errors, value) {
  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, value };
}

/** Callback request (درخواست تماس مشاور). */
export function validateInquiry(input) {
  const errors = {};
  const parentName = cleanText(input?.parentName);
  const phone = normalizeMobile(input?.phone);
  const grade = scalar(input?.grade);
  const message = cleanText(input?.message, { multiline: true });

  if (parentName.length > LIMITS.nameMax) errors.parentName = `نام حداکثر ${toPersianDigits(LIMITS.nameMax)} حرف است.`;
  else if (parentName.length < LIMITS.nameMin || !isFullPersianName(parentName)) errors.parentName = NAME_ERR;

  if (!phone) errors.phone = "شماره همراه ۱۱ رقمی را با ۰۹ شروع کنید؛ مثلاً ۰۹۱۷۱۲۳۴۵۶۷.";
  if (!["7", "8", "9"].includes(grade)) errors.grade = "یکی از پایه‌ها را انتخاب کنید.";
  if (message.length > LIMITS.messageMax) errors.message = `پیام حداکثر ${toPersianDigits(LIMITS.messageMax)} حرف است.`;
  else if (/https?:|www\./i.test(message)) errors.message = "لطفاً پیام را بدون لینک بنویسید.";
  else if (message && !isPersianText(message)) errors.message = "لطفاً پیام را به فارسی بنویسید.";

  return result(errors, { parentName, phone, grade, message });
}

export const GRADE_LABEL = { 7: "هفتم", 8: "هشتم", 9: "نهم" };
export const EDUCATION = ["سیکل", "دیپلم", "فوق دیپلم", "لیسانس", "فوق لیسانس", "دکتری", "فوق دکتری"];
export const GPA_DESCRIPTIVE = ["خیلی خوب", "خوب", "قابل قبول", "نیاز به تلاش بیشتر"];
export const DISCIPLINE = ["عالی", "خیلی خوب", "خوب", "نیاز به تلاش بیشتر"];
export const REFERRAL = ["جستجو در اینترنت", "دبیران", "مسئولین مدارس", "دوستان و آشنایان"];
export const DEGREES = ["کارشناسی", "کارشناسی ارشد", "دکتری"];
export const EXPERIENCE = ["زیر ۵ سال", "بالای ۵ سال"];

const choice = (value, list) => (list.includes(scalar(value)) ? scalar(value) : "");

/** Online pre-registration: the same questions as the school's earlier Porsline form. */
export function validatePreRegistration(input) {
  const e = {};
  const text = (k, max = LIMITS.shortMax) => cleanText(input?.[k]).slice(0, max + 1);
  const v = {
    fullName: text("fullName"),
    nationalId: toLatinDigits(input?.nationalId).replace(/\D/g, ""),
    birthDate: normalizeJalaliDate(input?.birthDate) ?? "",
    studentMobile: normalizeMobile(input?.studentMobile) ?? "",
    address: text("address", LIMITS.addressMax),
    motherName: text("motherName"),
    fatherName: text("fatherName"),
    motherEducation: choice(input?.motherEducation, EDUCATION),
    fatherEducation: choice(input?.fatherEducation, EDUCATION),
    motherJob: text("motherJob"),
    fatherJob: text("fatherJob"),
    motherMobile: normalizeMobile(input?.motherMobile) ?? "",
    fatherMobile: normalizeMobile(input?.fatherMobile) ?? "",
    currentSchool: text("currentSchool"),
    gpa: toLatinDigits(input?.gpa).trim().replace(/[٫/,،]/, "."),
    gpaDescriptive: choice(input?.gpaDescriptive, GPA_DESCRIPTIVE),
    discipline: choice(input?.discipline, DISCIPLINE),
    grade: ["7", "8", "9"].includes(scalar(input?.grade)) ? scalar(input.grade) : "",
    referral: choice(input?.referral, REFERRAL),
    consent: input?.consent === true || input?.consent === "on" || input?.consent === "true",
  };

  if (!v.fullName) e.fullName = "نام و نام خانوادگی دانش‌آموز را بنویسید.";
  else e.fullName = personNameError(v.fullName, "دانش‌آموز");
  if (!v.nationalId) e.nationalId = "کد ملی دانش‌آموز را بنویسید.";
  else if (v.nationalId.length !== 10) e.nationalId = `کد ملی ۱۰ رقم است؛ شما ${toPersianDigits(v.nationalId.length)} رقم نوشته‌اید.`;
  else if (!isValidNationalId(v.nationalId)) e.nationalId = "این کد ملی معتبر نیست؛ رقم‌ها را از روی کارت ملی یا شناسنامه دوباره بررسی کنید.";
  e.birthDate = birthDateError(input?.birthDate, v.birthDate);
  if (!v.studentMobile) e.studentMobile = mobileError(input?.studentMobile, "دانش‌آموز");
  e.address = addressError(v.address);

  for (const [name, job, mobile, label] of [["motherName", "motherJob", "motherMobile", "مادر"], ["fatherName", "fatherJob", "fatherMobile", "پدر"]]) {
    if (!v[name]) e[name] = `نام و نام خانوادگی ${label} را بنویسید.`;
    else e[name] = personNameError(v[name], label);
    if (!e[name] && v[name] === v.fullName) e[name] = `این نام دانش‌آموز است؛ نام و نام خانوادگی ${label} را بنویسید.`;
    if (v[job]) e[job] = jobError(v[job], label);
    if (!v[mobile]) e[mobile] = mobileError(input?.[mobile], label);
    else if (v[mobile] === v.studentMobile) e[mobile] = `این همان شماره‌ی دانش‌آموز است؛ شماره‌ی همراه خودِ ${label} را بنویسید.`;
  }
  if (!e.fatherName && !e.motherName && v.fatherName === v.motherName) e.fatherName = "نام پدر و مادر یکی نوشته شده است؛ لطفاً دقت کنید.";
  if (!e.fatherMobile && !e.motherMobile && v.fatherMobile === v.motherMobile) e.fatherMobile = "این شماره را برای مادر نوشته‌اید؛ شماره‌ی همراه خودِ پدر را بنویسید.";

  if (!v.grade) e.grade = "پایه‌ای را که فرزندتان در آن ثبت‌نام می‌کند انتخاب کنید.";
  else e.grade = gradeAgeError(v.grade, v.birthDate);
  e.currentSchool = schoolError(v.currentSchool);
  if (v.grade === "7") {
    // from primary school: the report card is descriptive only
    // the report card is descriptive; it is also stored as the record's grade (the database needs one)
    if (!v.gpaDescriptive) e.gpaDescriptive = "نمره‌ی توصیفی کارنامه‌ی پایه‌ی ششم را انتخاب کنید.";
    v.gpa = v.gpaDescriptive;
  } else if (v.grade) {
    v.gpaDescriptive = "";
    const gpa = Number(v.gpa);
    const of = v.grade === "8" ? "هفتم" : "هشتم";
    if (v.gpa === "") e.gpa = `معدل کارنامه‌ی پایه‌ی ${of} را بنویسید.`;
    else if (!/^\d{1,2}(\.\d{1,2})?$/.test(v.gpa)) e.gpa = "معدل را فقط با عدد بنویسید؛ مثلاً ۱۹٫۵۰.";
    else if (gpa > 20) e.gpa = "معدل بیشتر از ۲۰ نمی‌شود؛ لطفاً دقت کنید.";
    else if (gpa < 10) e.gpa = "معدل قبولی دست‌کم ۱۰ است؛ عدد را دوباره بررسی کنید.";
  }
  if (!v.discipline) e.discipline = "نمره‌ی انضباط را انتخاب کنید.";
  if (!v.consent) e.consent = "برای ثبت، موافقت با استفاده از اطلاعات برای پذیرش لازم است.";

  for (const k of Object.keys(e)) if (!e[k]) delete e[k];
  return result(e, v);
}

/* pre-registration: one specific message per field, so the visitor knows exactly what to fix */

function personNameError(s, label) {
  if (s.length > LIMITS.nameMax) return `نام حداکثر ${toPersianDigits(LIMITS.nameMax)} حرف است.`;
  if (/[A-Za-z]/.test(s)) return "نام را با حروف فارسی بنویسید، نه انگلیسی.";
  if (/[0-9۰-۹٠-٩]/.test(s)) return "نام نباید عدد داشته باشد.";
  if (!PERSIAN_LETTERS.test(s)) return "نام را فقط با حروف فارسی بنویسید؛ بدون علامت و نماد.";
  if (looksLikeGibberish(s)) return `این نام درست به نظر نمی‌رسد؛ نام واقعی ${label} را بنویسید.`;
  const words = s.split(/[ ‌]+/).filter(Boolean);
  if (words.length < 2) return `نام خانوادگی ${label} را هم بنویسید؛ مثلاً «${label === "مادر" ? "مریم احمدی" : label === "پدر" ? "علی رضایی" : "آرین رضایی"}».`;
  if (words.some((w) => w.length < 2)) return "هر بخش نام دست‌کم دو حرف است؛ نام را کامل بنویسید.";
  return "";
}

function mobileError(raw, label) {
  const digits = toLatinDigits(raw).replace(/[\s\-()+]/g, "");
  if (!digits) return `شماره‌ی همراه ${label} را بنویسید.`;
  if (/\D/.test(digits)) return "شماره را فقط با عدد بنویسید.";
  if (!/^(0098|98|0)?9/.test(digits)) return "شماره‌ی همراه با ۰۹ شروع می‌شود.";
  if (/^09\d{9}$/.test(digits) || /^9\d{9}$/.test(digits)) return "این شماره ساختگی به نظر می‌رسد؛ شماره‌ی واقعی را بنویسید.";
  return `شماره‌ی همراه ۱۱ رقم است؛ شما ${toPersianDigits(digits.length)} رقم نوشته‌اید.`;
}

function birthDateError(raw, normalized) {
  if (normalized) return "";
  const parts = toLatinDigits(raw).split("/").filter(Boolean);
  if (parts.length < 3) return "روز، ماه و سال تولد را از سه فهرست انتخاب کنید.";
  const [y, m, d] = parts.map(Number);
  if (y < BIRTH_YEARS.min || y > BIRTH_YEARS.max) return "سال تولد برای دانش‌آموز دوره اول متوسطه درست نیست؛ لطفاً دقت کنید.";
  const max = jalaliMonthDays(y, m);
  if (d > max) return `تاریخ اشتباه است؛ ماه ${MONTHS[m - 1] ?? ""} ${toPersianDigits(max)} روز دارد. لطفاً دقت کنید.`;
  return "تاریخ اشتباه است؛ لطفاً دقت کنید.";
}
export const MONTHS = ["فروردین", "اردیبهشت", "خرداد", "تیر", "مرداد", "شهریور", "مهر", "آبان", "آذر", "دی", "بهمن", "اسفند"];

// Entering grade g in Mehr 1406, a child is usually born in 1401 - g (grade 7: 1394); one year younger
// or two years older is still accepted (early birthdays, a repeated year).
function gradeAgeError(grade, birthDate) {
  if (!birthDate) return "";
  const y = Number(birthDate.slice(0, 4));
  const born = 1401 - Number(grade);
  if (y < born - 2 || y > born + 1) return `تاریخ تولد (${toPersianDigits(y)}) با پایه‌ی ${GRADE_LABEL[grade]} جور نیست؛ پایه یا تاریخ تولد را بررسی کنید.`;
  return "";
}

const STREET = /(خیابان|خ\.|بلوار|بولوار|بزرگراه|اتوبان|میدان|جاده|شهرک|فلکه|چهارراه)/;
const ALLEY = /(کوچه|ک\.|بن‌بست|بن بست|بنبست|کوی|نبش|فرعی)/;
const PLATE = /(پلاک|پ\.)\s*[‌ی]?\s*[0-9۰-۹]/;
function addressError(s) {
  if (!s) return "نشانی محل سکونت را بنویسید.";
  if (s.length > LIMITS.addressMax) return `نشانی حداکثر ${toPersianDigits(LIMITS.addressMax)} حرف است.`;
  if (/[A-Za-z]/.test(s)) return "نشانی را به فارسی بنویسید، نه انگلیسی.";
  if (looksLikeGibberish(s)) return "این نشانی درست به نظر نمی‌رسد؛ نشانی واقعی منزل را بنویسید.";
  const plain = s.replace(/[‌،,.]/g, " ").replace(/\s+/g, " ").trim();
  if (plain.includes("چنچنه خیابان نارون کوچه ی ۵ پلاک ۱۲") || /کوچه\s*ی?\s*[۵5]\s*پلاک\s*[۱1][۲2]\s*واحد\s*[۳3]/.test(plain)) return "این همان مثالِ فرم است؛ نشانی منزل خودتان را بنویسید.";
  if (/نارون/.test(s) && /(۱۴|14)/.test(s) && !/پلاک/.test(s.replace(/کوچه[‌ی\s]*(۱۴|14)/, ""))) return "این نشانی خود مدرسه است؛ نشانی منزل را بنویسید.";
  if (!/^(شیراز|شهر شیراز|صدرا|شهر صدرا)/.test(plain)) return "نشانی را با نام شهر شروع کنید؛ مثلاً «شیراز، ...».";
  if (!STREET.test(s)) return "نام خیابان یا بلوار را بنویسید؛ مثلاً «خیابان زند».";
  if (!ALLEY.test(s)) return "کوچه را بنویسید؛ مثلاً «کوچه‌ی ۸» (اگر کوچه ندارد، «نبش» یا «بن‌بست» را بنویسید).";
  if (!PLATE.test(s)) return "پلاک را با عدد بنویسید؛ مثلاً «پلاک ۲۴».";
  return "";
}

function jobError(s, label) {
  if (s.length > LIMITS.shortMax) return `شغل حداکثر ${toPersianDigits(LIMITS.shortMax)} حرف است.`;
  if (!looksLikeName(s)) return "شغل را بدون لینک بنویسید.";
  if (/[A-Za-z]/.test(s)) return "شغل را به فارسی بنویسید، نه انگلیسی.";
  if (/[0-9۰-۹٠-٩]/.test(s)) return "شغل نباید عدد داشته باشد.";
  if (!isPersianText(s) || LETTERS_ONLY(s).length < 2) return `شغل ${label} را به فارسی بنویسید؛ مثلاً «معلم» یا «کارمند».`;
  if (looksLikeGibberish(s)) return `این شغل درست به نظر نمی‌رسد؛ شغل واقعی ${label} را بنویسید.`;
  return "";
}

function schoolError(s) {
  if (!s) return "نام مدرسه‌ای را که فرزندتان امسال در آن درس می‌خواند بنویسید.";
  if (s.length > LIMITS.shortMax) return `نام مدرسه حداکثر ${toPersianDigits(LIMITS.shortMax)} حرف است.`;
  if (/[A-Za-z]/.test(s)) return "نام مدرسه را به فارسی بنویسید.";
  if (/آفرینش/.test(s)) return "آفرینش مدرسه‌ای است که در آن ثبت‌نام می‌کنید؛ نام مدرسه‌ی فعلی فرزندتان را بنویسید.";
  if (!isPersianText(s) || LETTERS_ONLY(s).length < 3) return "نام مدرسه را کامل بنویسید؛ مثلاً «دبستان شهید دستغیب».";
  if (looksLikeGibberish(s)) return "این نام مدرسه درست به نظر نمی‌رسد؛ نام واقعی مدرسه را بنویسید.";
  return "";
}

/** Job application (دعوت به همکاری): the same questions as the earlier Porsline form. */
export function validateCareer(input) {
  const e = {};
  const v = {
    fullName: cleanText(input?.fullName).slice(0, LIMITS.nameMax + 1),
    field: cleanText(input?.field).slice(0, LIMITS.shortMax + 1),
    degree: choice(input?.degree, DEGREES),
    experience: choice(input?.experience, EXPERIENCE),
    phone: normalizePhone(input?.phone) ?? "",
    consent: input?.consent === true || input?.consent === "on" || input?.consent === "true",
  };
  if (v.fullName.length < LIMITS.nameMin || v.fullName.length > LIMITS.nameMax || !isFullPersianName(v.fullName)) e.fullName = NAME_ERR;
  if (v.field.length < 2 || v.field.length > LIMITS.shortMax || !looksLikeName(v.field)) e.field = "رشته‌ی تحصیلی را بنویسید.";
  else if (!isPersianText(v.field)) e.field = "رشته‌ی تحصیلی را به فارسی بنویسید.";
  if (!v.degree) e.degree = "مقطع تحصیلی را انتخاب کنید.";
  if (!v.experience) e.experience = "سابقه‌ی تدریس را انتخاب کنید.";
  if (!v.phone) e.phone = "شماره‌ی همراه یا ثابت با پیش‌شماره را بنویسید.";
  if (!v.consent) e.consent = "برای ثبت، موافقت با استفاده از اطلاعات برای تماس لازم است.";
  return result(e, v);
}
