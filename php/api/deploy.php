<?php
// Git deploy without shell access: on every push GitHub calls this URL (repository webhook); it downloads the
// main branch of the public repository as a zip and copies public/ and php/ into the web root. The request
// carries nothing that is used: whoever calls it can only redeploy what is already on GitHub, at most once a
// minute. The settings file and stored data are never touched.
declare(strict_types=1);
require_once __DIR__ . '/_lib/bootstrap.php';
set_time_limit(120);

const REPO_ZIP = 'https://codeload.github.com/mohammadsinaasgharpour-jpg/afarinesh/zip/refs/heads/main';
const WEB_ROOT = '/home/mqcmfbjf/public_html';

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') out(405, ['error' => 'method_not_allowed'], ['Allow' => 'POST']);
$raw = file_get_contents('php://input', false, null, 0, 1 << 20) ?: '';
if (($_SERVER['HTTP_X_GITHUB_EVENT'] ?? '') === 'ping') out(200, ['ok' => true, 'pong' => true]);
if (!rate_hit('deploy', 1, 60)) out(429, ['error' => 'too_soon'], ['Retry-After' => '60']);
$event = json_decode($raw, true) ?: [];
if (isset($event['ref']) && $event['ref'] !== 'refs/heads/main') out(200, ['ok' => true, 'skipped' => $event['ref']]);

$tmp = sys_get_temp_dir() . '/afarinesh-deploy-' . bin2hex(random_bytes(4));
@mkdir($tmp, 0700, true);
$zipPath = "$tmp/repo.zip";
$fh = fopen($zipPath, 'w');
// the pushed commit itself: the branch zip can still be the previous commit for a few seconds after a push
$sha = preg_match('/^[0-9a-f]{40}$/', (string)($event['after'] ?? '')) ? $event['after'] : '';
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
// PHP keeps compiled scripts in memory; without this, a changed file can run next to an old copy of another
if (function_exists('opcache_reset')) opcache_reset();
out(200, ['ok' => true, 'files' => $copied, 'commit' => $event['after'] ?? null]);
