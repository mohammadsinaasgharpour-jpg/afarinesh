<?php
// The three forms (callback request, pre-registration, job application) share one hardened handler,
// the PHP twin of server/forms.mjs: same limits, same replies, same Telegram text.
declare(strict_types=1);
require_once __DIR__ . '/bootstrap.php';
require_once __DIR__ . '/validate.php';

const PER_FORM_HOURLY = 120;
const MIN_FILL_MS = 3000;

function form_spec(string $kind): array {
  $or = fn($v) => $v !== '' && $v !== null ? $v : 'ثبت نشده';
  return [
    'inquiry' => [
      'validate' => 'validate_inquiry', 'maxBytes' => 4096, 'perIp' => [5, 600], 'perKey' => [2, 3600], 'dedupe' => 'phone',
      'lines' => fn($r) => ['درخواست تماس تازه از سایت', "نام ولی: {$r['parentName']}", "شماره همراه: {$r['phone']}", 'پایه: ' . GRADE_LABEL[$r['grade']], $r['message'] !== '' ? "پیام: {$r['message']}" : null],
    ],
    'preRegistration' => [
      'validate' => 'validate_pre_registration', 'maxBytes' => 8192, 'perIp' => [4, 3600], 'perKey' => [3, 86400], 'dedupe' => 'nationalId',
      'lines' => fn($r) => [
        'پیش‌ثبت‌نام تازه، سال تحصیلی ۱۴۰۶-۱۴۰۷', '', '◼ دانش‌آموز', "نام: {$r['fullName']}",
        // the channel keeps its history and has its own members: identifiers stay in the database only
        'کد ملی: …' . to_persian_digits(substr($r['nationalId'], -4)) . ' (کامل در پنل مدیر)',
        "همراه دانش‌آموز: {$r['studentMobile']}", '', '◼ والدین',
        'مادر: ' . $or($r['motherName']) . ' | تحصیلات: ' . $or($r['motherEducation']) . ' | شغل: ' . $or($r['motherJob']) . " | همراه: {$r['motherMobile']}",
        'پدر: ' . $or($r['fatherName']) . ' | تحصیلات: ' . $or($r['fatherEducation']) . ' | شغل: ' . $or($r['fatherJob']) . " | همراه: {$r['fatherMobile']}",
        '', '◼ اطلاعات آموزشی', "مدرسه‌ی فعلی: {$r['currentSchool']}",
        $r['grade'] === '7' ? 'نمره‌ی توصیفی کارنامه‌ی ششم: ' . ($r['gpaDescriptive'] ?: $r['gpa']) : 'معدل پایه‌ی ' . ($r['grade'] === '8' ? 'هفتم' : 'هشتم') . ': ' . to_persian_digits($r['gpa']),
        "انضباط: {$r['discipline']}", 'پایه‌ی درخواستی: ' . GRADE_LABEL[$r['grade']], 'نحوه‌ی آشنایی: ' . $or($r['referral']),
      ],
    ],
    'career' => [
      'validate' => 'validate_career', 'maxBytes' => 4096, 'perIp' => [3, 3600], 'perKey' => [1, 86400], 'dedupe' => 'phone',
      'lines' => fn($r) => ['درخواست همکاری تازه از سایت', "نام: {$r['fullName']}", "رشته: {$r['field']}", "مقطع: {$r['degree']}", "سابقه‌ی تدریس: {$r['experience']}", "شماره تماس: {$r['phone']}"],
    ],
  ][$kind];
}

function format_record(string $kind, array $r, string $id, string $at, int $repeat, int $remaining): string {
  $spec = form_spec($kind);
  $lines = [];
  if ($repeat > 1) array_push($lines, '⚠ ارسال شماره‌ی ' . to_persian_digits($repeat) . ' با همین ' . ($spec['dedupe'] === 'nationalId' ? 'کد ملی' : 'شماره') . ' در ۲۴ ساعت گذشته؛ پیش از اقدام تلفنی بررسی شود.', '');
  $lines = array_merge($lines, array_filter($spec['lines']($r), fn($l) => $l !== null));
  array_push($lines, '', 'فرستنده تأیید نشده است؛ در اولین تماس، هویت ولی را بپرسید.', 'زمان: ' . fa_time($at), 'کد پیگیری: ' . substr($id, 0, 8));
  $tail = 'مشاهده‌ی کامل در پنل مدیر: ' . admin_record_url($id) . "\n" .
    'سهمیه‌ی باقی‌مانده (Usage remaining): ' . to_persian_digits($remaining) . ' از ' . to_persian_digits(PER_FORM_HOURLY) . ' فرم از این نوع در یک ساعت اخیر';
  return mb_substr(implode("\n", $lines), 0, 4000 - mb_strlen($tail) - 1) . "\n" . $tail;
}

function handle_form(string $kind): void {
  $spec = form_spec($kind);
  if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') out(405, ['error' => 'method_not_allowed'], ['Allow' => 'POST']);
  require_same_origin();
  [$ipLimit, $ipWindow] = $spec['perIp'];
  if (!rate_hit("ip:$kind:" . client_ip(), $ipLimit, $ipWindow)) out(429, ['error' => 'rate_limited'], ['Retry-After' => '600']);

  $body = read_json($spec['maxBytes']);
  // bots fill the hidden "website" field or post within seconds of loading the page; pretend success
  if (!empty($body['website'])) out(201, ['ok' => true]);
  $started = (float)($body['startedAt'] ?? 0);
  if ($started > 0 && microtime(true) * 1000 - $started < MIN_FILL_MS) out(201, ['ok' => true]);

  $result = ($spec['validate'])($body);
  if (!$result['ok']) out(422, ['error' => 'invalid', 'errors' => $result['errors']]);
  $value = $result['value'];
  unset($value['consent']);

  $pdo = db();
  $dedupe = hash('sha256', $kind . ':' . $value[$spec['dedupe']]);
  [$keyLimit, $keyWindow] = $spec['perKey'];
  $q = $pdo->prepare("SELECT COUNT(*) FROM submissions WHERE dedupe_key = ? AND created_at > UTC_TIMESTAMP() - INTERVAL ? SECOND");
  $q->execute([$dedupe, $keyWindow]);
  $seen = (int)$q->fetchColumn();
  if ($seen >= $keyLimit) out(429, ['error' => 'duplicate'], ['Retry-After' => '3600']);
  $q = $pdo->prepare("SELECT COUNT(*) FROM submissions WHERE kind = ? AND created_at > UTC_TIMESTAMP() - INTERVAL 1 HOUR");
  $q->execute([$kind]);
  $hour = (int)$q->fetchColumn();
  if ($hour >= PER_FORM_HOURLY) out(429, ['error' => 'rate_limited'], ['Retry-After' => '600']);

  $id = uuid4();
  $at = gmdate('c');
  $pdo->prepare("INSERT INTO submissions (id, kind, dedupe_key, data, created_at) VALUES (?, ?, ?, ?, UTC_TIMESTAMP())")
    ->execute([$id, $kind, $dedupe, json_encode($value, JSON_UNESCAPED_UNICODE)]);
  notify_staff(format_record($kind, $value, $id, $at, $seen + 1, max(0, PER_FORM_HOURLY - $hour - 1)));
  out(201, ['ok' => true, 'id' => $id]);
}
