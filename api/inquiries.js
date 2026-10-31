// Vercel function for POST /api/inquiries: each request becomes a Telegram message to the school's chat.
// Set TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID in the Vercel project settings (README: "Form inbox").
// Until both are set the API answers 503 and the page asks parents to phone instead.
import { createInquiryHandler, createTelegramSender } from "../server/inquiry.mjs";

const sendToTelegram = createTelegramSender({
  token: process.env.TELEGRAM_BOT_TOKEN,
  chatId: process.env.TELEGRAM_CHAT_ID,
});

const handleInquiry = createInquiryHandler({
  async save(record) {
    // the log line is a backup copy, kept for the log retention period
    console.log("INQUIRY " + JSON.stringify(record));
    await sendToTelegram(record);
  },
});

export default function handler(req, res) {
  return handleInquiry(req, res);
}
