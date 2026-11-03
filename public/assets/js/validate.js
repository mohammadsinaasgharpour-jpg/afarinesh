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
  return /^09\d{9}$/.test(v) ? v : null;
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

/** Solar Hijri date written as 1394/05/12 (Persian digits allowed); returns the normalised string or null. */
export function normalizeJalaliDate(value, { minYear = 1380, maxYear = 1405 } = {}) {
  const m = toLatinDigits(value).trim().replace(/[-.\s]/g, "/").match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (y < minYear || y > maxYear || mo < 1 || mo > 12 || d < 1) return null;
  if (d > (mo <= 6 ? 31 : 30)) return null; // Esfand has 30 days only in leap years; accepted here
  return `${y}/${String(mo).padStart(2, "0")}/${String(d).padStart(2, "0")}`;
}

export const LIMITS = { nameMin: 3, nameMax: 60, messageMax: 500, shortMax: 80, addressMax: 250 };
const NAME_ERR = "نام و نام خانوادگی را کامل بنویسید.";
const looksLikeName = (s) => !/https?:|www\.|@/i.test(s);

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

  if (parentName.length < LIMITS.nameMin) errors.parentName = NAME_ERR;
  else if (parentName.length > LIMITS.nameMax) errors.parentName = `نام حداکثر ${toPersianDigits(LIMITS.nameMax)} حرف است.`;
  else if (!looksLikeName(parentName)) errors.parentName = "نام فقط باید شامل حروف باشد.";

  if (!phone) errors.phone = "شماره همراه ۱۱ رقمی را با ۰۹ شروع کنید؛ مثلاً ۰۹۱۷۱۲۳۴۵۶۷.";
  if (!["7", "8", "9"].includes(grade)) errors.grade = "یکی از پایه‌ها را انتخاب کنید.";
  if (message.length > LIMITS.messageMax) errors.message = `پیام حداکثر ${toPersianDigits(LIMITS.messageMax)} حرف است.`;
  else if (/https?:|www\./i.test(message)) errors.message = "لطفاً پیام را بدون لینک بنویسید.";

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

  if (v.fullName.length < LIMITS.nameMin || v.fullName.length > LIMITS.nameMax || !looksLikeName(v.fullName)) e.fullName = NAME_ERR;
  if (!isValidNationalId(v.nationalId)) e.nationalId = "کد ملی ۱۰ رقمی معتبر نیست؛ دوباره بررسی کنید.";
  if (!v.birthDate) e.birthDate = "تاریخ تولد را به شکل ۱۳۹۴/۰۵/۱۲ بنویسید.";
  if (!v.studentMobile) e.studentMobile = "شماره همراه ۱۱ رقمی را با ۰۹ شروع کنید.";
  if (v.address.length < 8 || v.address.length > LIMITS.addressMax) e.address = "نشانی محل سکونت را کامل بنویسید.";
  for (const k of ["motherName", "fatherName", "motherJob", "fatherJob"]) {
    if (v[k].length > LIMITS.shortMax || (v[k] && !looksLikeName(v[k]))) e[k] = "این مورد را کوتاه و بدون لینک بنویسید.";
  }
  if (!v.motherMobile) e.motherMobile = "شماره همراه مادر را با ۰۹ شروع کنید.";
  if (!v.fatherMobile) e.fatherMobile = "شماره همراه پدر را با ۰۹ شروع کنید.";
  if (v.currentSchool.length < 2 || v.currentSchool.length > LIMITS.shortMax) e.currentSchool = "نام مدرسه‌ی فعلی را بنویسید.";
  const gpa = Number(v.gpa);
  if (v.gpa === "" || !/^\d{1,2}(\.\d{1,2})?$/.test(v.gpa) || gpa < 0 || gpa > 20) e.gpa = "معدل را به عدد بین ۰ تا ۲۰ بنویسید؛ مثلاً ۱۹٫۵۰.";
  if (!v.discipline) e.discipline = "نمره‌ی انضباط را انتخاب کنید.";
  if (!v.grade) e.grade = "پایه‌ی مورد نظر را انتخاب کنید.";
  if (!v.consent) e.consent = "برای ثبت، موافقت با استفاده از اطلاعات برای پذیرش لازم است.";

  return result(e, v);
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
  if (v.fullName.length < LIMITS.nameMin || v.fullName.length > LIMITS.nameMax || !looksLikeName(v.fullName)) e.fullName = NAME_ERR;
  if (v.field.length < 2 || v.field.length > LIMITS.shortMax || !looksLikeName(v.field)) e.field = "رشته‌ی تحصیلی را بنویسید.";
  if (!v.degree) e.degree = "مقطع تحصیلی را انتخاب کنید.";
  if (!v.experience) e.experience = "سابقه‌ی تدریس را انتخاب کنید.";
  if (!v.phone) e.phone = "شماره‌ی همراه یا ثابت با پیش‌شماره را بنویسید.";
  if (!v.consent) e.consent = "برای ثبت، موافقت با استفاده از اطلاعات برای تماس لازم است.";
  return result(e, v);
}
