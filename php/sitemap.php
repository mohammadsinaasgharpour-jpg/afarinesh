<?php
// /sitemap.xml (rewritten here by .htaccess). Built on every request from the pages that are actually on the host,
// so a new page, a blog article whose date has come, or a page changed in the admin panel's editor is listed the
// moment it is served, with no list to keep by hand. A page is listed only when it is indexable: it names itself as
// its canonical URL on this site, has no robots noindex and no meta refresh. Private folders (admin, api, assets) and
// error pages are never scanned. The library's own sitemap (shipped with its code) is merged in. Above 50,000 URLs
// the answer becomes a sitemap index of numbered parts (/sitemap.xml?page=N).
declare(strict_types=1);

const SITE = 'https://afarineshshiraz.ir';
const PER_FILE = 50000;
const SKIP_DIRS = ['admin', 'api', 'assets', 'library', '.well-known', 'cgi-bin'];
const SKIP_FILES = ['404.html', 'admin.html'];

/** The page's URL from its file path: index.html is "/", blog/index.html is "/blog/", careers.html is "/careers". */
function url_of(string $rel): string {
  if ($rel === 'index.html') return '/';
  if (str_ends_with($rel, '/index.html')) return '/' . substr($rel, 0, -10);
  return '/' . substr($rel, 0, -5);
}

/** One sitemap entry for the page, or null when the page must not be listed. */
function entry(string $file, string $rel, string $root): ?array {
  $html = (string)@file_get_contents($file);
  $headEnd = stripos($html, '</head>');
  if ($headEnd === false) return null;
  $head = substr($html, 0, $headEnd);
  if (preg_match('/<meta[^>]+name=["\']robots["\'][^>]*content=["\'][^"\']*noindex/i', $head)) return null;
  if (preg_match('/<meta[^>]+http-equiv=["\']?refresh/i', $head)) return null;
  if (!preg_match('/<link[^>]+rel=["\']canonical["\'][^>]*href=["\']([^"\']+)["\']/i', $head, $c)) return null;
  $canonical = html_entity_decode($c[1], ENT_QUOTES);
  // only a page that is its own canonical: a duplicate points elsewhere, and that page is listed instead
  if ($canonical !== SITE . url_of($rel)) return null;
  $e = ['loc' => $canonical, 'lastmod' => null, 'alt' => [], 'img' => []];
  if (preg_match('/<meta[^>]+property=["\']article:(?:modified|published)_time["\'][^>]*content=["\'](\d{4}-\d{2}-\d{2})/i', $head, $m)) $e['lastmod'] = $m[1];
  elseif (preg_match('/"dateModified":\s*"(\d{4}-\d{2}-\d{2})/', $html, $m)) $e['lastmod'] = $m[1];
  preg_match_all('/<link[^>]+rel=["\']alternate["\'][^>]*hreflang=["\']([a-zA-Z-]+)["\'][^>]*href=["\'](https:[^"\']+)["\']/i', $head, $alts, PREG_SET_ORDER);
  foreach ($alts as [, $lang, $href]) if (str_starts_with($href, SITE . '/')) $e['alt'][$lang] = $href;
  // the page's photos (the large copy when there is one), for Google Images
  preg_match_all('/<img\b[^>]*>/i', substr($html, $headEnd), $imgs);
  foreach ($imgs[0] as $tag) {
    if (!preg_match('/\ssrc=["\'](\/assets\/img\/[^"\']+)["\']/i', $tag, $s) || !preg_match('/\salt=["\']([^"\']+)["\']/i', $tag, $a)) continue;
    $src = $s[1];
    $big = preg_replace('/-640\.webp$/', '-1280.webp', $src);
    if ($big !== $src && is_file($root . $big)) $src = $big;
    if (str_contains($src, '/icon-') || str_contains($src, '/logo-')) continue;
    $e['img'][SITE . $src] ??= html_entity_decode($a[1], ENT_QUOTES);
    if (count($e['img']) >= 1000) break;
  }
  return $e;
}

/** Every indexable page under the web root, plus the library's listed pages. */
function collect(string $root): array {
  $out = [];
  $it = new RecursiveIteratorIterator(new RecursiveCallbackFilterIterator(
    new RecursiveDirectoryIterator($root, FilesystemIterator::SKIP_DOTS),
    function (SplFileInfo $f) use ($root): bool {
      $rel = str_replace('\\', '/', substr($f->getPathname(), strlen($root) + 1));
      if ($f->isDir()) return !in_array(explode('/', $rel)[0], SKIP_DIRS, true) && !str_starts_with($f->getFilename(), '.');
      return str_ends_with($rel, '.html') && !in_array($rel, SKIP_FILES, true) && !preg_match('/^google[0-9a-f]{16}\.html$/', $rel);
    }
  ));
  foreach ($it as $f) {
    $rel = str_replace('\\', '/', substr($f->getPathname(), strlen($root) + 1));
    $e = entry($f->getPathname(), $rel, $root);
    if ($e) $out[$e['loc']] = $e;
  }
  $lib = $root . '/library/sitemap.xml';
  if (is_file($lib) && preg_match_all('/<url>\s*<loc>([^<]+)<\/loc>(?:\s*<lastmod>([^<]+)<\/lastmod>)?/', (string)file_get_contents($lib), $m, PREG_SET_ORDER)) {
    foreach ($m as $u) if (str_starts_with($u[1], SITE . '/')) $out[$u[1]] ??= ['loc' => $u[1], 'lastmod' => $u[2] ?? null, 'alt' => [], 'img' => []];
  }
  // home page first, then the shortest paths: the order a reader would want
  uksort($out, fn($a, $b) => [substr_count($a, '/'), $a] <=> [substr_count($b, '/'), $b]);
  return array_values($out);
}

function x(string $s): string { return htmlspecialchars($s, ENT_XML1 | ENT_QUOTES, 'UTF-8'); }

function urlset(array $entries): string {
  $o = "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<urlset xmlns=\"http://www.sitemaps.org/schemas/sitemap/0.9\" xmlns:xhtml=\"http://www.w3.org/1999/xhtml\" xmlns:image=\"http://www.google.com/schemas/sitemap-image/1.1\">\n";
  foreach ($entries as $e) {
    $o .= '  <url><loc>' . x($e['loc']) . '</loc>' . ($e['lastmod'] ? '<lastmod>' . x($e['lastmod']) . '</lastmod>' : '');
    foreach ($e['alt'] as $lang => $href) $o .= "\n    <xhtml:link rel=\"alternate\" hreflang=\"" . x($lang) . '" href="' . x($href) . '"/>';
    foreach ($e['img'] as $src => $title) $o .= "\n    <image:image><image:loc>" . x($src) . '</image:loc><image:title>' . x($title) . '</image:title></image:image>';
    $o .= ($e['alt'] || $e['img'] ? "\n  " : '') . "</url>\n";
  }
  return $o . "</urlset>\n";
}

function sitemap_index(int $parts): string {
  $o = "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<sitemapindex xmlns=\"http://www.sitemaps.org/schemas/sitemap/0.9\">\n";
  for ($i = 1; $i <= $parts; $i++) $o .= '  <sitemap><loc>' . SITE . "/sitemap.xml?page=$i</loc></sitemap>\n";
  return $o . "</sitemapindex>\n";
}

/** The answer for ?page=$page (0 = the main address). Returns [status, xml]. */
function render_sitemap(string $root, int $page): array {
  $all = collect($root);
  $parts = max(1, (int)ceil(count($all) / PER_FILE));
  if ($parts === 1) return $page <= 1 ? [200, urlset($all)] : [404, ''];
  if ($page === 0) return [200, sitemap_index($parts)];
  if ($page > $parts) return [404, ''];
  return [200, urlset(array_slice($all, ($page - 1) * PER_FILE, PER_FILE))];
}

// run as the endpoint (a test can include this file with SITEMAP_LIB set and call render_sitemap itself)
if (!defined('SITEMAP_LIB')) {
  [$status, $xml] = render_sitemap(__DIR__, max(0, (int)($_GET['page'] ?? 0)));
  http_response_code($status);
  header('Content-Type: application/xml; charset=utf-8');
  // short cache, revalidated: a new page shows up within minutes, and an unchanged sitemap costs a 304
  header('Cache-Control: public, max-age=600, must-revalidate');
  $etag = '"' . md5($xml) . '"';
  header("ETag: $etag");
  if (($_SERVER['HTTP_IF_NONE_MATCH'] ?? '') === $etag) { http_response_code(304); exit; }
  echo $xml;
}
