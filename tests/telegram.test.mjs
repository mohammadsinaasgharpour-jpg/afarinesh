import { test } from "node:test";
import assert from "node:assert/strict";
import { createTelegramSender, formatInquiry } from "../server/forms.mjs";

const record = { id: "12345678-aaaa", receivedAt: "2026-10-31T08:00:00Z", parentName: "مریم احمدی", phone: "09171234567", grade: "8", message: "<b>سلام</b>" };

test("formatInquiry lists every field as plain text", () => {
  const text = formatInquiry(record);
  for (const part of ["مریم احمدی", "09171234567", "هشتم", "<b>سلام</b>", "12345678"]) assert.ok(text.includes(part), part);
});

test("sender refuses with 503 when the bot is not configured", async () => {
  await assert.rejects(createTelegramSender({ token: "", chatId: "" })(record), (e) => e.status === 503);
});

test("sender posts to the Telegram API without parse_mode", async () => {
  let call;
  const send = createTelegramSender({ token: "T", chatId: "-100", fetchImpl: async (url, init) => { call = { url, body: JSON.parse(init.body) }; return { ok: true }; } });
  await send(record);
  assert.equal(call.url, "https://api.telegram.org/botT/sendMessage");
  assert.equal(call.body.chat_id, "-100");
  assert.equal(call.body.parse_mode, undefined);
});

test("sender turns a Telegram error into 503", async () => {
  const send = createTelegramSender({ token: "T", chatId: "1", fetchImpl: async () => ({ ok: false, status: 401 }) });
  await assert.rejects(send(record), (e) => e.status === 503);
});

test("repeat submissions for one national ID are flagged at the top of the message", async () => {
  const { formatRecord } = await import("../server/forms.mjs");
  const text = formatRecord({ kind: "preRegistration", id: "abcdef12-x", receivedAt: "2026-11-03T08:00:00Z", repeat: 2, fullName: "آزمون", nationalId: "0499370899", birthDate: "1393/04/23", studentMobile: "09171234567", address: "شیراز", motherMobile: "09171111111", fatherMobile: "09172222222", currentSchool: "مدرسه", gpa: "19.5", discipline: "عالی", grade: "8" });
  assert.match(text.split("\n")[0], /ارسال شماره‌ی ۲ با همین کد ملی/);
});

test("the database store sends only form fields and maps the database's refusals", async () => {
  const { createSupabaseStore, storeThenNotify } = await import("../server/forms.mjs");
  let call;
  const ok = createSupabaseStore({ url: "https://db.test", key: "k", fetchImpl: async (url, init) => { call = { url, body: JSON.parse(init.body), headers: init.headers }; return { ok: true, json: async () => 2 }; } });
  const rec = { kind: "inquiry", ...record };
  await ok(rec);
  assert.equal(call.url, "https://db.test/rest/v1/rpc/submit_form");
  assert.deepEqual(Object.keys(call.body).sort(), ["p_data", "p_id", "p_kind"]);
  assert.equal(call.body.p_data.kind, undefined);
  assert.equal(rec.repeat, 2);
  const refuse = (message, status = 400) => createSupabaseStore({ url: "https://db.test", key: "k", fetchImpl: async () => ({ ok: false, status, json: async () => ({ message }) }) });
  await assert.rejects(refuse("duplicate")({ ...rec }), (e) => e.status === 429 && e.message === "duplicate");
  await assert.rejects(refuse("rate_limited")({ ...rec }), (e) => e.status === 429);
  await assert.rejects(refuse("boom", 500)({ ...rec }), (e) => e.status === 503);
  await assert.rejects(createSupabaseStore({ url: "https://db.test", key: "k", fetchImpl: async () => { throw new Error("down"); } })({ ...rec }), (e) => e.status === 503);

  // a stored form survives a failed announcement; with no database the announcement must succeed
  let stored = 0;
  await storeThenNotify({ store: async () => { stored++; }, notify: async () => { throw new Error("telegram 500"); }, logger: {} })({ ...rec });
  assert.equal(stored, 1);
  await assert.rejects(storeThenNotify({ store: null, notify: async () => { throw Object.assign(new Error("x"), { status: 503 }); } })({ ...rec }));
});
