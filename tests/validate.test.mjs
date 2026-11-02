import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeMobile, normalizePhone, validateInquiry, validatePreRegistration, validateCareer, toLatinDigits, cleanText, isValidNationalId, normalizeJalaliDate } from "../public/assets/js/validate.js";

test("normalizeMobile accepts common Iranian mobile formats", () => {
  for (const v of ["09171234567", "+989171234567", "00989171234567", "989171234567", "9171234567", "0917 123 4567", "۰۹۱۷۱۲۳۴۵۶۷"]) {
    assert.equal(normalizeMobile(v), "09171234567", v);
  }
});

test("normalizeMobile rejects landlines and short numbers", () => {
  for (const v of ["07132293194", "0917123", "", null, "abc"]) assert.equal(normalizeMobile(v), null, String(v));
});

test("toLatinDigits converts Persian and Arabic digits", () => {
  assert.equal(toLatinDigits("۱۲۳٤٥"), "12345");
});

test("validateInquiry returns cleaned values", () => {
  const r = validateInquiry({ parentName: "  علی   رضایی ", phone: "۰۹۱۷۱۲۳۴۵۶۷", grade: "8", message: " سلام " });
  assert.deepEqual(r, { ok: true, value: { parentName: "علی رضایی", phone: "09171234567", grade: "8", message: "سلام" } });
});

test("validateInquiry reports every invalid field", () => {
  const r = validateInquiry({ parentName: "ع", phone: "123", grade: "10", message: "x".repeat(501) });
  assert.equal(r.ok, false);
  assert.deepEqual(Object.keys(r.errors).sort(), ["grade", "message", "parentName", "phone"]);
});

test("validateInquiry strips markup and rejects links", () => {
  const r = validateInquiry({ parentName: "<b>علی</b> رضایی", phone: "09171234567", grade: "7", message: "<img src=x onerror=alert(1)>" });
  assert.equal(r.ok, true);
  assert.ok(!/[<>]/.test(r.value.parentName + r.value.message));
  assert.equal(validateInquiry({ parentName: "visit https://x", phone: "09171234567", grade: "7" }).ok, false);
  assert.equal(validateInquiry({ parentName: "علی رضایی", phone: "09171234567", grade: "7", message: "see www.spam.com" }).ok, false);
});

test("cleanText removes invisible and control characters but keeps the Persian half-space", () => {
  assert.equal(cleanText("علی‮رضا\u0000 ​ده‌بزرگی"), "علیرضا ده‌بزرگی");
  assert.equal(cleanText("خط اول\r\n\n\n\nخط دوم", { multiline: true }), "خط اول\n\nخط دوم");
});

test("national ID check digit", () => {
  for (const ok of ["0499370899", "0790419904", "۰۰۸۴۵۷۵۹۴۸"]) assert.equal(isValidNationalId(ok), true, ok);
  for (const bad of ["0499370898", "1111111111", "123", ""]) assert.equal(isValidNationalId(bad), false, bad);
});

test("Jalali birth dates", () => {
  assert.equal(normalizeJalaliDate("۱۳۹۳/۵/۷"), "1393/05/07");
  assert.equal(normalizeJalaliDate("1393-11-30"), "1393/11/30");
  for (const bad of ["1393/13/01", "1393/07/31", "2015/01/01", "1393/1"]) assert.equal(normalizeJalaliDate(bad), null, bad);
});

test("phone numbers: mobile or landline with area code", () => {
  assert.equal(normalizePhone("071 3229 3194"), "07132293194");
  assert.equal(normalizePhone("۰۹۱۷۱۲۳۴۵۶۷"), "09171234567");
  assert.equal(normalizePhone("3229 3194"), null);
});

const goodPre = {
  fullName: "آرین رضایی", nationalId: "0499370899", birthDate: "1393/04/23", studentMobile: "09171234567",
  address: "شیراز، بلوار ارم، کوچه ۵", motherMobile: "09171111111", fatherMobile: "09172222222",
  currentSchool: "دبستان نمونه", gpa: "19.5", discipline: "عالی", grade: "8", consent: true,
};

test("pre-registration: a complete form passes and optional fields stay optional", () => {
  const r = validatePreRegistration(goodPre);
  assert.equal(r.ok, true);
  assert.equal(r.value.gpa, "19.5");
});

test("pre-registration: every required field is checked", () => {
  const r = validatePreRegistration({});
  assert.equal(r.ok, false);
  for (const k of ["fullName", "nationalId", "birthDate", "studentMobile", "address", "motherMobile", "fatherMobile", "currentSchool", "gpa", "discipline", "grade", "consent"]) assert.ok(r.errors[k], k);
});

test("pre-registration: out-of-list choices and impossible GPAs are rejected", () => {
  const r = validatePreRegistration({ ...goodPre, gpa: "21", discipline: "بد", motherEducation: "<script>" });
  assert.equal(r.ok, false);
  assert.ok(r.errors.gpa && r.errors.discipline);
  assert.equal(validatePreRegistration({ ...goodPre, motherEducation: "<script>" }).value.motherEducation, "");
});

test("job application", () => {
  assert.equal(validateCareer({ fullName: "مریم احمدی", field: "ریاضی", degree: "کارشناسی ارشد", experience: "بالای ۵ سال", phone: "09171234567", consent: true }).ok, true);
  assert.deepEqual(Object.keys(validateCareer({}).errors).sort(), ["consent", "degree", "experience", "field", "fullName", "phone"]);
});

test("GPA accepts the Persian decimal separator", () => {
  for (const g of ["۱۹٫۵", "19/5", "19,5", "۱۹.۵"]) assert.equal(validatePreRegistration({ ...goodPre, gpa: g }).value.gpa, "19.5", g);
});
