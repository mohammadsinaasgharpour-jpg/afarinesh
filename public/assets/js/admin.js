const $ = (s) => document.querySelector(s);
const loginCard = $("#login-card");
const recordsCard = $("#records-card");
const records = $("#records");
const showRecords = () => { loginCard.classList.add("hidden"); recordsCard.classList.remove("hidden"); };
const showLogin = () => { recordsCard.classList.add("hidden"); loginCard.classList.remove("hidden"); };
const api = async (url, options) => { const res = await fetch(url, { credentials: "same-origin", ...options }); const body = await res.json().catch(() => ({})); if (!res.ok) throw Object.assign(new Error(body.error || "خطا"), { status: res.status }); return body; };
function render(rows) {
  records.replaceChildren();
  if (!rows.length) { records.innerHTML = '<p class="muted">هنوز رکوردی پیدا نشد.</p>'; return; }
  for (const row of rows) {
    const card = document.createElement("article"); card.className = "record";
    const title = document.createElement("strong"); title.textContent = `${row.kind || "فرم"} — ${row.receivedAt || row.created_at || ""}`;
    const pre = document.createElement("pre"); pre.textContent = JSON.stringify(row, null, 2);
    card.append(title, pre); records.append(card);
  }
}
async function load() { const id = new URLSearchParams(location.search).get("record"); const body = await api(`/api/admin${id ? `?id=${encodeURIComponent(id)}` : ""}`); render(body.records || []); showRecords(); }
$("#login-form").addEventListener("submit", async (event) => { event.preventDefault(); $("#login-error").textContent = ""; try { await api("/api/admin?action=login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password: $("#password").value }) }); await load(); } catch { $("#login-error").textContent = "رمز نادرست است یا پنل هنوز پیکربندی نشده است."; } });
$("#logout").addEventListener("click", async () => { await api("/api/admin?action=logout", { method: "POST" }).catch(() => {}); showLogin(); });
load().catch((error) => { if (error.status !== 401) $("#records-error").textContent = "دریافت اطلاعات ممکن نشد."; });
