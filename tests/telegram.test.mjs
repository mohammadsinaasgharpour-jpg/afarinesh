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

test("the staff channel never receives a child's full national ID, birth date or address (T-003)", async () => {
  const { formatRecord } = await import("../server/forms.mjs");
  const text = formatRecord({ kind: "preRegistration", id: "abcdef12-x", receivedAt: "2026-11-03T08:00:00Z", fullName: "آزمون", nationalId: "0499370899", birthDate: "1393/04/23", studentMobile: "09171234567", address: "شیراز، بلوار ارم، کوچه ۵", motherMobile: "09171111111", fatherMobile: "09172222222", currentSchool: "مدرسه", gpa: "19.5", discipline: "عالی", grade: "8" });
  for (const secret of ["0499370899", "۰۴۹۹۳۷۰۸۹۹", "1393/04/23", "۱۳۹۳/۰۴/۲۳", "بلوار ارم"]) assert.ok(!text.includes(secret), secret);
  assert.ok(text.includes("…۰۸۹۹"), "last four digits of the national ID");
  assert.ok(text.includes("تأیید نشده"), "unverified-sender note");
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

test("every Telegram message ends with the hour's remaining allowance, or says it is unknown", async () => {
  const { formatRecord } = await import("../server/forms.mjs");
  const base = { id: "abcdef12-x", receivedAt: "2026-11-03T08:00:00Z" };
  const inquiry = { ...base, kind: "inquiry", parentName: "مریم احمدی", phone: "09171234567", grade: "8" };
  const career = { ...base, kind: "career", fullName: "علی رضایی", field: "ریاضی", degree: "کارشناسی", experience: "زیر ۵ سال", phone: "09171234567" };
  for (const r of [inquiry, career]) {
    const lines = formatRecord({ ...r, quota: { remaining: 117, limit: 120 } }).split("\n");
    assert.equal(lines.at(-1), "سهمیه‌ی باقی‌مانده (Usage remaining): ۱۱۷ از ۱۲۰ فرم از این نوع در یک ساعت اخیر");
    assert.match(formatRecord({ ...r, quota: null }).split("\n").at(-1), /Usage remaining\): نامعلوم/);
  }
  // a very long message is shortened, never the usage line
  const long = formatRecord({ ...inquiry, message: "ا".repeat(5000), quota: { remaining: 3, limit: 120 } });
  assert.ok(long.length <= 4000);
  assert.match(long.split("\n").at(-1), /۳ از ۱۲۰/);
});

test("the store reads the remaining allowance from the database reply, old and new formats", async () => {
  const { createSupabaseStore } = await import("../server/forms.mjs");
  const reply = (body) => createSupabaseStore({ url: "https://db.test", key: "k", fetchImpl: async () => ({ ok: true, json: async () => body }) });
  const a = { kind: "inquiry", id: "x", receivedAt: "t", quota: { remaining: 99, limit: 120 } };
  await reply({ repeat: 2, remaining: 118, limit: 120 })(a);
  assert.deepEqual([a.repeat, a.quota], [2, { remaining: 118, limit: 120 }]);
  const b = { kind: "inquiry", id: "y", receivedAt: "t", quota: { remaining: 99, limit: 120 } };
  await reply(1)(b); // older database version: a bare count, no allowance
  assert.equal(b.repeat, undefined);
  assert.equal(b.quota, null, "unknown, not the server's own per-instance count");
});

test("on a host without a database the handler's own count is used and sent", async () => {
  const { createFormHandler } = await import("../server/forms.mjs");
  const { Readable } = await import("node:stream");
  let saved;
  const handle = createFormHandler("inquiry", { save: async (r) => { saved = r; }, logger: {} });
  const body = JSON.stringify({ parentName: "مریم احمدی", phone: "09171234567", grade: "8" });
  const req = Object.assign(Readable.from([Buffer.from(body)]), { method: "POST", headers: { "content-type": "application/json", host: "x" }, socket: { remoteAddress: "1.2.3.4" } });
  const res = { writeHead() {}, end() {} };
  await handle(req, res);
  assert.deepEqual(saved.quota, { remaining: 119, limit: 120 });
});
