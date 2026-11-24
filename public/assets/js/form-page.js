import { validatePreRegistration, validateCareer, validateLanguage, toPersianDigits, GRADE_LABEL } from "./validate.js";
import { $, initChrome, createFormController } from "./common.js";

initChrome();

const form = $("[data-form]");
const fa = (v) => (v ? toPersianDigits(v) : "");

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
  language: {
    validate: validateLanguage,
    success: "ثبت‌نام شما در آموزشگاه زبان گندم رسید. همکاران آموزشگاه برای تعیین سطح و زمان کلاس با شما تماس می‌گیرند.",
    review: (v) => [["نام", v.fullName], ["شماره همراه", fa(v.phone)], ["زبان", v.language], ["گروه سنی", v.ageGroup], ["نوع کلاس", v.courseType], v.message ? ["توضیح", v.message] : null].filter(Boolean),
  },
  career: {
    validate: validateCareer,
    success: "درخواست همکاری ثبت شد. همکاران ما در اولین فرصت با شما تماس می‌گیرند.",
    review: (v) => [["نام", v.fullName], ["رشته", v.field], ["مقطع", v.degree], ["سابقه‌ی تدریس", v.experience], ["شماره تماس", fa(v.phone)]],
  },
};

// an unsent form is kept only encrypted, in this tab, for 30 minutes (secureDraft in common.js)
createFormController({ form, ...PAGES[form.dataset.form], secureKey: form.dataset.form });

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
