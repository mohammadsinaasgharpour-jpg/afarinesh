// Shared by the browser form and the server, so both reject the same input with the same message.

const FA_DIGITS = "۰۱۲۳۴۵۶۷۸۹";
const AR_DIGITS = "٠١٢٣٤٥٦٧٨٩";

export function toLatinDigits(value) {
  return String(value ?? "").replace(/[۰-۹٠-٩]/g, (d) => {
    const i = FA_DIGITS.indexOf(d);
    return String(i >= 0 ? i : AR_DIGITS.indexOf(d));
  });
}

export function toPersianDigits(value) {
  return String(value).replace(/\d/g, (d) => FA_DIGITS[d]);
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

export const LIMITS = { nameMin: 3, nameMax: 60, messageMax: 500 };

/**
 * @returns {{ ok: true, value: {parentName: string, phone: string, grade: string, message: string} }
 *         | { ok: false, errors: Record<string, string> }}
 */
export function validateInquiry(input) {
  const errors = {};
  const parentName = String(input?.parentName ?? "").trim().replace(/\s+/g, " ");
  const phone = normalizeMobile(input?.phone);
  const grade = String(input?.grade ?? "");
  const message = String(input?.message ?? "").trim();

  if (parentName.length < LIMITS.nameMin) errors.parentName = "نام و نام خانوادگی را کامل بنویسید.";
  else if (parentName.length > LIMITS.nameMax) errors.parentName = `نام حداکثر ${toPersianDigits(LIMITS.nameMax)} حرف است.`;
  else if (/[<>{}\\]|https?:/i.test(parentName)) errors.parentName = "نام فقط باید شامل حروف باشد.";

  if (!phone) errors.phone = "شماره همراه ۱۱ رقمی را با ۰۹ شروع کنید؛ مثلاً ۰۹۱۷۱۲۳۴۵۶۷.";
  if (!["7", "8", "9"].includes(grade)) errors.grade = "یکی از پایه‌ها را انتخاب کنید.";
  if (message.length > LIMITS.messageMax) errors.message = `پیام حداکثر ${toPersianDigits(LIMITS.messageMax)} حرف است.`;

  if (Object.keys(errors).length) return { ok: false, errors };
  return { ok: true, value: { parentName, phone, grade, message } };
}

export const GRADE_LABEL = { 7: "هفتم", 8: "هشتم", 9: "نهم" };
