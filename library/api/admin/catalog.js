// GET /api/admin/catalog: the catalog plus its version, for the admin panel.
// POST: {action: "add" | "update" | "delete", book?, id?, version} → applies one change and saves.
// Shared physical numbers are allowed on purpose: some books in the library really do share a number.
import { isAdmin } from "../_lib/auth.js";
import { fail, origin, readJson, sameOrigin, send } from "../_lib/http.js";
import { notify } from "../_lib/indexnow.js";
import { ConflictError, StorageMissingError, current, writeSaved } from "../_lib/store.js";

const NO_STORE = { "Cache-Control": "no-store" };
const TEXT_FIELDS = ["title", "author", "translator", "publisher"];
const MAX_LEN = 200;

function cleanText(v) {
  if (v == null) return null;
  const s = String(v).replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
  return s ? s : null;
}

function validate(input) {
  const book = {};
  const digits = String(input.number ?? "").trim().replace(/[۰-۹]/g, (d) => d.charCodeAt(0) - 0x06f0).replace(/[٠-٩]/g, (d) => d.charCodeAt(0) - 0x0660);
  if (!/^\d{1,6}$/.test(digits) || Number(digits) < 1) return { error: "شماره کتاب باید یک عدد مثبت باشد." };
  book.number = Number(digits);
  for (const f of TEXT_FIELDS) {
    book[f] = cleanText(input[f]);
    if (book[f] && book[f].length > MAX_LEN) return { error: `متن «${f}» بیش از ${MAX_LEN} نویسه است.` };
  }
  if (!book.title) return { error: "عنوان کتاب لازم است." };
  return { book };
}

function nextId(books) {
  const max = books.reduce((m, b) => Math.max(m, Number(/^LIB-(\d+)$/.exec(b.id)?.[1] ?? 0)), 0);
  return `LIB-${String(max + 1).padStart(4, "0")}`;
}

export default async function handler(req, res) {
  if (!isAdmin(req)) return fail(res, 401, "sign in required");

  if (req.method === "GET") {
    try {
      const { data, version } = await current(origin(req));
      return send(res, 200, { data, version }, NO_STORE);
    } catch (e) {
      console.error("admin read:", e.message);
      return fail(res, 500, "catalog unavailable");
    }
  }
  if (req.method !== "POST") return fail(res, 405, "method not allowed");
  if (!sameOrigin(req)) return fail(res, 403, "forbidden");

  let body;
  try {
    body = await readJson(req);
  } catch (e) {
    return fail(res, e.status || 400, "bad request");
  }

  try {
    const { data, version } = await current(origin(req));
    if ((body.version ?? null) !== (version ?? null)) throw new ConflictError();
    const books = [...data.books];
    let changed;

    if (body.action === "delete") {
      const i = books.findIndex((b) => b.id === body.id);
      if (i < 0) return fail(res, 404, "کتاب پیدا نشد.");
      [changed] = books.splice(i, 1);
    } else if (body.action === "add" || body.action === "update") {
      const { book, error } = validate(body.book || {});
      if (error) return fail(res, 422, error);
      if (body.action === "add") {
        changed = { id: nextId(books), ...book };
        books.push(changed);
      } else {
        const i = books.findIndex((b) => b.id === body.book?.id);
        if (i < 0) return fail(res, 404, "کتاب پیدا نشد.");
        changed = { id: books[i].id, ...book };
        books[i] = changed;
      }
    } else {
      return fail(res, 400, "unknown action");
    }

    books.sort((a, b) => a.number - b.number || a.id.localeCompare(b.id));
    const next = { updated: new Date().toISOString(), count: books.length, books };
    if (data.exported) next.exported = data.exported;
    const newVersion = await writeSaved(next, version);
    await notify(["/"]); // the catalog lives on the homepage; let Bing know it changed (production only)
    send(res, 200, { data: next, version: newVersion, changed }, NO_STORE);
  } catch (e) {
    if (e instanceof ConflictError) return fail(res, 409, "conflict");
    if (e instanceof StorageMissingError) return fail(res, 503, "storage not connected");
    console.error("admin write:", e.message);
    fail(res, 500, "save failed");
  }
}
