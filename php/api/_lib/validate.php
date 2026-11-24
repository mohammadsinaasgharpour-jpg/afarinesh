<?php
// PHP port of public/assets/js/validate.js: the server rejects the same input, with the same message, as the
// browser. Keep the two in step; tests/php-parity.test.mjs compares them on the same cases.
declare(strict_types=1);

const FA_DIGITS = '۰۱۲۳۴۵۶۷۸۹';
const AR_DIGITS = '٠١٢٣٤٥٦٧٨٩';
const LIMITS = ['nameMin' => 3, 'nameMax' => 60, 'messageMax' => 500, 'shortMax' => 80, 'addressMax' => 250];
const NAME_ERR = 'نام و نام خانوادگی را کامل و به فارسی بنویسید.';
const PERSIAN_LETTERS = '/^[ء-غف-يپچژکگۀیٔ‌ ]+$/u';
const KEY_ROWS = ['ضصثقفغعهخحجچ', 'شسیبلاتنمکگ', 'ظطزرذدپو'];
const GRADE_LABEL = ['7' => 'هفتم', '8' => 'هشتم', '9' => 'نهم'];
const EDUCATION = ['سیکل', 'دیپلم', 'فوق دیپلم', 'لیسانس', 'فوق لیسانس', 'دکتری', 'فوق دکتری'];
const GPA_DESCRIPTIVE = ['خیلی خوب', 'خوب', 'قابل قبول', 'نیاز به تلاش بیشتر'];
const DISCIPLINE = ['عالی', 'خیلی خوب', 'خوب', 'نیاز به تلاش بیشتر'];
const REFERRAL = ['جستجو در اینترنت', 'دبیران', 'مسئولین مدارس', 'دوستان و آشنایان'];
const DEGREES = ['کارشناسی', 'کارشناسی ارشد', 'دکتری'];
const EXPERIENCE = ['زیر ۵ سال', 'بالای ۵ سال'];
const MONTHS = ['فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور', 'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند'];
const BIRTH_MIN = 1380;
const BIRTH_MAX = 1400;

function v_scalar($value): string { return is_string($value) || is_int($value) || is_float($value) ? (string)$value : ''; }
function v_len(string $s): int { return mb_strlen($s, 'UTF-8'); }
function v_slice(string $s, int $n): string { return mb_substr($s, 0, $n, 'UTF-8'); }

function to_latin_digits($value): string {
  return preg_replace_callback('/[۰-۹٠-٩]/u', function ($m) {
    $i = mb_strpos(FA_DIGITS, $m[0]);
    return (string)($i !== false ? $i : mb_strpos(AR_DIGITS, $m[0]));
  }, v_scalar($value));
}
function to_persian_digits($value): string {
  return preg_replace_callback('/\d/', fn($m) => mb_substr(FA_DIGITS, (int)$m[0], 1), (string)$value);
}

function clean_text($value, bool $multiline = false): string {
  $s = v_scalar($value);
  if (class_exists('Normalizer')) $s = Normalizer::normalize($s, Normalizer::FORM_C) ?: $s;
  $s = preg_replace('/[\x{0000}-\x{0008}\x{000B}\x{000C}\x{000E}-\x{001F}\x{007F}-\x{009F}\x{200B}\x{200D}-\x{200F}\x{202A}-\x{202E}\x{2060}-\x{2069}\x{FEFF}]/u', '', $s) ?? '';
  $s = preg_replace('/[<>{}\\\\]/u', '', $s);
  $s = $multiline
    ? preg_replace(['/\r\n?/u', '/[ \t]+/u', '/\n{3,}/u'], ["\n", ' ', "\n\n"], $s)
    : preg_replace('/\s+/u', ' ', $s);
  return trim($s);
}

function normalize_mobile($value): ?string {
  $v = preg_replace('/[\s\-()]/u', '', to_latin_digits($value));
  if (str_starts_with($v, '+98')) $v = '0' . substr($v, 3);
  elseif (str_starts_with($v, '0098')) $v = '0' . substr($v, 4);
  elseif (str_starts_with($v, '98') && strlen($v) === 12) $v = '0' . substr($v, 2);
  elseif (str_starts_with($v, '9') && strlen($v) === 10) $v = '0' . $v;
  if (!preg_match('/^09\d{9}$/', $v)) return null;
  if (preg_match('/^09(\d)\1{8}$/', $v) || $v === '09123456789') return null;
  return $v;
}
function normalize_phone($value): ?string {
  $m = normalize_mobile($value);
  if ($m) return $m;
  $v = preg_replace('/[\s\-()]/u', '', to_latin_digits($value));
  if (str_starts_with($v, '+98')) $v = '0' . substr($v, 3);
  return preg_match('/^0[1-8]\d{9}$/', $v) ? $v : null;
}

function is_valid_national_id($value): bool {
  $v = preg_replace('/\D/', '', to_latin_digits($value));
  if (!preg_match('/^\d{10}$/', $v) || preg_match('/^(\d)\1{9}$/', $v)) return false;
  $sum = 0;
  for ($i = 0; $i < 9; $i++) $sum += (int)$v[$i] * (10 - $i);
  $sum %= 11;
  $check = (int)$v[9];
  return $sum < 2 ? $check === $sum : $check === 11 - $sum;
}

function is_jalali_leap(int $y): bool { return in_array((($y % 33) + 33) % 33, [1, 5, 9, 13, 17, 22, 26, 30], true); }
function jalali_month_days(int $y, int $m): int { return $m <= 6 ? 31 : ($m <= 11 ? 30 : (is_jalali_leap($y) ? 30 : 29)); }
function normalize_jalali_date($value): ?string {
  $s = preg_replace('/[-.\s]/u', '/', trim(to_latin_digits($value)));
  if (!preg_match('/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/', $s, $m)) return null;
  [$y, $mo, $d] = [(int)$m[1], (int)$m[2], (int)$m[3]];
  if ($y < BIRTH_MIN || $y > BIRTH_MAX || $mo < 1 || $mo > 12 || $d < 1) return null;
  if ($d > jalali_month_days($y, $mo)) return null;
  return sprintf('%d/%02d/%02d', $y, $mo, $d);
}

function looks_like_name(string $s): bool { return !preg_match('/https?:|www\.|@/iu', $s); }
function is_persian_name(string $s): bool { return (bool)preg_match(PERSIAN_LETTERS, $s) && !preg_match('/(.)\1\1/u', preg_replace('/[ ‌]/u', '', $s)); }
function is_full_persian_name(string $s): bool {
  if (!is_persian_name($s)) return false;
  return count(array_filter(preg_split('/[ ‌]+/u', $s), fn($w) => v_len($w) >= 2)) >= 2;
}
function is_persian_text(string $s): bool { return (bool)preg_match('/[ء-ی]/u', $s) && !preg_match('/[A-Za-z]/', $s); }
function letters_only(string $s): string { return preg_replace('/[^ء-یپچژکگ]/u', '', $s); }
function mb_rev(string $s): string { return implode('', array_reverse(mb_str_split($s))); }

function looks_like_gibberish($value): bool {
  $s = v_scalar($value);
  $letters = letters_only($s);
  if ($letters === '') return false;
  if (preg_match('/(.)\1\1/u', $letters) || preg_match('/(.{2,3})\1\1/u', $letters)) return true;
  foreach (KEY_ROWS as $row) {
    foreach ([$row, mb_rev($row)] as $line) {
      $n = v_len($line);
      for ($i = 0; $i + 4 <= $n; $i++) if (mb_strpos($letters, mb_substr($line, $i, 4)) !== false) return true;
    }
  }
  foreach (preg_split('/[\s‌،,.\-\/]+/u', $s) as $w) {
    $word = letters_only($w);
    if (v_len($word) >= 7 && !preg_match('/[اآویهئأؤ]/u', $word)) return true;
    if (v_len($word) >= 4 && preg_match('/^(.{1,3})\1+$/u', $word)) return true;
  }
  return false;
}

function v_result(array $errors, array $value): array {
  $errors = array_filter($errors, fn($e) => $e !== '' && $e !== null);
  return $errors ? ['ok' => false, 'errors' => $errors] : ['ok' => true, 'value' => $value];
}
function v_choice($value, array $list): string { $s = v_scalar($value); return in_array($s, $list, true) ? $s : ''; }
function v_consent($v): bool { return $v === true || $v === 'on' || $v === 'true'; }

function validate_inquiry(array $in): array {
  $e = [];
  $parentName = clean_text($in['parentName'] ?? '');
  $phone = normalize_mobile($in['phone'] ?? '');
  $grade = v_scalar($in['grade'] ?? '');
  $message = clean_text($in['message'] ?? '', true);
  if (v_len($parentName) > LIMITS['nameMax']) $e['parentName'] = 'نام حداکثر ' . to_persian_digits(LIMITS['nameMax']) . ' حرف است.';
  elseif (v_len($parentName) < LIMITS['nameMin'] || !is_full_persian_name($parentName)) $e['parentName'] = NAME_ERR;
  if (!$phone) $e['phone'] = 'شماره همراه ۱۱ رقمی را با ۰۹ شروع کنید؛ مثلاً ۰۹۱۷۱۲۳۴۵۶۷.';
  if (!in_array($grade, ['7', '8', '9'], true)) $e['grade'] = 'یکی از پایه‌ها را انتخاب کنید.';
  if (v_len($message) > LIMITS['messageMax']) $e['message'] = 'پیام حداکثر ' . to_persian_digits(LIMITS['messageMax']) . ' حرف است.';
  elseif (preg_match('/https?:|www\./iu', $message)) $e['message'] = 'لطفاً پیام را بدون لینک بنویسید.';
  elseif ($message !== '' && !is_persian_text($message)) $e['message'] = 'لطفاً پیام را به فارسی بنویسید.';
  return v_result($e, ['parentName' => $parentName, 'phone' => $phone, 'grade' => $grade, 'message' => $message]);
}

const LANGUAGES = ['انگلیسی', 'فرانسه', 'ترکی', 'آلمانی', 'سایر زبان‌ها'];
const AGE_GROUPS = ['کودک', 'نوجوان', 'بزرگسال'];
const COURSE_TYPES = ['دوره‌ی عمومی (گروهی)', 'کلاس خصوصی'];

/** Gandom language school sign-up; the PHP twin of validateLanguage in validate.js. */
function validate_language(array $in): array {
  $e = [];
  $fullName = mb_substr(clean_text($in['fullName'] ?? ''), 0, LIMITS['nameMax'] + 1);
  $phone = normalize_mobile($in['phone'] ?? '') ?? '';
  $language = v_choice($in['language'] ?? '', LANGUAGES);
  $ageGroup = v_choice($in['ageGroup'] ?? '', AGE_GROUPS);
  $courseType = v_choice($in['courseType'] ?? '', COURSE_TYPES);
  $message = clean_text($in['message'] ?? '', true);
  $consent = v_consent($in['consent'] ?? false);
  if (v_len($fullName) < LIMITS['nameMin'] || v_len($fullName) > LIMITS['nameMax'] || !is_full_persian_name($fullName)) $e['fullName'] = NAME_ERR;
  if (!$phone) $e['phone'] = 'شماره همراه ۱۱ رقمی را با ۰۹ شروع کنید؛ مثلاً ۰۹۱۷۱۲۳۴۵۶۷.';
  if ($language === '') $e['language'] = 'زبان مورد نظر را انتخاب کنید.';
  if ($ageGroup === '') $e['ageGroup'] = 'گروه سنی زبان‌آموز را انتخاب کنید.';
  if ($courseType === '') $e['courseType'] = 'نوع کلاس را انتخاب کنید.';
  if (v_len($message) > LIMITS['messageMax']) $e['message'] = 'توضیح حداکثر ' . to_persian_digits(LIMITS['messageMax']) . ' حرف است.';
  elseif (preg_match('/https?:|www./iu', $message)) $e['message'] = 'لطفاً توضیح را بدون لینک بنویسید.';
  elseif ($message !== '' && !is_persian_text($message)) $e['message'] = 'لطفاً توضیح را به فارسی بنویسید.';
  if (!$consent) $e['consent'] = 'برای ثبت، موافقت با استفاده از اطلاعات برای تماس لازم است.';
  return v_result($e, ['fullName' => $fullName, 'phone' => $phone, 'language' => $language, 'ageGroup' => $ageGroup, 'courseType' => $courseType, 'message' => $message, 'consent' => $consent]);
}

const FEMALE_NAMES = 'مریم فاطمه زهرا زینب معصومه سمیه طاهره طیبه سکینه رقیه خدیجه اعظم اکرم اشرف اقدس منیژه منیره منصوره ملیحه ملیکا مهسا مهناز مهین مهری مهرنوش مینا نازنین نرگس نسرین نسیم نیلوفر نگار نگین پریسا پروانه پروین پری پوران ژاله ساره سارا سحر سمانه سیما سیمین شهلا شهناز شیرین شیما شبنم صدیقه صغری کبری عاطفه عفت فرشته فریبا فرزانه فرحناز فهیمه گلناز گلنار گلی لیلا لادن لاله الهام الهه آزاده آزیتا آتنا آرزو آمنه آناهیتا آیدا آیسان ارمیتا افسانه بهاره بهناز بیتا پگاه ترانه تینا حمیده حمیرا راحله راضیه رویا رها ریحانه زری زیبا سودابه سوسن سهیلا شکوفه شقایق صبا عذرا فائزه فاطیما کتایون کوثر لیدا مائده محبوبه مرضیه مژگان مهتاب مهدیس مهشید نجمه ندا نفیسه هانیه هما هدیه هستی یاسمن یگانه';
const MALE_NAMES = 'علی محمد حسین حسن رضا مهدی احمد محمود مصطفی مرتضی مجتبی جواد جعفر کاظم قاسم عباس اصغر اکبر ابراهیم اسماعیل یوسف یعقوب یحیی موسی عیسی داود سلیمان صادق باقر هادی امیر امین ایمان بهروز بهرام بیژن پرویز پیمان جمشید جهانگیر حمید حمیدرضا خسرو داریوش رامین رحیم رحمان روح‌الله سعید سجاد سهراب سیاوش شاهین شهرام شهریار عادل عبدالله عرفان عماد فرامرز فرهاد فرشید فریدون کامران کیوان کوروش مجید محسن مسعود منصور منوچهر میلاد ناصر نادر نوید نیما هومن وحید یاسر آرش آرین ابوالفضل احسان ارسلان اسفندیار افشین امیرحسین امیرعلی بابک بهزاد بهنام پوریا تورج جلال جمال حامد حمزه رسول رستم روزبه سامان سینا شاپور صالح عبدالرضا عمار غلامرضا غلامحسین فرزاد فرید قربان کریم کمال محمدرضا محمدحسین محمدعلی مهرداد مهران مهیار نصرالله نعمت‌الله هوشنگ یدالله';

function gender_error(string $name, string $label): string {
  $first = str_replace(['ي', 'ك'], ['ی', 'ک'], preg_split('/ +/u', $name)[0]);
  $female = in_array($first, explode(' ', FEMALE_NAMES), true);
  $male = in_array($first, explode(' ', MALE_NAMES), true);
  if ($label === 'پدر' && $female) return "«{$first}» نام زنانه است؛ نام و نام خانوادگی پدر را بنویسید (شاید جای نام پدر و مادر عوض شده باشد).";
  if ($label === 'مادر' && $male) return "«{$first}» نام مردانه است؛ نام و نام خانوادگی مادر را بنویسید (شاید جای نام پدر و مادر عوض شده باشد).";
  if ($label === 'دانش‌آموز' && $female) return "«{$first}» نام دخترانه است و آفرینش دبیرستان پسرانه است؛ نام دانش‌آموز را دوباره بررسی کنید.";
  return '';
}

function person_name_error(string $s, string $label): string {
  if (v_len($s) > LIMITS['nameMax']) return 'نام حداکثر ' . to_persian_digits(LIMITS['nameMax']) . ' حرف است.';
  if (preg_match('/[A-Za-z]/', $s)) return 'نام را با حروف فارسی بنویسید، نه انگلیسی.';
  if (preg_match('/[0-9۰-۹٠-٩]/u', $s)) return 'نام نباید عدد داشته باشد.';
  if (!preg_match(PERSIAN_LETTERS, $s)) return 'نام را فقط با حروف فارسی بنویسید؛ بدون علامت و نماد.';
  if (looks_like_gibberish($s)) return "این نام درست به نظر نمی‌رسد؛ نام واقعی {$label} را بنویسید.";
  $words = array_values(array_filter(preg_split('/[ ‌]+/u', $s), fn($w) => $w !== ''));
  $example = $label === 'مادر' ? 'مریم احمدی' : ($label === 'پدر' ? 'علی رضایی' : 'آرین رضایی');
  if (count($words) < 2) return "نام خانوادگی {$label} را هم بنویسید؛ مثلاً «{$example}».";
  foreach ($words as $w) if (v_len($w) < 2) return 'هر بخش نام دست‌کم دو حرف است؛ نام را کامل بنویسید.';
  return '';
}

function mobile_error($raw, string $label): string {
  $digits = preg_replace('/[\s\-()+]/u', '', to_latin_digits($raw));
  if ($digits === '') return "شماره‌ی همراه {$label} را بنویسید.";
  if (preg_match('/\D/', $digits)) return 'شماره را فقط با عدد بنویسید.';
  if (!preg_match('/^(0098|98|0)?9/', $digits)) return 'شماره‌ی همراه با ۰۹ شروع می‌شود.';
  if (preg_match('/^09\d{9}$/', $digits) || preg_match('/^9\d{9}$/', $digits)) return 'این شماره ساختگی به نظر می‌رسد؛ شماره‌ی واقعی را بنویسید.';
  return 'شماره‌ی همراه ۱۱ رقم است؛ شما ' . to_persian_digits(strlen($digits)) . ' رقم نوشته‌اید.';
}

function birth_date_error($raw, string $normalized): string {
  if ($normalized !== '') return '';
  $parts = array_values(array_filter(explode('/', to_latin_digits($raw)), fn($p) => $p !== ''));
  if (count($parts) < 3) return 'روز، ماه و سال تولد را از سه فهرست انتخاب کنید.';
  [$y, $m, $d] = array_map('intval', $parts);
  if ($y < BIRTH_MIN || $y > BIRTH_MAX) return 'سال تولد برای دانش‌آموز دوره اول متوسطه درست نیست؛ لطفاً دقت کنید.';
  if ($m >= 1 && $m <= 12) {
    $max = jalali_month_days($y, $m);
    if ($d > $max) return 'تاریخ اشتباه است؛ ماه ' . MONTHS[$m - 1] . ' ' . to_persian_digits($max) . ' روز دارد. لطفاً دقت کنید.';
  }
  return 'تاریخ اشتباه است؛ لطفاً دقت کنید.';
}

function grade_age_error(string $grade, string $birthDate): string {
  if ($birthDate === '') return '';
  $y = (int)substr($birthDate, 0, 4);
  $born = 1401 - (int)$grade;
  if ($y < $born - 2 || $y > $born + 1) return 'تاریخ تولد (' . to_persian_digits($y) . ') با پایه‌ی ' . GRADE_LABEL[$grade] . ' جور نیست؛ پایه یا تاریخ تولد را بررسی کنید.';
  return '';
}

function address_error(string $s, bool $noPlate = false): string {
  if ($s === '') return 'نشانی محل سکونت را بنویسید.';
  if (v_len($s) > LIMITS['addressMax']) return 'نشانی حداکثر ' . to_persian_digits(LIMITS['addressMax']) . ' حرف است.';
  if (preg_match('/[A-Za-z]/', $s)) return 'نشانی را به فارسی بنویسید، نه انگلیسی.';
  if (looks_like_gibberish($s)) return 'این نشانی درست به نظر نمی‌رسد؛ نشانی واقعی منزل را بنویسید.';
  $plain = trim(preg_replace('/\s+/u', ' ', preg_replace('/[‌،,.]/u', ' ', $s)));
  if (str_contains($plain, 'چنچنه خیابان نارون کوچه ی ۵ پلاک ۱۲') || preg_match('/کوچه\s*ی?\s*[۵5]\s*پلاک\s*[۱1][۲2]\s*واحد\s*[۳3]/u', $plain)) return 'این همان مثالِ فرم است؛ نشانی منزل خودتان را بنویسید.';
  if (preg_match('/نارون/u', $s) && preg_match('/(۱۴|14)/u', $s) && !preg_match('/پلاک/u', preg_replace('/کوچه[‌ی\s]*(۱۴|14)/u', '', $s))) return 'این نشانی خود مدرسه است؛ نشانی منزل را بنویسید.';
  if (!preg_match('/^(شیراز|شهر شیراز|صدرا|شهر صدرا)/u', $plain)) return 'نشانی را با نام شهر شروع کنید؛ مثلاً «شیراز، ...».';
  if (!preg_match('/(خیابان|خ\.|بلوار|بولوار|بزرگراه|اتوبان|میدان|جاده|شهرک|فلکه|چهارراه)/u', $s)) return 'نام خیابان یا بلوار را بنویسید؛ مثلاً «خیابان زند».';
  if (!preg_match('/(کوچه|ک\.|بن‌بست|بن بست|بنبست|کوی|نبش|فرعی)/u', $s)) return 'کوچه را بنویسید؛ مثلاً «کوچه‌ی ۸» (اگر کوچه ندارد، «نبش» یا «بن‌بست» را بنویسید).';
  if ($noPlate) return v_len(letters_only($s)) < 20 ? 'ساختمان پلاک ندارد؛ نشانه‌ای بنویسید که خانه را پیدا کنیم، مثلاً «روبه‌روی نانوایی، درِ سبز».' : '';
  if (!preg_match('/(پلاک|پ\.)\s*[‌ی]?\s*[0-9۰-۹]/u', $s)) return 'پلاک را با عدد بنویسید؛ مثلاً «پلاک ۲۴» (اگر ساختمان پلاک ندارد، گزینه‌ی زیر را بزنید).';
  return '';
}

function job_error(string $s, string $label): string {
  if (v_len($s) > LIMITS['shortMax']) return 'شغل حداکثر ' . to_persian_digits(LIMITS['shortMax']) . ' حرف است.';
  if (!looks_like_name($s)) return 'شغل را بدون لینک بنویسید.';
  if (preg_match('/[A-Za-z]/', $s)) return 'شغل را به فارسی بنویسید، نه انگلیسی.';
  if (preg_match('/[0-9۰-۹٠-٩]/u', $s)) return 'شغل نباید عدد داشته باشد.';
  if (!is_persian_text($s) || v_len(letters_only($s)) < 2) return "شغل {$label} را به فارسی بنویسید؛ مثلاً «معلم» یا «کارمند».";
  if (looks_like_gibberish($s)) return "این شغل درست به نظر نمی‌رسد؛ شغل واقعی {$label} را بنویسید.";
  return '';
}

function school_error(string $s): string {
  if ($s === '') return 'نام مدرسه‌ای را که فرزندتان امسال در آن درس می‌خواند بنویسید.';
  if (v_len($s) > LIMITS['shortMax']) return 'نام مدرسه حداکثر ' . to_persian_digits(LIMITS['shortMax']) . ' حرف است.';
  if (preg_match('/[A-Za-z]/', $s)) return 'نام مدرسه را به فارسی بنویسید.';
  if (preg_match('/آفرینش/u', $s)) return 'آفرینش مدرسه‌ای است که در آن ثبت‌نام می‌کنید؛ نام مدرسه‌ی فعلی فرزندتان را بنویسید.';
  if (!is_persian_text($s) || v_len(letters_only($s)) < 3) return 'نام مدرسه را کامل بنویسید؛ مثلاً «دبستان شهید دستغیب».';
  if (looks_like_gibberish($s)) return 'این نام مدرسه درست به نظر نمی‌رسد؛ نام واقعی مدرسه را بنویسید.';
  return '';
}

function validate_pre_registration(array $in): array {
  $e = [];
  $text = fn(string $k, int $max = LIMITS['shortMax']) => v_slice(clean_text($in[$k] ?? ''), $max + 1);
  $grade = v_scalar($in['grade'] ?? '');
  $v = [
    'fullName' => $text('fullName'),
    'nationalId' => preg_replace('/\D/', '', to_latin_digits($in['nationalId'] ?? '')),
    'birthDate' => normalize_jalali_date($in['birthDate'] ?? '') ?? '',
    'studentMobile' => normalize_mobile($in['studentMobile'] ?? '') ?? '',
    'address' => $text('address', LIMITS['addressMax']),
    'motherName' => $text('motherName'),
    'fatherName' => $text('fatherName'),
    'motherEducation' => v_choice($in['motherEducation'] ?? '', EDUCATION),
    'fatherEducation' => v_choice($in['fatherEducation'] ?? '', EDUCATION),
    'motherJob' => $text('motherJob'),
    'fatherJob' => $text('fatherJob'),
    'motherMobile' => normalize_mobile($in['motherMobile'] ?? '') ?? '',
    'fatherMobile' => normalize_mobile($in['fatherMobile'] ?? '') ?? '',
    'currentSchool' => $text('currentSchool'),
    'gpa' => preg_replace('/[٫\/,،]/u', '.', trim(to_latin_digits($in['gpa'] ?? '')), 1),
    'gpaDescriptive' => v_choice($in['gpaDescriptive'] ?? '', GPA_DESCRIPTIVE),
    'discipline' => v_choice($in['discipline'] ?? '', DISCIPLINE),
    'grade' => in_array($grade, ['7', '8', '9'], true) ? $grade : '',
    'referral' => v_choice($in['referral'] ?? '', REFERRAL),
    'noPlate' => v_consent($in['noPlate'] ?? null),
    'consent' => v_consent($in['consent'] ?? null),
  ];

  if ($v['fullName'] === '') $e['fullName'] = 'نام و نام خانوادگی دانش‌آموز را بنویسید.';
  else $e['fullName'] = person_name_error($v['fullName'], 'دانش‌آموز') ?: gender_error($v['fullName'], 'دانش‌آموز');
  if ($v['nationalId'] === '') $e['nationalId'] = 'کد ملی دانش‌آموز را بنویسید.';
  elseif (strlen($v['nationalId']) !== 10) $e['nationalId'] = 'کد ملی ۱۰ رقم است؛ شما ' . to_persian_digits(strlen($v['nationalId'])) . ' رقم نوشته‌اید.';
  elseif (!is_valid_national_id($v['nationalId'])) $e['nationalId'] = 'این کد ملی معتبر نیست؛ رقم‌ها را از روی کارت ملی یا شناسنامه دوباره بررسی کنید.';
  $e['birthDate'] = birth_date_error($in['birthDate'] ?? '', $v['birthDate']);
  if ($v['studentMobile'] === '') $e['studentMobile'] = mobile_error($in['studentMobile'] ?? '', 'دانش‌آموز');
  $e['address'] = address_error($v['address'], $v['noPlate']);

  foreach ([['motherName', 'motherJob', 'motherMobile', 'مادر'], ['fatherName', 'fatherJob', 'fatherMobile', 'پدر']] as [$name, $job, $mobile, $label]) {
    if ($v[$name] === '') $e[$name] = "نام و نام خانوادگی {$label} را بنویسید.";
    else $e[$name] = person_name_error($v[$name], $label) ?: gender_error($v[$name], $label);
    if (!$e[$name] && $v[$name] === $v['fullName']) $e[$name] = "این نام دانش‌آموز است؛ نام و نام خانوادگی {$label} را بنویسید.";
    if ($v[$job] !== '') $e[$job] = job_error($v[$job], $label);
    if ($v[$mobile] === '') $e[$mobile] = mobile_error($in[$mobile] ?? '', $label);
    elseif ($v[$mobile] === $v['studentMobile']) $e[$mobile] = "این همان شماره‌ی دانش‌آموز است؛ شماره‌ی همراه خودِ {$label} را بنویسید.";
  }
  if (empty($e['fatherName']) && empty($e['motherName']) && $v['fatherName'] === $v['motherName']) $e['fatherName'] = 'نام پدر و مادر یکی نوشته شده است؛ لطفاً دقت کنید.';
  if (empty($e['fatherMobile']) && empty($e['motherMobile']) && $v['fatherMobile'] === $v['motherMobile']) $e['fatherMobile'] = 'این شماره را برای مادر نوشته‌اید؛ شماره‌ی همراه خودِ پدر را بنویسید.';

  if ($v['grade'] === '') $e['grade'] = 'پایه‌ای را که فرزندتان در آن ثبت‌نام می‌کند انتخاب کنید.';
  else $e['grade'] = grade_age_error($v['grade'], $v['birthDate']);
  $e['currentSchool'] = school_error($v['currentSchool']);
  if ($v['grade'] === '7') {
    if ($v['gpaDescriptive'] === '') $e['gpaDescriptive'] = 'نمره‌ی توصیفی کارنامه‌ی پایه‌ی ششم را انتخاب کنید.';
    $v['gpa'] = $v['gpaDescriptive'];
  } elseif ($v['grade'] !== '') {
    $v['gpaDescriptive'] = '';
    $of = $v['grade'] === '8' ? 'هفتم' : 'هشتم';
    if ($v['gpa'] === '') $e['gpa'] = "معدل کارنامه‌ی پایه‌ی {$of} را بنویسید.";
    elseif (!preg_match('/^\d{1,2}(\.\d{1,2})?$/', $v['gpa'])) $e['gpa'] = 'معدل را فقط با عدد بنویسید؛ مثلاً ۱۹٫۵۰.';
    elseif ((float)$v['gpa'] > 20) $e['gpa'] = 'معدل بیشتر از ۲۰ نمی‌شود؛ لطفاً دقت کنید.';
    elseif ((float)$v['gpa'] < 10) $e['gpa'] = 'معدل قبولی دست‌کم ۱۰ است؛ عدد را دوباره بررسی کنید.';
  }
  if ($v['discipline'] === '') $e['discipline'] = 'نمره‌ی انضباط را انتخاب کنید.';
  if (!$v['consent']) $e['consent'] = 'برای ثبت، موافقت با استفاده از اطلاعات برای پذیرش لازم است.';
  return v_result($e, $v);
}

function validate_career(array $in): array {
  $e = [];
  $v = [
    'fullName' => v_slice(clean_text($in['fullName'] ?? ''), LIMITS['nameMax'] + 1),
    'field' => v_slice(clean_text($in['field'] ?? ''), LIMITS['shortMax'] + 1),
    'degree' => v_choice($in['degree'] ?? '', DEGREES),
    'experience' => v_choice($in['experience'] ?? '', EXPERIENCE),
    'phone' => normalize_phone($in['phone'] ?? '') ?? '',
    'consent' => v_consent($in['consent'] ?? null),
  ];
  $n = v_len($v['fullName']);
  if ($n < LIMITS['nameMin'] || $n > LIMITS['nameMax'] || !is_full_persian_name($v['fullName'])) $e['fullName'] = NAME_ERR;
  $f = v_len($v['field']);
  if ($f < 2 || $f > LIMITS['shortMax'] || !looks_like_name($v['field'])) $e['field'] = 'رشته‌ی تحصیلی را بنویسید.';
  elseif (!is_persian_text($v['field'])) $e['field'] = 'رشته‌ی تحصیلی را به فارسی بنویسید.';
  if ($v['degree'] === '') $e['degree'] = 'مقطع تحصیلی را انتخاب کنید.';
  if ($v['experience'] === '') $e['experience'] = 'سابقه‌ی تدریس را انتخاب کنید.';
  if ($v['phone'] === '') $e['phone'] = 'شماره‌ی همراه یا ثابت با پیش‌شماره را بنویسید.';
  if (!$v['consent']) $e['consent'] = 'برای ثبت، موافقت با استفاده از اطلاعات برای تماس لازم است.';
  return v_result($e, $v);
}
