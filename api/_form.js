// Shared by the Vercel form functions: each request becomes a Telegram message to the school's private channel.
// TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID come from the Vercel project settings (README: "Form inbox").
// Until both are set the API answers 503 and the page asks people to phone instead.
import { createFormHandler, createTelegramSender } from "../server/forms.mjs";

export function formFunction(kind) {
  const handle = createFormHandler(kind, {
    save: createTelegramSender({ token: process.env.TELEGRAM_BOT_TOKEN, chatId: process.env.TELEGRAM_CHAT_ID }),
    trustProxy: "vercel",
  });
  return (req, res) => handle(req, res);
}
