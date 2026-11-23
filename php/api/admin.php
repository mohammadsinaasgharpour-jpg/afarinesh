<?php
// Admin panel API for the school's vice-principal: sign in with the panel password or a one-time code sent to the
// school's private Telegram channel, list and search every
// stored form, open one record (the link at the end of each Telegram message), set its follow-up status and
// a note, and download a CSV for Excel. Every read needs a session; the password is checked against a hash.
declare(strict_types=1);
require_once __DIR__ . '/_lib/bootstrap.php';

const SESSION_SEC = 30 * 60; // signed out after 30 minutes without using the panel, and when the browser closes
const STATUSES = ['new', 'called', 'interview', 'accepted', 'rejected'];

admin_session();

/** Hash format "pbkdf2_sha256$iterations$salt_b64$hash_b64", written by scripts/hash-admin-password.mjs. */
function verify_password(string $password, string $encoded): bool {
  $p = explode('$', $encoded);
  if (count($p) !== 4 || $p[0] !== 'pbkdf2_sha256') return false;
  $expected = base64_decode($p[3], true);
  if ($expected === false) return false;
  $actual = hash_pbkdf2('sha256', $password, base64_decode($p[2]), (int)$p[1], strlen($expected), true);
  return hash_equals($expected, $actual);
}

function signed_in(): bool {
  if (($_SESSION['admin_until'] ?? 0) <= time()) return false;
  $_SESSION['admin_until'] = time() + SESSION_SEC;
  return true;
}
function row_out(array $row): array {
  $data = json_decode($row['data'], true) ?: [];
  return ['id' => $row['id'], 'kind' => $row['kind'], 'status' => $row['status'], 'note' => $row['note'] ?? '',
    'receivedAt' => str_replace(' ', 'T', $row['created_at']) . 'Z', 'data' => $data, 'adminUrl' => admin_record_url($row['id'])];
}

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$action = (string)($_GET['action'] ?? '');

if ($method === 'POST') require_same_origin();

// a six-digit code for the staff's Telegram channel: only people in that channel can read it, so the panel can be
// opened without remembering a password. One code at a time, valid 10 minutes, at most 5 guesses.
if ($method === 'POST' && $action === 'send-code') {
  if (!rate_hit('code:' . client_ip(), 3, 900) || !rate_hit('code:all', 12, 3600)) out(429, ['error' => 'too_many_attempts'], ['Retry-After' => '900']);
  $code = (string)random_int(100000, 999999);
  save_secrets(['login_code' => ['hash' => password_hash($code, PASSWORD_DEFAULT), 'until' => time() + 600, 'tries' => 0]]);
  $sent = notify_staff("کد ورود به پنل مدیر سایت آفرینش: $code
این کد تا ۱۰ دقیقه کار می‌کند. اگر کسی از شما آن را نخواسته، به کسی ندهید.");
  if (!$sent) { save_secrets(['login_code' => null]); out(502, ['error' => 'telegram_unavailable']); }
  out(200, ['ok' => true]);
}

if ($method === 'POST' && $action === 'login') {
  if (!rate_hit('login:' . client_ip(), 6, 900)) out(429, ['error' => 'too_many_attempts'], ['Retry-After' => '900']);
  $body = read_json(2048);
  $code = preg_replace('/\D/', '', strtr((string)($body['code'] ?? ''), ['۰' => '0', '۱' => '1', '۲' => '2', '۳' => '3', '۴' => '4', '۵' => '5', '۶' => '6', '۷' => '7', '۸' => '8', '۹' => '9']));
  if ($code !== '') {
    $c = secrets()['login_code'] ?? null;
    if (!is_array($c) || $c['until'] < time() || $c['tries'] >= 5) out(401, ['error' => 'code_expired']);
    if (!password_verify($code, (string)$c['hash'])) { save_secrets(['login_code' => ['tries' => $c['tries'] + 1] + $c]); out(401, ['error' => 'invalid_credentials']); }
    save_secrets(['login_code' => null]);
  } else {
    $password = is_string($body['password'] ?? null) ? $body['password'] : '';
    if (strlen($password) < 8 || !verify_password($password, (string)cfg('admin_password_hash'))) out(401, ['error' => 'invalid_credentials']);
  }
  session_regenerate_id(true);
  $_SESSION['admin_until'] = time() + SESSION_SEC;
  out(200, ['ok' => true]);
}
if ($method === 'POST' && $action === 'logout') {
  $_SESSION = [];
  session_destroy();
  setcookie('afarinesh_admin', '', ['expires' => 1, 'path' => '/', 'secure' => true, 'httponly' => true, 'samesite' => 'Strict']);
  out(200, ['ok' => true]);
}
if (!signed_in()) out(401, ['error' => 'unauthorized']);
$pdo = db();

if ($method === 'POST' && $action === 'update') {
  $body = read_json(4096);
  $id = (string)($body['id'] ?? '');
  $status = (string)($body['status'] ?? '');
  $note = mb_substr(trim((string)($body['note'] ?? '')), 0, 1000);
  if (!preg_match('/^[0-9a-f-]{36}$/', $id) || !in_array($status, STATUSES, true)) out(422, ['error' => 'invalid']);
  $pdo->prepare("UPDATE submissions SET status = ?, note = ? WHERE id = ?")->execute([$status, $note, $id]);
  out(200, ['ok' => true]);
}
// settings: the Gemini keys for voice input, the Neshan map key and Google's verification file name. The panel only
// ever sees how many keys there are, never a key.
if ($action === 'settings') {
  if ($method === 'GET') out(200, ['ok' => true, 'geminiKeys' => count(secrets()['gemini_keys'] ?? []), 'neshanKey' => !empty(secrets()['neshan_key']), 'googleFile' => (string)(secrets()['google_file'] ?? '')]);
  if ($method !== 'POST') out(405, ['error' => 'method_not_allowed']);
  $body = read_json(16384);
  // Search Console's "HTML file" check: the name of the file Google gives (googleXXXXXXXX.html); /api/google-verify serves it
  if (array_key_exists('googleFile', $body)) {
    $gf = basename(trim((string)$body['googleFile']));
    if ($gf !== '' && !preg_match('/^google[0-9a-f]{16}\.html$/', $gf)) out(422, ['error' => 'invalid_file']);
    save_secrets(['google_file' => $gf]);
    out(200, ['ok' => true, 'googleFile' => $gf]);
  }
  // the Neshan map key (address check) is saved on its own; an empty value removes it
  if (array_key_exists('neshanKey', $body)) {
    $nk = trim((string)$body['neshanKey']);
    if ($nk !== '' && !preg_match('/^service\.[A-Za-z0-9]{20,80}$/', $nk)) out(422, ['error' => 'invalid_key']);
    save_secrets(['neshan_key' => $nk]);
    out(200, ['ok' => true, 'neshanKey' => $nk !== '']);
  }
  $keys = array_values(array_unique(array_filter(array_map('trim', preg_split('/[\s,;]+/', (string)($body['geminiKeys'] ?? ''))), fn($k) => preg_match('/^[A-Za-z0-9_.\-]{20,200}$/', $k))));
  if (!$keys && empty($body['clear'])) out(422, ['error' => 'no_valid_keys']);
  save_secrets(['gemini_keys' => $keys, 'gemini_next' => 0]);
  out(200, ['ok' => true, 'geminiKeys' => count($keys)]);
}
if ($method === 'POST' && $action === 'test-telegram') {
  $ok = notify_staff("پیام آزمایشی از پنل مدیر سایت آفرینش: تلگرام درست کار می‌کند.");
  out($ok ? 200 : 502, ['ok' => $ok]);
}
if ($method === 'POST' && $action === 'delete') {
  $body = read_json(1024);
  $id = (string)($body['id'] ?? '');
  if (!preg_match('/^[0-9a-f-]{36}$/', $id)) out(422, ['error' => 'invalid']);
  $pdo->prepare("DELETE FROM submissions WHERE id = ?")->execute([$id]);
  out(200, ['ok' => true]);
}
if ($method !== 'GET') out(405, ['error' => 'method_not_allowed'], ['Allow' => 'GET, POST']);

$kind = (string)($_GET['kind'] ?? '');
$where = [];
$args = [];
if (isset($_GET['id']) && $_GET['id'] !== '') { $where[] = 'id = ?'; $args[] = (string)$_GET['id']; }
if (in_array($kind, ['inquiry', 'preRegistration', 'career', 'library'], true)) { $where[] = 'kind = ?'; $args[] = $kind; }
$sql = 'SELECT * FROM submissions' . ($where ? ' WHERE ' . implode(' AND ', $where) : '') . ' ORDER BY created_at DESC LIMIT 2000';
$q = $pdo->prepare($sql);
$q->execute($args);
$rows = array_map('row_out', $q->fetchAll());

if ($action === 'csv') {
  header('Content-Type: text/csv; charset=utf-8');
  header('Content-Disposition: attachment; filename="afarinesh-' . ($kind ?: 'all') . '-' . gmdate('Y-m-d') . '.csv"');
  header('Cache-Control: no-store');
  $keys = [];
  foreach ($rows as $r) $keys = array_unique(array_merge($keys, array_keys($r['data'])));
  $f = fopen('php://output', 'w');
  fwrite($f, "\xEF\xBB\xBF"); // Excel reads Persian correctly only with the byte-order mark
  fputcsv($f, array_merge(['id', 'kind', 'receivedAt', 'status', 'note'], $keys));
  // a cell starting with = + - @ would run as a formula in Excel
  $safe = fn($v) => is_string($v) && preg_match('/^[=+\-@]/', $v) ? "'" . $v : $v;
  foreach ($rows as $r) {
    $line = [$r['id'], $r['kind'], $r['receivedAt'], $r['status'], $safe($r['note'])];
    foreach ($keys as $k) $line[] = $safe(is_scalar($r['data'][$k] ?? '') ? ($r['data'][$k] ?? '') : json_encode($r['data'][$k], JSON_UNESCAPED_UNICODE));
    fputcsv($f, $line);
  }
  exit;
}
out(200, ['ok' => true, 'records' => $rows]);
