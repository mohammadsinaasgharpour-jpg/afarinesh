// Shared by the Vercel form functions: each request is stored in the school's database and announced in the
// school's private Telegram channel. TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID come from the Vercel project
// settings (README: "Form inbox"); without them forms are still stored, only the announcement is skipped.
import { createFormHandler, createTelegramSender, createSupabaseStore, storeThenNotify } from "../server/forms.mjs";

export function formFunction(kind) {
  const handle = createFormHandler(kind, {
    save: storeThenNotify({
      store: createSupabaseStore(),
      notify: createTelegramSender({ token: process.env.TELEGRAM_BOT_TOKEN, chatId: process.env.TELEGRAM_CHAT_ID }),
    }),
    trustProxy: "vercel",
  });
  return (req, res) => handle(req, res);
}
