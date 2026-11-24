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
  const r = validateInquiry({ parentName: "<علی> رضایی", phone: "09171234567", grade: "7", message: "سلام <> {}" });
  assert.equal(r.ok, true);
  assert.ok(!/[<>{}]/.test(r.value.parentName + r.value.message));
  assert.equal(validateInquiry({ parentName: "علی رضایی", phone: "09171234567", grade: "7", message: "<img src=x onerror=alert(1)>" }).ok, false);
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
  address: "شیراز، بلوار ارم، کوچه ۵، پلاک ۱۲", motherName: "مریم احمدی", fatherName: "علی رضایی", motherMobile: "09171111112", fatherMobile: "09172222223",
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
  for (const k of ["fullName", "nationalId", "birthDate", "studentMobile", "address", "motherName", "fatherName", "motherMobile", "fatherMobile", "currentSchool", "discipline", "grade", "consent"]) assert.ok(r.errors[k], k);
});

test("pre-registration: out-of-list choices and impossible GPAs are rejected", () => {
  const r = validatePreRegistration({ ...goodPre, gpa: "21", discipline: "بد", motherEducation: "<script>" });
  assert.equal(r.ok, false);
  assert.ok(r.errors.gpa && r.errors.discipline);
  assert.equal(validatePreRegistration({ ...goodPre, motherEducation: "<script>" }).value.motherEducation, "");
});

test("pre-registration: the report card asked for follows the grade", () => {
  const seventh = { ...goodPre, grade: "7", birthDate: "1394/02/10", gpa: "" };
  assert.ok(validatePreRegistration(seventh).errors.gpaDescriptive, "grade 7 needs the descriptive grade");
  const ok7 = validatePreRegistration({ ...seventh, gpaDescriptive: "خیلی خوب" });
  assert.equal(ok7.ok, true);
  assert.equal(ok7.value.gpa, "خیلی خوب");
  assert.match(validatePreRegistration({ ...goodPre, gpa: "" }).errors.gpa, /هفتم/);
  assert.match(validatePreRegistration({ ...goodPre, grade: "9", birthDate: "1392/01/01", gpa: "" }).errors.gpa, /هشتم/);
  assert.match(validatePreRegistration({ ...goodPre, gpa: "25" }).errors.gpa, /۲۰/);
});

test("pre-registration: impossible dates and ages are named", () => {
  assert.match(validatePreRegistration({ ...goodPre, birthDate: "1393/07/31" }).errors.birthDate, /مهر ۳۰ روز/);
  assert.match(validatePreRegistration({ ...goodPre, birthDate: "1394/12/30" }).errors.birthDate, /اسفند ۲۹ روز/);
  assert.equal(validatePreRegistration({ ...goodPre, birthDate: "1395/12/30", grade: "7", gpaDescriptive: "خوب" }).errors?.birthDate, undefined, "1395 is a leap year");
  assert.ok(validatePreRegistration({ ...goodPre, birthDate: "1398/01/01" }).errors.grade, "too young for grade 8");
});

test("pre-registration: address must be a real one, in order", () => {
  const err = (address) => validatePreRegistration({ ...goodPre, address }).errors?.address;
  assert.equal(err("شیراز، خیابان زند، کوچه‌ی ۸، پلاک ۲۴، واحد ۲"), undefined);
  assert.match(err("خیابان زند کوچه ۸ پلاک ۲۴"), /شهر/);
  assert.match(err("شیراز، کوچه ۸، پلاک ۲۴"), /خیابان/);
  assert.match(err("شیراز، خیابان زند، پلاک ۲۴"), /کوچه/);
  assert.match(err("شیراز، خیابان زند، کوچه ۸"), /پلاک/);
  assert.match(err("شیراز، چنچنه، خیابان نارون، کوچه‌ی ۵، پلاک ۱۲، واحد ۳"), /مثال/);
  assert.match(err("شیراز، چنچنه، خیابان نارون، نبش کوچه ۱۴"), /مدرسه/);
  assert.match(err("شیراز سشیب لاتن"), /درست/);
});

test("pre-registration: parents' names, jobs and numbers are checked against filler and repeats", () => {
  const e = (o) => validatePreRegistration({ ...goodPre, ...o }).errors ?? {};
  assert.match(e({ motherName: "مریم" }).motherName, /نام خانوادگی/);
  assert.match(e({ fatherName: "سشیب لاتن" }).fatherName, /درست/);
  assert.match(e({ fatherName: "Ali Rezaei" }).fatherName, /فارسی/);
  assert.match(e({ motherJob: "سیبسیب" }).motherJob, /درست/);
  assert.equal(e({ motherJob: "معلم", fatherJob: "مهندس عمران" }).motherJob, undefined);
  assert.match(e({ motherMobile: goodPre.studentMobile }).motherMobile, /دانش‌آموز/);
  assert.match(e({ fatherMobile: goodPre.motherMobile }).fatherMobile, /مادر/);
  assert.match(e({ fatherMobile: "0917123" }).fatherMobile, /۱۱ رقم/);
  assert.match(e({ currentSchool: "دبیرستان آفرینش" }).currentSchool, /آفرینش/);
});

test("job application", () => {
  assert.equal(validateCareer({ fullName: "مریم احمدی", field: "ریاضی", degree: "کارشناسی ارشد", experience: "بالای ۵ سال", phone: "09171234567", consent: true }).ok, true);
  assert.deepEqual(Object.keys(validateCareer({}).errors).sort(), ["consent", "degree", "experience", "field", "fullName", "phone"]);
});

test("GPA accepts the Persian decimal separator", () => {
  for (const g of ["۱۹٫۵", "19/5", "19,5", "۱۹.۵"]) assert.equal(validatePreRegistration({ ...goodPre, gpa: g }).value.gpa, "19.5", g);
});

test("names, address and messages must be Persian; numbers may use either keyboard", () => {
  const base = { parentName: "مریم احمدی", phone: "۰۹۱۷۱۲۳۴۵۶۷", grade: "7" };
  assert.equal(validateInquiry(base).ok, true);
  assert.equal(validateInquiry(base).value.phone, "09171234567");
  assert.ok(validateInquiry({ ...base, parentName: "Maryam Ahmadi" }).errors.parentName);
  assert.ok(validateInquiry({ ...base, parentName: "مریم" }).errors.parentName, "one word is not a full name");
  assert.ok(validateInquiry({ ...base, parentName: "ااااا بببب" }).errors.parentName, "a letter typed three times in a row");
  assert.ok(validateInquiry({ ...base, parentName: "مریم۱ احمدی" }).errors.parentName);
  assert.ok(validateInquiry({ ...base, message: "please call me" }).errors.message);
  assert.equal(validateInquiry({ ...base, message: "لطفاً بعد از ساعت ۱۰ تماس بگیرید." }).ok, true);
});

test("placeholder mobile numbers are refused", () => {
  const base = { parentName: "مریم احمدی", grade: "7" };
  for (const phone of ["09111111111", "09000000000", "09123456789", "0917123456", "08171234567"]) {
    assert.ok(validateInquiry({ ...base, phone }).errors.phone, phone);
  }
});

test("pre-registration: a father's and mother's names written in each other's field are caught", () => {
  const e = validatePreRegistration({ fullName: "آرین رضایی", fatherName: "ارمیتا یدالله", motherName: "اصغر احمدپور" }).errors;
  assert.match(e.fatherName, /زنانه/);
  assert.match(e.motherName, /مردانه/);
  const ok = validatePreRegistration({ fullName: "آرین رضایی", fatherName: "علی رضایی", motherName: "مریم احمدی" }).errors;
  assert.equal(ok.fatherName, undefined);
  assert.equal(ok.motherName, undefined);
  assert.match(validatePreRegistration({ fullName: "سارا رضایی" }).errors.fullName, /پسرانه/);
});
test("language school: a complete sign-up passes; language, age group and class type must be from the list", async () => {
  const { validateLanguage } = await import("../public/assets/js/validate.js");
  const ok = { fullName: "علی رضایی", phone: "۰۹۱۷۱۲۳۴۵۶۷", language: "انگلیسی", ageGroup: "کودک", courseType: "کلاس خصوصی", consent: true };
  const r = validateLanguage(ok);
  assert.equal(r.ok, true);
  assert.equal(r.value.phone, "09171234567");
  const bad = validateLanguage({ ...ok, language: "چینی", ageGroup: "x", courseType: "", consent: false, message: "www.spam.com" });
  assert.deepEqual(Object.keys(bad.errors).sort(), ["ageGroup", "consent", "courseType", "language", "message"]);
});
