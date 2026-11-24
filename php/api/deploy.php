<?php
// Git deploy without shell access: downloads a commit of the public repository as a zip and copies public/,
// php/ and library-php/ into the web root. Called by GitHub's webhook on every push, and with ?poll=1 by a cron
// job, which deploys only when main has a new commit (the host's firewall often refuses GitHub's calls). The
// request carries nothing that is used: whoever calls it can only redeploy the current head of main, at most
// once a minute. The settings file and stored data are never touched.
declare(strict_types=1);
require_once __DIR__ . '/_lib/bootstrap.php';
set_time_limit(120);

const REPO_ZIP = 'https://codeload.github.com/mohammadsinaasgharpour-jpg/afarinesh/zip/refs/heads/main';
const WEB_ROOT = '/home/mqcmfbjf/public_html';

const STATE = '/home/mqcmfbjf/deploy-state.json';

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') out(405, ['error' => 'method_not_allowed'], ['Allow' => 'POST']);
$raw = file_get_contents('php://input', false, null, 0, 1 << 20) ?: '';
if (($_SERVER['HTTP_X_GITHUB_EVENT'] ?? '') === 'ping') out(200, ['ok' => true, 'pong' => true]);
$event = json_decode($raw, true) ?: [];
if (isset($event['ref']) && $event['ref'] !== 'refs/heads/main') out(200, ['ok' => true, 'skipped' => $event['ref']]);

/** The newest commit on main, asked from GitHub (this host can reach GitHub; GitHub cannot always reach it). */
function main_sha(): string {
  $ch = curl_init('https://api.github.com/repos/mohammadsinaasgharpour-jpg/afarinesh/commits/main');
  curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_CONNECTTIMEOUT => 8, CURLOPT_TIMEOUT => 15,
    CURLOPT_HTTPHEADER => ['Accept: application/vnd.github.sha', 'User-Agent: afarinesh-deploy']]);
  $sha = trim((string)curl_exec($ch));
  curl_close($ch);
  return preg_match('/^[0-9a-f]{40}$/', $sha) ? $sha : '';
}
// limited before GitHub is asked anything, so a flood of calls cannot use up the host's GitHub quota
if (!rate_hit('deploy-check', 10, 60)) out(429, ['error' => 'too_soon'], ['Retry-After' => '60']);
$deployed = json_decode((string)@file_get_contents(STATE), true)['sha'] ?? '';
// only the current head of main is ever installed; a commit id in the request is ignored, because anyone can
// send one (an old commit, or a commit from a fork that GitHub serves under this repository's address)
$sha = main_sha();
if ($sha === '') out(503, ['error' => 'github_unreachable'], ['Retry-After' => '60']);
// ?poll=1 (a cron job every few minutes): deploy only when main has moved, because GitHub's webhook calls are
// often refused by the host's firewall before they reach this script
if (isset($_GET['poll']) && $sha === $deployed) out(200, ['ok' => true, 'unchanged' => $deployed]);
if (!rate_hit('deploy', 1, 60)) out(429, ['error' => 'too_soon'], ['Retry-After' => '60']);

// GitHub gives up on a webhook after 10 seconds and PHP then stopped the copy halfway: keep going after the
// caller leaves, and answer GitHub at once where the server allows it (a manual call still waits for the result)
ignore_user_abort(true);
set_time_limit(300);
$finish = function_exists('fastcgi_finish_request') ? 'fastcgi_finish_request' : (function_exists('litespeed_finish_request') ? 'litespeed_finish_request' : null);
if (isset($_SERVER['HTTP_X_GITHUB_EVENT']) && $finish) {
  http_response_code(202);
  header('Content-Type: application/json; charset=utf-8');
  echo json_encode(['ok' => true, 'accepted' => $sha]);
  $finish();
}

$tmp = sys_get_temp_dir() . '/afarinesh-deploy-' . bin2hex(random_bytes(4));
@mkdir($tmp, 0700, true);
$zipPath = "$tmp/repo.zip";
$fh = fopen($zipPath, 'w');
// the exact commit: the branch zip can still be the previous commit for a few seconds after a push
$ch = curl_init($sha ? preg_replace('#refs/heads/main$#', $sha, REPO_ZIP) : REPO_ZIP);
curl_setopt_array($ch, [CURLOPT_FILE => $fh, CURLOPT_FOLLOWLOCATION => true, CURLOPT_CONNECTTIMEOUT => 10, CURLOPT_TIMEOUT => 90]);
curl_exec($ch);
$code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
curl_close($ch);
fclose($fh);
if ($code !== 200) out(502, ['error' => 'download_failed', 'status' => $code]);

$zip = new ZipArchive();
if ($zip->open($zipPath) !== true) out(500, ['error' => 'bad_zip']);
$zip->extractTo("$tmp/x");
$zip->close();
$top = glob("$tmp/x/*", GLOB_ONLYDIR)[0] ?? '';

function copy_tree(string $from, string $to, int &$n): void {
  if (!is_dir($from)) return;
  $it = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($from, FilesystemIterator::SKIP_DOTS), RecursiveIteratorIterator::SELF_FIRST);
  foreach ($it as $item) {
    $dest = $to . '/' . substr($item->getPathname(), strlen($from) + 1);
    if ($item->isDir()) { if (!is_dir($dest)) mkdir($dest, 0755, true); continue; }
    copy($item->getPathname(), $dest);
    $n++;
  }
}
function remove_tree(string $dir): void {
  if (!is_dir($dir)) return;
  $it = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($dir, FilesystemIterator::SKIP_DOTS), RecursiveIteratorIterator::CHILD_FIRST);
  foreach ($it as $item) $item->isDir() ? rmdir($item->getPathname()) : unlink($item->getPathname());
  rmdir($dir);
}

$copied = 0;
copy_tree("$top/public", WEB_ROOT, $copied);
copy_tree("$top/php", WEB_ROOT, $copied);
copy_tree("$top/library-php", WEB_ROOT . '/library', $copied);
remove_tree($tmp);
// endpoints taken out of the site are removed from the host too
foreach (['api/transcribe.php', 'api/geocode.php', 'sitemap.xml'] as $gone) @unlink(WEB_ROOT . "/$gone");
// pages changed in the admin panel's editor go back over the deployed ones
require_once __DIR__ . '/_lib/site-edits.php';
$edited = reapply_edits();
// PHP keeps compiled scripts in memory; without this, a changed file can run next to an old copy of another
if (function_exists('opcache_reset')) opcache_reset();
if ($sha) @file_put_contents(STATE, json_encode(['sha' => $sha, 'at' => gmdate('c')]));
out(200, ['ok' => true, 'files' => $copied, 'edited' => $edited, 'commit' => $sha ?: null]);
