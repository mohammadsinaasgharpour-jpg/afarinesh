<?php
// The library at /library on the school's own host. It shares the main site's settings, database, staff relay
// and admin sign-in (one password for the vice-principal), and keeps the catalog as a JSON file outside the
// web root, with a dated copy of every saved version.
declare(strict_types=1);
require_once dirname(__DIR__, 3) . '/api/_lib/bootstrap.php';

const LIB_URL = SITE_URL . '/library';
const CATALOG_DIR = '/home/mqcmfbjf/library-data';
const CATALOG_FILE = CATALOG_DIR . '/books.json';
const SEED_FILE = __DIR__ . '/../../data/books.json';

function fa_digits($v): string { return strtr((string)$v, ['0' => '۰', '1' => '۱', '2' => '۲', '3' => '۳', '4' => '۴', '5' => '۵', '6' => '۶', '7' => '۷', '8' => '۸', '9' => '۹']); }
function latin_digits($v): string { return strtr((string)$v, ['۰' => '0', '۱' => '1', '۲' => '2', '۳' => '3', '۴' => '4', '۵' => '5', '۶' => '6', '۷' => '7', '۸' => '8', '۹' => '9', '٠' => '0', '١' => '1', '٢' => '2', '٣' => '3', '٤' => '4', '٥' => '5', '٦' => '6', '٧' => '7', '٨' => '8', '٩' => '9']); }

/** @return array{data: array, version: ?string} the saved catalog, or the shipped snapshot before the first save */
function catalog_current(): array {
  if (is_file(CATALOG_FILE)) {
    $text = (string)file_get_contents(CATALOG_FILE);
    return ['data' => json_decode($text, true) ?: ['books' => []], 'version' => hash('sha256', $text)];
  }
  return ['data' => json_decode((string)@file_get_contents(SEED_FILE), true) ?: ['books' => []], 'version' => null];
}

/** Saves only if nobody saved since $version was read (null: nothing saved yet); returns the new version. */
function catalog_write(array $data, ?string $version): ?string {
  if (!is_dir(CATALOG_DIR . '/history')) @mkdir(CATALOG_DIR . '/history', 0700, true);
  $lock = fopen(CATALOG_DIR . '/.lock', 'c');
  flock($lock, LOCK_EX);
  try {
    $now = catalog_current()['version'];
    if ($now !== $version) return null;
    $text = json_encode($data, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
    file_put_contents(CATALOG_FILE . '.tmp', $text);
    rename(CATALOG_FILE . '.tmp', CATALOG_FILE);
    file_put_contents(CATALOG_DIR . '/history/' . gmdate('Y-m-d\TH-i-s') . '.json', $text);
    return hash('sha256', $text);
  } finally {
    flock($lock, LOCK_UN);
    fclose($lock);
  }
}

/** The vice-principal's session, shared with the main admin panel (/admin). */
function admin_session(): void {
  if (session_status() === PHP_SESSION_ACTIVE) return;
  session_name('afarinesh_admin');
  session_set_cookie_params(['lifetime' => 8 * 3600, 'path' => '/', 'secure' => true, 'httponly' => true, 'samesite' => 'Strict']);
  ini_set('session.use_strict_mode', '1');
  session_start();
}
function is_admin(): bool { admin_session(); return ($_SESSION['admin_until'] ?? 0) > time(); }

function lib_verify_password(string $password): bool {
  $p = explode('$', (string)cfg('admin_password_hash'));
  if (count($p) !== 4 || $p[0] !== 'pbkdf2_sha256') return false;
  $expected = base64_decode($p[3], true);
  if ($expected === false) return false;
  return hash_equals($expected, hash_pbkdf2('sha256', $password, base64_decode($p[2]), (int)$p[1], strlen($expected), true));
}

function fa_date(int $ts, bool $weekday = false, bool $time = false): string {
  if (!class_exists('IntlDateFormatter')) return gmdate('Y-m-d', $ts);
  $pattern = ($weekday ? 'EEEE ' : '') . 'd MMMM' . ($time ? ' HH:mm' : '');
  $f = new IntlDateFormatter('fa_IR@calendar=persian', IntlDateFormatter::NONE, IntlDateFormatter::NONE, 'Asia/Tehran', IntlDateFormatter::TRADITIONAL, $pattern);
  return (string)$f->format($ts);
}
