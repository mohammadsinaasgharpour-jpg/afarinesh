<?php
// Shared by every endpoint: settings, JSON replies, the MySQL connection and tables, rate limits, the staff
// notification. Settings and passwords live in CONFIG_FILE, outside the web root and outside Git.
declare(strict_types=1);
ini_set('display_errors', '0');

const CONFIG_FILE = '/home/mqcmfbjf/afarinesh-config.php';
const SITE_URL = 'https://afarineshshiraz.ir';

function cfg(string $key, $default = null) {
  static $c = null;
  if ($c === null) $c = is_file(CONFIG_FILE) ? (require CONFIG_FILE) : [];
  return $c[$key] ?? $default;
}

function out(int $status, array $body, array $headers = []): void {
  http_response_code($status);
  header('Content-Type: application/json; charset=utf-8');
  header('Cache-Control: no-store');
  foreach ($headers as $k => $v) header("$k: $v");
  echo json_encode($body, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
  exit;
}

/** The page always posts from its own origin; anything else is another site using a visitor's browser. */
function require_same_origin(): void {
  $origin = $_SERVER['HTTP_ORIGIN'] ?? '';
  if ($origin === '') return;
  $host = parse_url($origin, PHP_URL_HOST) ?: '';
  $port = parse_url($origin, PHP_URL_PORT);
  if (($port ? "$host:$port" : $host) !== ($_SERVER['HTTP_HOST'] ?? '')) out(403, ['error' => 'forbidden_origin']);
}

function read_json(int $maxBytes): array {
  if (!str_starts_with((string)($_SERVER['CONTENT_TYPE'] ?? ''), 'application/json')) out(415, ['error' => 'unsupported_type']);
  if ((int)($_SERVER['CONTENT_LENGTH'] ?? 0) > $maxBytes) out(413, ['error' => 'too_large']);
  $raw = file_get_contents('php://input', false, null, 0, $maxBytes + 1);
  if ($raw === false || strlen($raw) > $maxBytes) out(413, ['error' => 'too_large']);
  $body = json_decode($raw, true);
  if (!is_array($body) || array_is_list($body) && $body !== []) out(400, ['error' => 'bad_json']);
  return $body;
}

function db(): PDO {
  static $pdo = null;
  if ($pdo) return $pdo;
  try {
    $pdo = new PDO('mysql:host=localhost;dbname=' . cfg('db_name') . ';charset=utf8mb4', (string)cfg('db_user'), (string)cfg('db_pass'), [
      PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC, PDO::ATTR_EMULATE_PREPARES => false,
    ]);
  } catch (Throwable $e) { out(503, ['error' => 'store_unreachable']); }
  $pdo->exec("CREATE TABLE IF NOT EXISTS submissions (
    id CHAR(36) NOT NULL PRIMARY KEY,
    kind VARCHAR(20) NOT NULL,
    dedupe_key VARCHAR(80) NOT NULL,
    data LONGTEXT NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'new',
    note TEXT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX kind_time (kind, created_at), INDEX key_time (dedupe_key, created_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
  $pdo->exec("CREATE TABLE IF NOT EXISTS rate_hits (
    bucket CHAR(64) NOT NULL, hit_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, INDEX bucket_time (bucket, hit_at)
  ) ENGINE=InnoDB");
  return $pdo;
}

/** Fixed-window limiter counted in the database. Buckets are hashed, so no address or number is stored. */
function rate_hit(string $bucket, int $limit, int $windowSec): bool {
  $key = hash_hmac('sha256', $bucket, (string)cfg('session_secret', 'x'));
  $pdo = db();
  if (random_int(1, 50) === 1) $pdo->exec("DELETE FROM rate_hits WHERE hit_at < UTC_TIMESTAMP() - INTERVAL 2 DAY");
  $q = $pdo->prepare("SELECT COUNT(*) FROM rate_hits WHERE bucket = ? AND hit_at > UTC_TIMESTAMP() - INTERVAL ? SECOND");
  $q->execute([$key, $windowSec]);
  if ((int)$q->fetchColumn() >= $limit) return false;
  $pdo->prepare("INSERT INTO rate_hits (bucket, hit_at) VALUES (?, UTC_TIMESTAMP())")->execute([$key]);
  return true;
}

function client_ip(): string { return (string)($_SERVER['REMOTE_ADDR'] ?? ''); }

function uuid4(): string {
  $b = random_bytes(16);
  $b[6] = chr(ord($b[6]) & 0x0f | 0x40);
  $b[8] = chr(ord($b[8]) & 0x3f | 0x80);
  return vsprintf('%s%s-%s-%s-%s-%s%s%s', str_split(bin2hex($b), 4));
}

function fa_time(string $iso): string {
  if (class_exists('IntlDateFormatter')) {
    $f = new IntlDateFormatter('fa_IR@calendar=persian', IntlDateFormatter::MEDIUM, IntlDateFormatter::SHORT, 'Asia/Tehran', IntlDateFormatter::TRADITIONAL);
    $s = $f->format(new DateTimeImmutable($iso));
    if ($s) return $s;
  }
  return $iso;
}

/**
 * Telegram is not reachable from servers in Iran, so the message goes to a small relay on the school's
 * Vercel project (api/relay.js), signed by this host. The database copy is the record; a failed
 * notification never loses a form.
 */
function notify_staff(string $text): bool {
  $body = json_encode(['text' => $text, 'ts' => time()], JSON_UNESCAPED_UNICODE);
  $ch = curl_init(relay_url('relay'));
  curl_setopt_array($ch, [
    CURLOPT_POST => true, CURLOPT_POSTFIELDS => $body, CURLOPT_RETURNTRANSFER => true,
    CURLOPT_CONNECTTIMEOUT => 5, CURLOPT_TIMEOUT => 10, CURLOPT_HTTPHEADER => relay_headers($body),
  ]);
  curl_exec($ch);
  $ok = curl_getinfo($ch, CURLINFO_HTTP_CODE) === 200;
  curl_close($ch);
  return $ok;
}

function relay_url(string $name): string {
  return preg_replace('#/relay$#', '/' . $name, (string)cfg('relay_url', 'https://afarinesh-site.vercel.app/api/relay'));
}

/**
 * Every message to Vercel is signed with an ECDSA P-256 key made on this host the first time it is needed. Vercel
 * holds only the public half (api/_relay-key.js, published by /api/relay-key), so no secret is ever copied
 * between the two by hand. A relay_secret in the config file still adds the older HMAC signature.
 */
function relay_private_key() {
  if (!function_exists('openssl_pkey_new')) return null;
  $pem = (string)(secrets()['relay_pem'] ?? '');
  if ($pem === '') {
    $key = openssl_pkey_new(['private_key_type' => OPENSSL_KEYTYPE_EC, 'curve_name' => 'prime256v1']);
    if (!$key || !openssl_pkey_export($key, $pem)) return null;
    save_secrets(['relay_pem' => $pem]);
  }
  return openssl_pkey_get_private($pem) ?: null;
}
function relay_public_key(): ?string {
  $key = relay_private_key();
  return $key ? (string)(openssl_pkey_get_details($key)['key'] ?? '') : null;
}
function relay_headers(string $body): array {
  $h = ['Content-Type: application/json'];
  $key = relay_private_key();
  if ($key && openssl_sign($body, $sig, $key, OPENSSL_ALGO_SHA256)) $h[] = 'X-Relay-Ecdsa: ' . base64_encode($sig);
  $secret = (string)cfg('relay_secret', '');
  if ($secret !== '') $h[] = 'X-Relay-Signature: ' . hash_hmac('sha256', $body, $secret);
  return $h;
}

/**
 * The vice-principal's sign-in, shared by /admin and the library. Sessions live in their own folder outside the
 * web root: in the host's shared folder, other sites' PHP clears them after 24 minutes and signs the panel out.
 */
function admin_session(): void {
  if (session_status() === PHP_SESSION_ACTIVE) return;
  $dir = '/home/mqcmfbjf/admin-sessions';
  if (!is_dir($dir)) @mkdir($dir, 0700, true);
  if (is_dir($dir)) session_save_path($dir);
  ini_set('session.gc_maxlifetime', (string)(8 * 3600));
  ini_set('session.use_strict_mode', '1');
  session_name('afarinesh_admin');
  session_set_cookie_params(['lifetime' => 8 * 3600, 'path' => '/', 'secure' => true, 'httponly' => true, 'samesite' => 'Strict']);
  session_start();
}

/**
 * Settings entered in the admin panel (for now the Gemini keys), kept in a JSON file outside the web root and
 * outside Git. Keys are never sent back to any page; the panel only sees how many there are.
 */
const SECRETS_DIR = '/home/mqcmfbjf/afarinesh-secrets';
function secrets(?array $replace = null): array {
  static $s = null;
  if ($replace !== null) $s = $replace;
  if ($s === null) $s = is_file(SECRETS_DIR . '/settings.json') ? (json_decode((string)file_get_contents(SECRETS_DIR . '/settings.json'), true) ?: []) : [];
  return $s;
}
function save_secrets(array $changes): void {
  if (!is_dir(SECRETS_DIR)) @mkdir(SECRETS_DIR, 0700, true);
  // read the file again: another request may have saved a setting since this one started
  $now = is_file(SECRETS_DIR . '/settings.json') ? (json_decode((string)file_get_contents(SECRETS_DIR . '/settings.json'), true) ?: []) : [];
  $all = array_merge($now, $changes);
  file_put_contents(SECRETS_DIR . '/settings.json.tmp', json_encode($all, JSON_UNESCAPED_UNICODE));
  rename(SECRETS_DIR . '/settings.json.tmp', SECRETS_DIR . '/settings.json');
  @chmod(SECRETS_DIR . '/settings.json', 0600);
  secrets($all);
}

function admin_record_url(string $id): string { return SITE_URL . '/admin?record=' . rawurlencode($id); }
