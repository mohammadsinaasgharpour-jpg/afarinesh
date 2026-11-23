<?php
// The admin panel's page editor: the vice-principal changes the text, photos and sections of a page and publishes it.
// An edited page is written over the live file and kept in EDITS_DIR, so a later code deploy (api/deploy.php) puts
// the edit back, with that deploy's fresh stylesheet. "Revert" restores the page from the last deploy.
//   GET  ?action=pages                list of editable pages, with whether each has an edit
//   GET  ?action=page&name=index      the page's current HTML
//   POST ?action=save   {name, html}  publish an edited page
//   POST ?action=revert {name}        back to the deployed page
//   POST ?action=upload {data, type}  a photo (base64): checked, resized, stored as WebP; returns its address
declare(strict_types=1);
require_once __DIR__ . '/_lib/bootstrap.php';
require_once __DIR__ . '/_lib/site-edits.php';
set_time_limit(60);

admin_session();
if (($_SESSION['admin_until'] ?? 0) <= time()) out(401, ['error' => 'unauthorized']);
$_SESSION['admin_until'] = time() + 30 * 60;

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$action = (string)($_GET['action'] ?? '');
if ($method === 'POST') require_same_origin();

function page_name(string $name): string {
  if (!preg_match('#^(index|pre-registration|careers|privacy|en|blog/[a-z0-9-]+)$#', $name)) out(422, ['error' => 'invalid_page']);
  if (!is_file(WEB_ROOT_DIR . "/$name.html")) out(404, ['error' => 'no_such_page']);
  return $name;
}

if ($method === 'GET' && $action === 'pages') {
  $pages = ['index' => 'صفحه‌ی اصلی', 'pre-registration' => 'پیش‌ثبت‌نام', 'careers' => 'دعوت به همکاری', 'privacy' => 'حریم خصوصی', 'en' => 'صفحه‌ی انگلیسی', 'blog/index' => 'فهرست مطالب'];
  foreach (glob(WEB_ROOT_DIR . '/blog/*.html') ?: [] as $f) {
    $slug = basename($f, '.html');
    if ($slug === 'index') continue;
    preg_match('#<h1[^>]*>(.*?)</h1>#su', (string)file_get_contents($f), $m);
    $pages["blog/$slug"] = 'مطلب: ' . trim(strip_tags($m[1] ?? $slug));
  }
  $list = [];
  foreach ($pages as $name => $title) if (is_file(WEB_ROOT_DIR . "/$name.html")) $list[] = ['name' => $name, 'title' => $title, 'edited' => is_file(EDITS_DIR . "/pages/$name.html")];
  out(200, ['ok' => true, 'pages' => $list]);
}

if ($method === 'GET' && $action === 'page') {
  $name = page_name((string)($_GET['name'] ?? ''));
  out(200, ['ok' => true, 'html' => (string)file_get_contents(WEB_ROOT_DIR . "/$name.html")]);
}

if ($method === 'POST' && $action === 'save') {
  $body = read_json(3_000_000);
  $name = page_name((string)($body['name'] ?? ''));
  $html = (string)($body['html'] ?? '');
  if (!preg_match('#^\s*<!doctype html>#i', $html) || !str_contains($html, '</html>')) out(422, ['error' => 'not_a_page']);
  $clean = clean_page($html, (string)file_get_contents(WEB_ROOT_DIR . "/$name.html"));
  save_edit($name, $clean);
  out(200, ['ok' => true]);
}

if ($method === 'POST' && $action === 'revert') {
  $body = read_json(1024);
  $name = page_name((string)($body['name'] ?? ''));
  out(revert_edit($name) ? 200 : 409, ['ok' => true]);
}

if ($method === 'POST' && $action === 'upload') {
  if (!rate_hit('upload:' . client_ip(), 60, 3600)) out(429, ['error' => 'too_many']);
  // base64 inside JSON: the host's firewall refuses raw file uploads
  $body = read_json(15_000_000);
  $raw = base64_decode((string)($body['data'] ?? ''), true);
  if ($raw === false || strlen($raw) < 100 || strlen($raw) > 10_000_000) out(422, ['error' => 'bad_file']);
  $info = @getimagesizefromstring($raw);
  if (!$info || !in_array($info[2], [IMAGETYPE_JPEG, IMAGETYPE_PNG, IMAGETYPE_WEBP], true)) out(415, ['error' => 'not_a_photo']);
  out(200, ['ok' => true] + store_photo($raw, $info));
}

out(405, ['error' => 'method_not_allowed']);
