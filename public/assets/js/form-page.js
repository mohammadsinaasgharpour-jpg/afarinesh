import { validatePreRegistration, validateCareer, toPersianDigits, GRADE_LABEL } from "./validate.js";
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
      ["مدرسه‌ی فعلی", v.currentSchool], ["معدل", fa(v.gpa) + (v.gpaDescriptive ? ` (${v.gpaDescriptive})` : "")],
      ["انضباط", v.discipline], ["پایه", GRADE_LABEL[v.grade]], ["نحوه‌ی آشنایی", v.referral],
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
