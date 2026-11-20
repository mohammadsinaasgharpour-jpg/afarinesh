// POST /api/telegram: Telegram's webhook for the library bot. Anyone may write to the bot in a private chat;
// each message is passed on to the school's channel (TELEGRAM_CHAT_ID) and the sender gets a short receipt.
// Only calls carrying the webhook secret (set by the admin panel's "connect" button) are accepted.
import { fail, readJson, send } from "./_lib/http.js";
import { TelegramError, call, chatId, fromTelegram, limiter, send as tgSend, token } from "./_lib/telegram.js";

const perSender = limiter(8, 10 * 60 * 1000);
const overall = limiter(200, 60 * 60 * 1000);

const WELCOME = [
  "سلام! این ربات کتابخانه مدرسه آفرینش است.",
  "",
  "سؤال، پیشنهاد کتاب یا هر پیامی برای کتابدار دارید همین‌جا بنویسید؛ پیام شما به کتابخانه می‌رسد.",
  "",
  `فهرست کتاب‌ها و درخواست امانت: ${(process.env.SITE_URL || "https://library.afarineshshiraz.ir").replace(/\/$/, "")}/`,
].join("\n");

function senderLine(from) {
  const name = [from.first_name, from.last_name].filter(Boolean).join(" ").replace(/[‪-‮⁦-⁩]/g, "").slice(0, 80);
  return `از: ${name || "بی‌نام"}${from.username ? ` (@${from.username})` : ""}`;
}

async function relay(message) {
  const from = message.from;
  const text = typeof message.text === "string" ? message.text.trim() : "";

  if (/^\/(start|help)(@\w+)?\b/.test(text)) return tgSend(message.chat.id, WELCOME);
  if (!perSender(String(from.id)) || !overall("all")) {
    return tgSend(message.chat.id, "پیام‌های زیادی پشت هم فرستادید؛ چند دقیقه بعد دوباره بنویسید.");
  }

  const head = ["پیام تازه به ربات کتابخانه", senderLine(from)];
  if (text) {
    await tgSend(chatId(), [...head, "", text].join("\n"));
  } else {
    // photos, voice notes, files…: a short header, then the message itself as Telegram forwards it
    await tgSend(chatId(), head.join("\n"));
    await call("forwardMessage", { chat_id: chatId(), from_chat_id: message.chat.id, message_id: message.message_id });
  }
  return tgSend(message.chat.id, "پیام شما به کتابخانه مدرسه رسید. ممنون!");
}

export default async function handler(req, res) {
  if (req.method !== "POST") return fail(res, 405, "method not allowed");
  if (!token()) return fail(res, 503, "bot not configured");
  if (!fromTelegram(req)) return fail(res, 401, "unauthorized");

  let update;
  try {
    update = await readJson(req);
  } catch (e) {
    return fail(res, e.status || 400, "bad request");
  }

  const message = update?.message;
  // only private chats with people; the bot ignores groups and channels it is in, and other bots
  if (message?.chat?.type === "private" && message.from && !message.from.is_bot && chatId()) {
    try {
      await relay(message);
    } catch (e) {
      console.error("telegram relay:", e instanceof TelegramError ? e.message : e.name);
    }
  }
  // always 200 for a genuine update, so Telegram doesn't resend it forever after a failure
  send(res, 200, { ok: true }, { "Cache-Control": "no-store" });
}
