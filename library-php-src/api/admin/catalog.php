<?php
// GET: the catalog and its version.  POST {action: add|update|delete, book?, id?, version}: one change, saved
// only if nobody saved in between (409 otherwise). Shared physical numbers are allowed on purpose.
declare(strict_types=1);
require dirname(__DIR__) . '/_lib/lib.php';

if (!is_admin()) out(401, ['error' => 'sign in required']);
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
['data' => $data, 'version' => $version] = catalog_current();
if ($method === 'GET') out(200, ['data' => $data, 'version' => $version]);
if ($method !== 'POST') out(405, ['error' => 'method not allowed']);
require_same_origin();
$body = read_json(16384);
if (($body['version'] ?? null) !== $version) out(409, ['error' => 'conflict']);

$clean = function ($v): ?string {
  if ($v === null) return null;
  $s = trim(preg_replace('/\s+/u', ' ', preg_replace('/[\x{0000}-\x{001f}\x{007f}]/u', ' ', (string)$v)));
  return $s === '' ? null : $s;
};
$validate = function (array $in) use ($clean): array {
  $digits = trim(latin_digits($in['number'] ?? ''));
  if (!preg_match('/^\d{1,6}$/', $digits) || (int)$digits < 1) return ['error' => 'شماره کتاب باید یک عدد مثبت باشد.'];
  $book = ['number' => (int)$digits];
  foreach (['title', 'author', 'translator', 'publisher'] as $f) {
    $book[$f] = $clean($in[$f] ?? null);
    if ($book[$f] !== null && mb_strlen($book[$f]) > 200) return ['error' => "متن «{$f}» بیش از ۲۰۰ نویسه است."];
  }
  if (!$book['title']) return ['error' => 'عنوان کتاب لازم است.'];
  return ['book' => $book];
};

$books = $data['books'] ?? [];
$find = function (string $id) use (&$books): int { foreach ($books as $i => $b) if (($b['id'] ?? '') === $id) return $i; return -1; };
$action = $body['action'] ?? '';
if ($action === 'delete') {
  $i = $find((string)($body['id'] ?? ''));
  if ($i < 0) out(404, ['error' => 'کتاب پیدا نشد.']);
  $changed = $books[$i];
  array_splice($books, $i, 1);
} elseif ($action === 'add' || $action === 'update') {
  $r = $validate(is_array($body['book'] ?? null) ? $body['book'] : []);
  if (isset($r['error'])) out(422, ['error' => $r['error']]);
  if ($action === 'add') {
    $max = 0;
    foreach ($books as $b) if (preg_match('/^LIB-(\d+)$/', $b['id'] ?? '', $m)) $max = max($max, (int)$m[1]);
    $changed = ['id' => sprintf('LIB-%04d', $max + 1)] + $r['book'];
    $books[] = $changed;
  } else {
    $i = $find((string)($body['book']['id'] ?? ''));
    if ($i < 0) out(404, ['error' => 'کتاب پیدا نشد.']);
    $changed = ['id' => $books[$i]['id']] + $r['book'];
    $books[$i] = $changed;
  }
} else out(400, ['error' => 'unknown action']);

usort($books, fn($a, $b) => ($a['number'] <=> $b['number']) ?: strcmp($a['id'], $b['id']));
$next = ['updated' => gmdate('c'), 'count' => count($books), 'books' => $books];
if (isset($data['exported'])) $next['exported'] = $data['exported'];
$newVersion = catalog_write($next, $version);
if ($newVersion === null) out(409, ['error' => 'conflict']);
out(200, ['data' => $next, 'version' => $newVersion, 'changed' => $changed]);
