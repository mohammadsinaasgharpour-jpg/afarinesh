import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeMobile, validateInquiry, toLatinDigits } from "../public/assets/js/validate.js";

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

test("validateInquiry rejects markup and links in the name", () => {
  assert.equal(validateInquiry({ parentName: "<script>", phone: "09171234567", grade: "7" }).ok, false);
  assert.equal(validateInquiry({ parentName: "visit https://x", phone: "09171234567", grade: "7" }).ok, false);
});
