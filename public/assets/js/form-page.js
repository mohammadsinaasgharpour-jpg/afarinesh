import { validatePreRegistration, validateCareer, toPersianDigits, GRADE_LABEL } from "./validate.js";
import { $, initChrome, createFormController } from "./common.js";

initChrome();

const form = $("[data-form]");
const fa = (v) => (v ? toPersianDigits(v) : "");

function initVoiceInput() {
  const button = $("[data-voice-for]");
  if (!button) return;
  const target = document.getElementById(button.dataset.voiceFor);
  const note = document.getElementById(`${button.dataset.voiceFor}-voice-note`);
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!target || !Recognition) { button.hidden = true; return; }
  let recognition;
  button.addEventListener("click", () => {
    if (recognition) { recognition.stop(); return; }
    recognition = new Recognition();
    recognition.lang = "fa-IR";
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    button.classList.add("is-listening");
    button.querySelector("span").textContent = "در حال شنیدن… دوباره بزنید برای توقف";
    if (note) note.textContent = "نشانی را واضح بگویید؛ پس از پایان، متن را بررسی کنید.";
    recognition.onresult = (event) => {
      const spoken = event.results[0]?.[0]?.transcript?.trim();
      if (spoken) target.value = `${target.value.trim()}${target.value.trim() ? "، " : ""}${spoken}`.slice(0, 250);
      target.dispatchEvent(new Event("input", { bubbles: true }));
    };
    recognition.onerror = () => { if (note) note.textContent = "تبدیل صدا انجام نشد؛ نشانی را دستی بنویسید."; };
    recognition.onend = () => {
      recognition = null;
      button.classList.remove("is-listening");
      button.querySelector("span").textContent = "گفتن نشانی با صدا";
    };
    recognition.start();
  });
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
