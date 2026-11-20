// The school's Supabase database: a server-side record of borrow requests (table public.library_borrow_requests,
// row level security on with no policies, so only this server's secret key can read or write it).
// Optional: with SUPABASE_URL and SUPABASE_SECRET_KEY unset, requests still go to Telegram and nothing is saved.
const url = () => (process.env.SUPABASE_URL || "").trim().replace(/\/+$/, "");
const key = () => (process.env.SUPABASE_SECRET_KEY || "").trim();
export const configured = () => /^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(url()) && Boolean(key());

async function rest(path, body) {
  const res = await fetch(`${url()}/rest/v1/${path}`, {
    method: "POST",
    headers: { apikey: key(), Authorization: `Bearer ${key()}`, "Content-Type": "application/json", Prefer: "return=minimal" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) throw new Error(`supabase ${path}: ${res.status}`); // the status only: the body may echo the row
}

/** Saves one borrow request. */
export const saveRequest = (row) => rest("library_borrow_requests", row);

/** Deletes requests past their retention date (the end of the school year they were made in). */
export const purgeExpired = () => rest("rpc/library_purge_expired_requests", {});
