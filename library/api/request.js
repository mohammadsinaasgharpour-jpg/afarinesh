// POST /api/request: a student asks to borrow a book. The request goes to the school's Telegram channel as a
// plain-text message and, when the database is set up, is also saved in the school's Supabase project until the
// end of the school year. Nothing about the student is written to the site's logs.
import { randomUUID } from "node:crypto";
import { fail, origin, readJson, sameOrigin, send } from "./_lib/http.js";
import { current } from "./_lib/store.js";
import { configured as dbConfigured, purgeExpired, saveRequest } from "./_lib/supabase.js";
import { TelegramError, chatId, clientIp, configured, faDate, limiter, send as tgSend } from "./_lib/telegram.js";

const MAX_BYTES = 4 * 1024;
const MAX_DAYS = 14; // two weeks, the library's longest loan
const MIN_FILL_MS = 3000; // a person needs a few seconds to fill the form; scripts don't
const GRADES = { 7: "هفتم", 8: "هشتم", 9: "نهم" };
const DAY = 24 * 60 * 60 * 1000;

const perIp = limiter(5, 10 * 60 * 1000);
const perStudentBook = limiter(1, 30 * 60 * 1000);
const overall = limiter(60, 60 * 60 * 1000); // keeps a flood from burying the channel

const toLatin = (s) => String(s ?? "").replace(/[۰-۹]/g, (d) => d.charCodeAt(0) - 0x06f0).replace(/[٠-٩]/g, (d) => d.charCodeAt(0) - 0x0660);
const tidy = (s) => String(s ?? "").normalize("NFC").replace(/[\u0000-\u001f\u007f‪-‮⁦-⁩]/g, "").replace(/\s+/g, " ").trim();
const fa = (v) => String(v).replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[d]);

export function validate(body) {
  const errors = {};
  const name = tidy(body.name);
  if (name.length < 3 || name.length > 60 || !/^[\p{L}\p{M}][\p{L}\p{M}‌ .'-]*$/u.test(name)) errors.name = "نام و نام خانوادگی را با حروف بنویسید.";
  const grade = toLatin(body.grade);
  if (!GRADES[grade]) errors.grade = "پایه را انتخاب کنید.";
  const className = tidy(body.className);
  if (!className || className.length > 12 || !/^[\p{L}\p{N}][\p{L}\p{N}‌ /-]*$/u.test(className)) errors.className = "کلاس را بنویسید (مثلاً ۲).";
  const daysText = toLatin(body.days).trim();
  const days = Number(daysText);
  if (!/^\d{1,2}$/.test(daysText) || days < 1 || days > MAX_DAYS) errors.days = "مدت امانت باید بین ۱ تا ۱۴ روز باشد.";
  const bookId = String(body.bookId ?? "");
  if (!/^LIB-\d{1,6}$/.test(bookId)) errors.book = "کتاب درخواستی معتبر نیست.";
  return Object.keys(errors).length ? { errors } : { value: { name, grade, className, days, bookId } };
}

export default async function handler(req, res) {
  if (req.method !== "POST") return fail(res, 405, "method not allowed");
  // the form posts from this site's own page; anything else is another site using a visitor's browser
  if (!sameOrigin(req)) return fail(res, 403, "forbidden");
  if (!String(req.headers["content-type"] || "").startsWith("application/json")) return fail(res, 415, "unsupported");
  if (Number(req.headers["content-length"]) > MAX_BYTES) return fail(res, 413, "too large");

  if (!perIp(clientIp(req)) || !overall("all")) return send(res, 429, { error: "rate_limited" }, { "Cache-Control": "no-store", "Retry-After": "600" });

  let body;
  try {
    body = await readJson(req);
  } catch (e) {
    return fail(res, e.status || 400, "bad request");
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) return fail(res, 400, "bad request");

  // bots fill the hidden field or post within moments of opening the form: answer as if it worked
  const fake = () => send(res, 201, { ok: true, id: randomUUID().slice(0, 8), due: new Date(Date.now() + 7 * DAY).toISOString(), dueLabel: faDate(new Date(Date.now() + 7 * DAY)) }, { "Cache-Control": "no-store" });
  if (body.website) return fake();
  const startedAt = Number(body.startedAt);
  if (!startedAt || Date.now() - startedAt < MIN_FILL_MS) return fake();

  const { value, errors } = validate(body);
  if (errors) return send(res, 422, { error: "invalid", errors }, { "Cache-Control": "no-store" });
  if (!configured()) return fail(res, 503, "inbox not configured");

  let book;
  try {
    const { data } = await current(origin(req));
    book = data.books.find((b) => b.id === value.bookId);
  } catch (e) {
    console.error("request catalog:", e.message);
    return fail(res, 503, "catalog unavailable");
  }
  if (!book) return send(res, 422, { error: "invalid", errors: { book: "این کتاب در فهرست نیست." } }, { "Cache-Control": "no-store" });
  if (!perStudentBook(`${value.name}|${value.bookId}`)) return send(res, 429, { error: "duplicate" }, { "Cache-Control": "no-store", "Retry-After": "1800" });

  const now = new Date();
  const due = new Date(now.getTime() + value.days * DAY);
  const id = randomUUID().slice(0, 8);
  const text = [
    "درخواست امانت کتاب از سایت کتابخانه",
    "",
    `کتاب: «${book.title}»، شماره ${fa(book.number)}`,
    book.author ? `نویسنده: ${book.author}` : null,
    "",
    `دانش‌آموز: ${value.name}`,
    `پایه: ${GRADES[value.grade]} | کلاس: ${value.className}`,
    `مدت امانت: ${fa(value.days)} روز، تا ${faDate(due, { weekday: true })}`,
    "",
    `زمان: ${faDate(now, { time: true })}`,
    `کد پیگیری: ${id}`,
  ].filter((l) => l !== null).join("\n");

  try {
    await tgSend(chatId(), text);
  } catch (e) {
    console.error("request telegram:", e instanceof TelegramError ? e.message : e.name);
    return fail(res, 503, "inbox unavailable");
  }
  if (dbConfigured()) {
    // a record for the librarian; Telegram already has the request, so a database failure doesn't fail the student
    try {
      await saveRequest({
        code: id, book_id: book.id, book_number: Number.isInteger(book.number) ? book.number : null, book_title: book.title,
        student_name: value.name, grade: Number(value.grade), class_name: value.className, days: value.days,
        due_date: due.toISOString().slice(0, 10),
      });
      if (Math.random() < 0.05) await purgeExpired(); // now and then, clear last school year's requests
    } catch (e) {
      console.error(`request ${id} not saved:`, e.message);
    }
  }
  console.info(`request ${id}`); // the id only: personal data never goes to logs
  send(res, 201, { ok: true, id, due: due.toISOString(), dueLabel: faDate(due, { weekday: true }) }, { "Cache-Control": "no-store" });
}
