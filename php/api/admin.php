<?php
// Admin panel API for the school's vice-principal: sign in with the panel password, list and search every
// stored form, open one record (the link at the end of each Telegram message), set its follow-up status and
// a note, and download a CSV for Excel. Every read needs a session; the password is checked against a hash.
declare(strict_types=1);
require_once __DIR__ . '/_lib/bootstrap.php';

const SESSION_SEC = 8 * 3600;
const STATUSES = ['new', 'called', 'interview', 'accepted', 'rejected'];

session_name('afarinesh_admin');
session_set_cookie_params(['lifetime' => SESSION_SEC, 'path' => '/', 'secure' => true, 'httponly' => true, 'samesite' => 'Strict']);
ini_set('session.gc_maxlifetime', (string)SESSION_SEC);
ini_set('session.use_strict_mode', '1');
session_start();

/** Hash format "pbkdf2_sha256$iterations$salt_b64$hash_b64", written by scripts/hash-admin-password.mjs. */
function verify_password(string $password, string $encoded): bool {
  $p = explode('$', $encoded);
  if (count($p) !== 4 || $p[0] !== 'pbkdf2_sha256') return false;
  $expected = base64_decode($p[3], true);
  if ($expected === false) return false;
  $actual = hash_pbkdf2('sha256', $password, base64_decode($p[2]), (int)$p[1], strlen($expected), true);
  return hash_equals($expected, $actual);
}

function signed_in(): bool { return ($_SESSION['admin_until'] ?? 0) > time(); }
function row_out(array $row): array {
  $data = json_decode($row['data'], true) ?: [];
  return ['id' => $row['id'], 'kind' => $row['kind'], 'status' => $row['status'], 'note' => $row['note'] ?? '',
    'receivedAt' => str_replace(' ', 'T', $row['created_at']) . 'Z', 'data' => $data, 'adminUrl' => admin_record_url($row['id'])];
}

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$action = (string)($_GET['action'] ?? '');
if (!cfg('admin_password_hash')) out(503, ['error' => 'admin_not_configured']);

if ($method === 'POST') require_same_origin();

if ($method === 'POST' && $action === 'login') {
  if (!rate_hit('login:' . client_ip(), 6, 900)) out(429, ['error' => 'too_many_attempts'], ['Retry-After' => '900']);
  $body = read_json(2048);
  $password = is_string($body['password'] ?? null) ? $body['password'] : '';
  if (strlen($password) < 8 || !verify_password($password, (string)cfg('admin_password_hash'))) out(401, ['error' => 'invalid_credentials']);
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
