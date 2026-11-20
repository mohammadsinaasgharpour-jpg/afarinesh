<?php
// POST /library/api/request: a student asks to borrow a book. Stored with the school's other forms (the admin
// panel's «کتابخانه» tab) and announced to staff through the relay. Same checks as the earlier Node version.
declare(strict_types=1);
require __DIR__ . '/_lib/lib.php';

const GRADES = ['7' => 'هفتم', '8' => 'هشتم', '9' => 'نهم'];
if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') out(405, ['error' => 'method not allowed']);
require_same_origin();
if (!rate_hit('libip:' . client_ip(), 5, 600) || !rate_hit('liball', 60, 3600)) out(429, ['error' => 'rate_limited'], ['Retry-After' => '600']);
$body = read_json(4096);

$fake = function () { $due = time() + 7 * 86400; out(201, ['ok' => true, 'id' => substr(uuid4(), 0, 8), 'due' => gmdate('c', $due), 'dueLabel' => fa_date($due, true)]); };
if (!empty($body['website'])) $fake();
$started = (float)($body['startedAt'] ?? 0);
if (!$started || microtime(true) * 1000 - $started < 3000) $fake();

$tidy = fn($s) => trim(preg_replace('/\s+/u', ' ', preg_replace('/[\x{0000}-\x{001f}\x{007f}\x{202A}-\x{202E}\x{2066}-\x{2069}]/u', '', is_string($s) ? $s : '')));
$errors = [];
$name = $tidy($body['name'] ?? '');
if (mb_strlen($name) < 3 || mb_strlen($name) > 60 || !preg_match("/^[\\p{L}\\p{M}][\\p{L}\\p{M}\u{200C} .'-]*$/u", $name)) $errors['name'] = 'نام و نام خانوادگی را با حروف بنویسید.';
$grade = latin_digits($body['grade'] ?? '');
if (!isset(GRADES[$grade])) $errors['grade'] = 'پایه را انتخاب کنید.';
$className = $tidy($body['className'] ?? '');
if ($className === '' || mb_strlen($className) > 12 || !preg_match("/^[\\p{L}\\p{N}][\\p{L}\\p{N}\u{200C} \\/-]*$/u", $className)) $errors['className'] = 'کلاس را بنویسید (مثلاً ۲).';
$daysText = trim(latin_digits($body['days'] ?? ''));
$days = (int)$daysText;
if (!preg_match('/^\d{1,2}$/', $daysText) || $days < 1 || $days > 14) $errors['days'] = 'مدت امانت باید بین ۱ تا ۱۴ روز باشد.';
$bookId = is_string($body['bookId'] ?? null) ? $body['bookId'] : '';
if (!preg_match('/^LIB-\d{1,6}$/', $bookId)) $errors['book'] = 'کتاب درخواستی معتبر نیست.';
if ($errors) out(422, ['error' => 'invalid', 'errors' => $errors]);

$book = null;
foreach (catalog_current()['data']['books'] ?? [] as $b) if (($b['id'] ?? '') === $bookId) { $book = $b; break; }
if (!$book) out(422, ['error' => 'invalid', 'errors' => ['book' => 'این کتاب در فهرست نیست.']]);

$pdo = db();
$dedupe = hash('sha256', "library:$name|$bookId");
$q = $pdo->prepare("SELECT COUNT(*) FROM submissions WHERE dedupe_key = ? AND created_at > UTC_TIMESTAMP() - INTERVAL 1800 SECOND");
$q->execute([$dedupe]);
if ((int)$q->fetchColumn() > 0) out(429, ['error' => 'duplicate'], ['Retry-After' => '1800']);

$id = uuid4();
$due = time() + $days * 86400;
$value = ['name' => $name, 'grade' => $grade, 'className' => $className, 'days' => $days, 'bookId' => $bookId,
  'bookNumber' => $book['number'] ?? null, 'bookTitle' => $book['title'] ?? '', 'dueDate' => gmdate('Y-m-d', $due)];
$pdo->prepare("INSERT INTO submissions (id, kind, dedupe_key, data, created_at) VALUES (?, 'library', ?, ?, UTC_TIMESTAMP())")
  ->execute([$id, $dedupe, json_encode($value, JSON_UNESCAPED_UNICODE)]);

$lines = ['درخواست امانت کتاب از سایت کتابخانه', '', 'کتاب: «' . $book['title'] . '»، شماره ' . fa_digits($book['number'] ?? ''),
  !empty($book['author']) ? 'نویسنده: ' . $book['author'] : null, '', "دانش‌آموز: $name", 'پایه: ' . GRADES[$grade] . " | کلاس: $className",
  'مدت امانت: ' . fa_digits($days) . ' روز، تا ' . fa_date($due, true), '', 'زمان: ' . fa_date(time(), false, true),
  'کد پیگیری: ' . substr($id, 0, 8), 'مشاهده در پنل مدیر: ' . admin_record_url($id)];
notify_staff(implode("\n", array_filter($lines, fn($l) => $l !== null)));
out(201, ['ok' => true, 'id' => substr($id, 0, 8), 'due' => gmdate('c', $due), 'dueLabel' => fa_date($due, true)]);
