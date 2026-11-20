<?php
// GET: is this browser signed in?   POST {password}: sign in.   DELETE: sign out. Same password and session as /admin.
declare(strict_types=1);
require __DIR__ . '/_lib/lib.php';
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$configured = (bool)cfg('admin_password_hash');
if ($method === 'GET') out(200, ['admin' => is_admin(), 'configured' => $configured]);
require_same_origin();
if ($method === 'DELETE') {
  admin_session();
  $_SESSION = [];
  session_destroy();
  setcookie('afarinesh_admin', '', ['expires' => 1, 'path' => '/', 'secure' => true, 'httponly' => true, 'samesite' => 'Strict']);
  out(200, ['admin' => false]);
}
if ($method !== 'POST') out(405, ['error' => 'method not allowed']);
if (!$configured) out(503, ['error' => 'not configured']);
$body = read_json(2048);
$password = is_string($body['password'] ?? null) ? $body['password'] : '';
if (!rate_hit('login:' . client_ip(), 6, 900)) out(429, ['error' => 'too many attempts', 'retryAfter' => 900], ['Retry-After' => '900']);
if (!lib_verify_password($password)) { usleep(900000); out(401, ['error' => 'wrong password']); }
admin_session();
session_regenerate_id(true);
$_SESSION['admin_until'] = time() + 8 * 3600;
out(200, ['admin' => true]);
