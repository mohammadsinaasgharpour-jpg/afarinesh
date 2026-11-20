// Admin panel: sign in, browse the three kinds of forms, search, open one record, set its status and note.
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const fa = (v) => String(v ?? "").replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[d]);

const LABELS = {
  fullName: "نام دانش‌آموز", nationalId: "کد ملی", birthDate: "تاریخ تولد", studentMobile: "همراه دانش‌آموز", address: "نشانی",
  motherName: "نام مادر", motherEducation: "تحصیلات مادر", motherJob: "شغل مادر", motherMobile: "همراه مادر",
  fatherName: "نام پدر", fatherEducation: "تحصیلات پدر", fatherJob: "شغل پدر", fatherMobile: "همراه پدر",
  currentSchool: "مدرسه‌ی فعلی", grade: "پایه", gpa: "معدل / نمره", gpaDescriptive: "نمره‌ی توصیفی", discipline: "انضباط", referral: "نحوه‌ی آشنایی",
  parentName: "نام ولی", phone: "شماره تماس", message: "پیام", field: "رشته", degree: "مقطع", experience: "سابقه‌ی تدریس",
};
const GRADE = { 7: "هفتم", 8: "هشتم", 9: "نهم" };
const STATUS = { new: "جدید", called: "تماس گرفته شد", interview: "مصاحبه", accepted: "پذیرفته", rejected: "رد شد" };
const KIND = { preRegistration: "پیش‌ثبت‌نام", inquiry: "درخواست تماس", career: "همکاری" };
const COLUMNS = {
  preRegistration: [["fullName"], ["grade"], ["fatherMobile"], ["motherMobile"], ["currentSchool"]],
  inquiry: [["parentName"], ["phone"], ["grade"], ["message"]],
  career: [["fullName"], ["field"], ["degree"], ["phone"]],
};

let all = [];
let kind = "preRegistration";

const api = async (url, options = {}) => {
  const res = await fetch(url, { credentials: "same-origin", ...options });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(body.error || "error"), { status: res.status });
  return body;
};
const value = (k, v) => (k === "grade" ? GRADE[v] ?? v : fa(v));
const when = (iso) => { try { return new Intl.DateTimeFormat("fa-IR", { timeZone: "Asia/Tehran", dateStyle: "medium", timeStyle: "short" }).format(new Date(iso)); } catch { return iso; } };

function show(which) {
  $("#login-card").classList.toggle("hidden", which !== "login");
  $("#records-card").classList.toggle("hidden", which !== "records");
  $("#logout").classList.toggle("hidden", which !== "records");
}

function render() {
  const q = $("#q").value.trim().replace(/[۰-۹]/g, (d) => "۰۱۲۳۴۵۶۷۸۹".indexOf(d));
  const status = $("#status-filter").value;
  const rows = all.filter((r) => r.kind === kind && (!status || r.status === status) && (!q || JSON.stringify(r.data).includes(q) || (r.note || "").includes(q)));
  for (const k of Object.keys(KIND)) $(`[data-count="${k}"]`).textContent = fa(all.filter((r) => r.kind === k).length);
  const cols = COLUMNS[kind];
  const head = document.createElement("tr");
  for (const label of ["زمان", ...cols.map(([k]) => LABELS[k]), "وضعیت"]) { const th = document.createElement("th"); th.textContent = label; head.append(th); }
  $("#table thead").replaceChildren(head);
  $("#table tbody").replaceChildren(...rows.map((r) => {
    const tr = document.createElement("tr");
    tr.tabIndex = 0;
    const cells = [when(r.receivedAt), ...cols.map(([k]) => value(k, r.data[k])), STATUS[r.status] ?? r.status];
    cells.forEach((text, i) => { const td = document.createElement("td"); td.textContent = text; if (i === cells.length - 1) td.className = `st st-${r.status}`; tr.append(td); });
    tr.addEventListener("click", () => openRecord(r));
    tr.addEventListener("keydown", (e) => { if (e.key === "Enter") openRecord(r); });
    return tr;
  }));
  $("#empty").classList.toggle("hidden", rows.length > 0);
  $("#csv").href = `/api/admin?action=csv&kind=${kind}`;
}

function openRecord(r) {
  $("#detail-title").textContent = `${KIND[r.kind] ?? r.kind} — ${when(r.receivedAt)}`;
  const dl = $("#detail-fields");
  dl.replaceChildren();
  for (const [k, v] of Object.entries(r.data)) {
    if (v === "" || v === null || v === undefined) continue;
    const dt = document.createElement("dt"); dt.textContent = LABELS[k] ?? k;
    const dd = document.createElement("dd"); dd.textContent = value(k, v);
    if (/Mobile$|^phone$/.test(k)) { const a = document.createElement("a"); a.href = `tel:${v}`; a.textContent = fa(v); a.dir = "ltr"; dd.replaceChildren(a); }
    dl.append(dt, dd);
  }
  $("#detail-status").value = r.status;
  $("#detail-note").value = r.note || "";
  $("#detail-saved").textContent = "";
  $("#detail-save").onclick = async () => {
    try {
      await api("/api/admin?action=update", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: r.id, status: $("#detail-status").value, note: $("#detail-note").value }) });
      r.status = $("#detail-status").value; r.note = $("#detail-note").value;
      $("#detail-saved").textContent = "ذخیره شد.";
      render();
    } catch { $("#detail-saved").textContent = "ذخیره نشد؛ دوباره امتحان کنید."; }
  };
  $("#detail").showModal();
}

async function load() {
  const body = await api("/api/admin");
  all = body.records || [];
  show("records");
  const id = new URLSearchParams(location.search).get("record");
  const target = id && all.find((r) => r.id === id);
  if (target) { kind = target.kind; selectTab(); openRecord(target); }
  render();
}

function selectTab() { for (const b of $$("[data-kind]")) b.setAttribute("aria-selected", String(b.dataset.kind === kind)); }
for (const b of $$("[data-kind]")) b.addEventListener("click", () => { kind = b.dataset.kind; selectTab(); render(); });
$("#q").addEventListener("input", render);
$("#status-filter").addEventListener("change", render);
$("#login-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  $("#login-error").textContent = "";
  try {
    await api("/api/admin?action=login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password: $("#password").value }) });
    $("#password").value = "";
    await load();
  } catch (err) {
    $("#login-error").textContent = err.status === 429 ? "چند بار رمز اشتباه وارد شد؛ ۱۵ دقیقه بعد دوباره امتحان کنید." : "رمز نادرست است.";
  }
});
$("#logout").addEventListener("click", async () => { await api("/api/admin?action=logout", { method: "POST" }).catch(() => {}); all = []; show("login"); });
load().catch((err) => {
  show("login");
  if (err.status === 503) $("#login-error").textContent = "پنل هنوز پیکربندی نشده است.";
  else if (err.status !== 401) $("#login-error").textContent = "ارتباط با سرور برقرار نشد.";
});
