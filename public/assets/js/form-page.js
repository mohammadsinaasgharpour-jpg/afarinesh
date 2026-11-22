import { validatePreRegistration, validateCareer, toPersianDigits, GRADE_LABEL } from "./validate.js";
import { $, initChrome, createFormController } from "./common.js";

initChrome();

const form = $("[data-form]");
const fa = (v) => (v ? toPersianDigits(v) : "");

/**
 * The address said aloud: the microphone records up to 40 seconds, the site's server has Gemini write it down
 * (the browser's own speech recognition goes through Google servers that are blocked in Iran), and the text is
 * added to the field for the visitor to check.
 */
function initVoiceInput() {
  const button = $("[data-voice-for]");
  if (!button) return;
  const target = document.getElementById(button.dataset.voiceFor);
  const note = document.getElementById(`${button.dataset.voiceFor}-voice-note`);
  const label = button.querySelector("span");
  if (!target || !navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) { button.hidden = true; return; }
  const types = ["audio/webm;codecs=opus", "audio/ogg;codecs=opus", "audio/mp4", "audio/webm"];
  const mime = types.find((t) => MediaRecorder.isTypeSupported?.(t)) || "";
  const say = (text) => { if (note) note.textContent = text; };
  let rec = null, stopTimer;
  const reset = () => { rec = null; clearTimeout(stopTimer); button.classList.remove("is-listening", "is-busy"); button.disabled = false; label.textContent = "گفتن نشانی با صدا"; };
  button.addEventListener("click", async () => {
    if (rec) { rec.stop(); return; }
    let stream;
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } }); }
    catch { say("اجازه‌ی میکروفون داده نشد؛ نشانی را دستی بنویسید یا اجازه را از تنظیمات مرورگر بدهید."); return; }
    const chunks = [];
    rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
    rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
    rec.onstop = async () => {
      stream.getTracks().forEach((t) => t.stop());
      button.classList.remove("is-listening");
      button.classList.add("is-busy");
      button.disabled = true;
      label.textContent = "در حال نوشتن نشانی…";
      try {
        const blob = new Blob(chunks, { type: (rec?.mimeType || mime || "audio/webm").split(";")[0] });
        const res = await fetch("/api/transcribe", { method: "POST", headers: { "Content-Type": blob.type }, body: blob, signal: AbortSignal.timeout(45000) });
        const body = await res.json().catch(() => ({}));
        if (res.ok && body.text) {
          const now = target.value.trim();
          target.value = `${now}${now ? "، " : ""}${body.text}`.slice(0, 250);
          target.dispatchEvent(new Event("input", { bubbles: true }));
          say("نشانی نوشته شد؛ لطفاً آن را بخوانید و اگر لازم است اصلاح کنید.");
        } else say(body.error === "no_speech" ? "صدایی شنیده نشد؛ دوباره و کمی بلندتر بگویید." : body.error === "voice_not_configured" ? "گفتن نشانی با صدا هنوز راه‌اندازی نشده است؛ نشانی را دستی بنویسید." : "تبدیل صدا انجام نشد؛ دوباره امتحان کنید یا نشانی را دستی بنویسید.");
      } catch { say("تبدیل صدا انجام نشد؛ اتصال اینترنت را بررسی کنید یا نشانی را دستی بنویسید."); }
      reset();
    };
    rec.start();
    button.classList.add("is-listening");
    label.textContent = "در حال شنیدن… برای پایان دوباره بزنید";
    say("نشانی را آرام و واضح بگویید: شهر، خیابان، کوچه و پلاک.");
    stopTimer = setTimeout(() => rec?.state === "recording" && rec.stop(), 40000);
  });
}
/**
 * When the visitor stops typing the address, the site's server looks it up on a map of Shiraz and the result is
 * shown under the field. It is advice only: a street missing from the map never stops the form.
 */
function initMapCheck() {
  const box = $("[data-map-check]");
  const field = box && form.querySelector('[name="address"]');
  if (!field) return;
  let timer, ctrl, last = "";
  const show = (cls, html) => { box.className = `map-check ${cls}`; box.innerHTML = html; };
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  const check = async () => {
    const q = field.value.trim();
    if (q === last) return;
    last = q;
    ctrl?.abort();
    if (q.length < 12 || !/[؀-ۿ]/.test(q)) { show("", ""); return; }
    ctrl = new AbortController();
    try {
      const res = await fetch("/api/geocode", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ address: q }), signal: ctrl.signal });
      const r = await res.json();
      const link = r.lat ? ` <a href="https://neshan.org/maps/share/${r.lat},${r.lng}" target="_blank" rel="noopener">دیدن روی نقشه</a>` : "";
      if (r.found === "street") show("is-ok", `خیابان روی نقشه پیدا شد: ${esc(r.label)}.${link}`);
      else if (r.found === "area") show("is-ok", `«${esc(r.label)}» روی نقشه پیدا شد. همه‌ی کوچه‌ها روی نقشه نیستند؛ اگر بقیه‌ی نشانی درست است، ادامه دهید.${link}`);
      else if (r.found === "none") show("is-warn", "این نشانی روی نقشه پیدا نشد؛ نام خیابان و محله را بررسی کنید. اگر درست است، می‌توانید ادامه دهید.");
      else show("", "");
    } catch (e) { if (e.name !== "AbortError") show("", ""); }
  };
  // only after typing stops: a line appearing on blur would push the Next button away mid-tap on phones
  field.addEventListener("input", () => { clearTimeout(timer); timer = setTimeout(check, 1200); });
  form.addEventListener("reset", () => { last = ""; show("", ""); });
}

const PAGES = {
  preRegistration: {
    validate: validatePreRegistration,
    success: "پیش‌ثبت‌نام ثبت شد. معاونان مدرسه برای هماهنگی مصاحبه با شما تماس می‌گیرند.",
    review: (v) => [
      ["نام دانش‌آموز", v.fullName], ["کد ملی", fa(v.nationalId)], ["تاریخ تولد", fa(v.birthDate)],
      ["همراه دانش‌آموز", fa(v.studentMobile)], ["نشانی", v.address],
      ["مادر", [v.motherName, v.motherEducation, v.motherJob].filter(Boolean).join("، ")], ["همراه مادر", fa(v.motherMobile)],
      ["پدر", [v.fatherName, v.fatherEducation, v.fatherJob].filter(Boolean).join("، ")], ["همراه پدر", fa(v.fatherMobile)],
      ["پایه", GRADE_LABEL[v.grade]], ["مدرسه‌ی فعلی", v.currentSchool],
      v.grade === "7" ? ["نمره‌ی توصیفی", v.gpaDescriptive] : ["معدل", fa(v.gpa)],
      ["انضباط", v.discipline], ["نحوه‌ی آشنایی", v.referral],
    ],
  },
  career: {
    validate: validateCareer,
    success: "درخواست همکاری ثبت شد. همکاران ما در اولین فرصت با شما تماس می‌گیرند.",
    review: (v) => [["نام", v.fullName], ["رشته", v.field], ["مقطع", v.degree], ["سابقه‌ی تدریس", v.experience], ["شماره تماس", fa(v.phone)]],
  },
};

// personal identifiers (national ID, address) are never kept as a browser draft
createFormController({ form, ...PAGES[form.dataset.form] });
initVoiceInput();
initMapCheck();

// pre-registration: the report card asked for depends on the grade applied for
// (grade 7 comes from primary school, whose report card is descriptive only)
const gradeInputs = form.querySelectorAll('input[name="grade"]');
const gpaField = $("[data-gpa-field]", form);
const descField = $("[data-gpa-desc-field]", form);
if (gradeInputs.length && gpaField && descField) {
  const gpaLabel = $("[data-gpa-label]", form);
  const sync = () => {
    const g = form.querySelector('input[name="grade"]:checked')?.value;
    gpaField.hidden = !g || g === "7";
    descField.hidden = g !== "7";
    if (gpaLabel && g && g !== "7") gpaLabel.textContent = `معدل کارنامه‌ی پایه‌ی ${g === "8" ? "هفتم" : "هشتم"}`;
  };
  form.addEventListener("change", (e) => { if (e.target.name === "grade") sync(); });
  form.addEventListener("reset", () => setTimeout(sync, 0));
  sync();
}
