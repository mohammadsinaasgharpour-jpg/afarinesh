import { test } from "node:test";
import assert from "node:assert/strict";
import { createTelegramSender, formatInquiry } from "../server/inquiry.mjs";

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
