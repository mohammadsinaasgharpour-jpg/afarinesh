<?php
// Pages and photos changed in the admin panel's editor. Each edited page is kept outside the web root, next to the
// deployed page it started from, so it survives code deploys and can be reverted. Used by site-edit.php and deploy.php.
declare(strict_types=1);

const WEB_ROOT_DIR = '/home/mqcmfbjf/public_html';
const EDITS_DIR = '/home/mqcmfbjf/afarinesh-edits';

/**
 * An edited page may not bring anything that runs: only scripts already in the live page are kept (byte for byte,
 * so their CSP hashes still match), and event attributes, javascript: links and embedded frames are removed.
 */
function clean_page(string $html, string $current): string {
  preg_match_all('#<script\b[^>]*>.*?</script>#is', $current, $m);
  $allowed = array_flip($m[0]);
  $html = preg_replace_callback('#<script\b[^>]*>.*?</script>#is', fn($s) => isset($allowed[$s[0]]) ? $s[0] : '', $html);
  $html = preg_replace('#<(iframe|object|embed|frame|frameset|applet|base)\b[^>]*>(.*?</\1\s*>)?#is', '', $html);
  // tags outside scripts: no on* handlers, no script URLs
  $parts = preg_split('#(<script\b[^>]*>.*?</script>)#is', $html, -1, PREG_SPLIT_DELIM_CAPTURE);
  foreach ($parts as $i => $part) {
    if ($i % 2 === 1) continue;
    $parts[$i] = preg_replace_callback('#<[a-zA-Z][^>]*>#', function ($t) {
      $tag = preg_replace('#\s+on[a-z]+\s*=\s*("[^"]*"|\'[^\']*\'|[^\s>]+)#i', '', $t[0]);
      return preg_replace('#((?:href|src|srcset|action|formaction|xlink:href)\s*=\s*["\']?)\s*(javascript|vbscript|data:text)[^"\'\s>]*#i', '$1#', $tag);
    }, $part);
  }
  return implode('', $parts);
}

function edit_path(string $kind, string $name): string { return EDITS_DIR . "/$kind/$name.html"; }
function put_file(string $path, string $data): void {
  if (!is_dir(dirname($path))) mkdir(dirname($path), 0700, true);
  if (file_put_contents("$path.tmp", $data) === false || !rename("$path.tmp", $path)) out(500, ['error' => 'write_failed']);
}

function save_edit(string $name, string $html): void {
  $live = WEB_ROOT_DIR . "/$name.html";
  $current = (string)file_get_contents($live);
  // the deployed page, kept once, is what "revert" goes back to
  if (!is_file(edit_path('original', $name))) put_file(edit_path('original', $name), $current);
  // every published version before this one, the last 20 per page
  $hist = EDITS_DIR . '/history/' . str_replace('/', '_', $name) . '-' . gmdate('Ymd-His') . '.html';
  put_file($hist, $current);
  $old = glob(EDITS_DIR . '/history/' . str_replace('/', '_', $name) . '-*.html') ?: [];
  sort($old);
  foreach (array_slice($old, 0, max(0, count($old) - 20)) as $f) @unlink($f);
  put_file(edit_path('pages', $name), $html);
  if (file_put_contents($live, $html) === false) out(500, ['error' => 'write_failed']);
}

function revert_edit(string $name): bool {
  $orig = edit_path('original', $name);
  if (!is_file($orig)) return false;
  file_put_contents(WEB_ROOT_DIR . "/$name.html", (string)file_get_contents($orig));
  @unlink(edit_path('pages', $name));
  @unlink($orig);
  return true;
}

/** A photo from the editor, resized to at most 1600 pixels wide and saved as WebP when the host's GD can. */
function store_photo(string $raw, array $info): array {
  $id = bin2hex(random_bytes(8));
  [$w, $h] = $info;
  $data = $raw;
  $ext = [IMAGETYPE_JPEG => 'jpg', IMAGETYPE_PNG => 'png', IMAGETYPE_WEBP => 'webp'][$info[2]];
  if (function_exists('imagecreatefromstring') && function_exists('imagewebp') && ($img = @imagecreatefromstring($raw))) {
    if ($info[2] === IMAGETYPE_JPEG && function_exists('exif_read_data')) {
      $o = (int)((@exif_read_data('data://image/jpeg;base64,' . base64_encode($raw))['Orientation'] ?? 1));
      if (in_array($o, [3, 6, 8], true)) { $img = imagerotate($img, [3 => 180, 6 => -90, 8 => 90][$o], 0); [$w, $h] = [imagesx($img), imagesy($img)]; }
    }
    if ($w > 1600) { $img = imagescale($img, 1600); [$w, $h] = [imagesx($img), imagesy($img)]; }
    ob_start();
    imagewebp($img, null, 80);
    $data = (string)ob_get_clean();
    $ext = 'webp';
  }
  $file = "$id.$ext";
  foreach ([WEB_ROOT_DIR . '/assets/img/uploads', EDITS_DIR . '/uploads'] as $dir) {
    if (!is_dir($dir)) mkdir($dir, 0755, true);
    file_put_contents("$dir/$file", $data);
  }
  return ['url' => "/assets/img/uploads/$file", 'width' => $w, 'height' => $h];
}

/**
 * After a code deploy: each edited page goes back over the freshly deployed one, taking that deploy's stylesheet (so
 * the page's style still matches the security header), and the uploaded photos are put back.
 */
function reapply_edits(): int {
  $n = 0;
  $base = EDITS_DIR . '/pages';
  if (!is_dir($base)) return 0;
  $it = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($base, FilesystemIterator::SKIP_DOTS));
  foreach ($it as $f) {
    if (substr($f->getFilename(), -5) !== '.html') continue;
    $name = substr($f->getPathname(), strlen($base) + 1, -5);
    $live = WEB_ROOT_DIR . "/$name.html";
    if (!is_file($live)) continue;
    $fresh = (string)file_get_contents($live);
    put_file(edit_path('original', $name), $fresh);
    $edit = (string)file_get_contents($f->getPathname());
    if (preg_match('#<!-- css:start -->.*?<!-- css:end -->#s', $fresh, $css)) $edit = preg_replace('#<!-- css:start -->.*?<!-- css:end -->#s', str_replace(['\\', '$'], ['\\\\', '\\$'], $css[0]), $edit, 1);
    file_put_contents($live, $edit);
    $n++;
  }
  foreach (glob(EDITS_DIR . '/uploads/*') ?: [] as $p) {
    $to = WEB_ROOT_DIR . '/assets/img/uploads/' . basename($p);
    if (!is_file($to)) { @mkdir(dirname($to), 0755, true); copy($p, $to); }
  }
  return $n;
}
