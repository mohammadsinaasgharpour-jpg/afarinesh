// GET /api/admin/telegram: is the library bot set up and connected?
// POST {action: "connect"}: points the bot's webhook at this site and sets its commands and description.
// POST {action: "test"}: sends a test message to the school's channel.
import { isAdmin } from "../_lib/auth.js";
import { fail, origin, readJson, sameOrigin, send } from "../_lib/http.js";
import { TelegramError, call, chatId, send as tgSend, token, webhookSecret } from "../_lib/telegram.js";

const NO_STORE = { "Cache-Control": "no-store" };
const hookUrl = (req) => `${origin(req)}/api/telegram`;

async function status(req) {
  const out = { tokenSet: Boolean(token()), chatSet: Boolean(chatId()), bot: null, connected: false, lastError: null, chatTitle: null };
  if (!out.tokenSet) return out;
  try {
    const me = await call("getMe");
    out.bot = me.username;
    const hook = await call("getWebhookInfo");
    out.connected = hook.url === hookUrl(req);
    out.lastError = hook.last_error_message || null;
    if (out.chatSet) out.chatTitle = (await call("getChat", { chat_id: chatId() })).title || null;
  } catch (e) {
    out.lastError = e instanceof TelegramError ? e.message : e.name;
  }
  return out;
}

export default async function handler(req, res) {
  if (!isAdmin(req)) return fail(res, 401, "sign in required");
  if (req.method === "GET") return send(res, 200, await status(req), NO_STORE);
  if (req.method !== "POST") return fail(res, 405, "method not allowed");
  if (!sameOrigin(req)) return fail(res, 403, "forbidden");

  let body;
  try {
    body = await readJson(req);
  } catch (e) {
    return fail(res, e.status || 400, "bad request");
  }
  if (!token()) return fail(res, 503, "bot token not set");

  try {
    if (body.action === "connect") {
      if (!origin(req).startsWith("https://")) return fail(res, 400, "Telegram only calls https addresses");
      await call("setWebhook", { url: hookUrl(req), secret_token: webhookSecret(), allowed_updates: ["message"], max_connections: 10 });
      await call("setMyCommands", { commands: [{ command: "start", description: "دربارهٔ ربات کتابخانه" }] });
      await call("setMyShortDescription", { short_description: "ربات کتابخانه مدرسه آفرینش؛ پیام شما به کتابدار می‌رسد." });
      await call("setMyDescription", { description: "سؤال، پیشنهاد کتاب یا هر پیامی برای کتابخانه مدرسه آفرینش دارید اینجا بنویسید؛ پیام شما به کتابدار مدرسه می‌رسد." });
    } else if (body.action === "test") {
      if (!chatId()) return fail(res, 503, "channel not set");
      await tgSend(chatId(), "پیام آزمایشی از پنل مدیریت کتابخانه: ربات کتابخانه به این کانال وصل است.");
    } else {
      return fail(res, 400, "unknown action");
    }
  } catch (e) {
    return send(res, 502, { error: e instanceof TelegramError ? e.message : "telegram unreachable" }, NO_STORE);
  }
  send(res, 200, await status(req), NO_STORE);
}
