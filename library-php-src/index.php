<?php
// The library homepage with the live catalog already in the HTML (port of api/home.js), so search engines
// and slow phones see the books before any script runs; app.js then takes over the same list.
declare(strict_types=1);
require __DIR__ . '/api/_lib/lib.php';

const PREVIEW = 3; // keep in step with PREVIEW in app.js
$esc = fn($s) => htmlspecialchars((string)$s, ENT_QUOTES, 'UTF-8');
$json = fn($v) => str_replace('<', '<', json_encode($v, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
$html = (string)file_get_contents(__DIR__ . '/home.html');
$data = catalog_current()['data'];
$books = $data['books'] ?? [];
usort($books, fn($a, $b) => ($a['number'] <=> $b['number']) ?: strcmp($a['id'], $b['id']));

$card = function (array $b, bool $hidden) use ($esc): string {
  $people = array_filter([['author', 'نویسنده'], ['translator', 'مترجم']], fn($p) => !empty($b[$p[0]]));
  $meta = $people ? '<dl class="book-meta">' . implode('', array_map(fn($p) => "<div><dt>{$p[1]}</dt><dd>" . $esc($b[$p[0]]) . '</dd></div>', $people)) . '</dl>' : '';
  $id = $esc($b['id']);
  return '<li' . ($hidden ? ' hidden' : '') . "><article class=\"book\" aria-labelledby=\"t-$id\">"
    . '<span class="book-number">شماره ' . fa_digits($b['number']) . '</span>'
    . "<h3 class=\"book-title\"><button type=\"button\" class=\"book-open\" id=\"t-$id\" aria-haspopup=\"dialog\" data-id=\"$id\">" . $esc($b['title']) . '</button></h3>'
    . $meta . '<div class="book-foot">'
    . (!empty($b['publisher']) ? '<p class="book-publisher">نشر ' . $esc($b['publisher']) . '</p>' : '')
    . "<button type=\"button\" class=\"request-btn\" data-request=\"$id\" aria-haspopup=\"dialog\" aria-label=\"درخواست امانت «" . $esc($b['title']) . '»">درخواست امانت</button>'
    . '</div></article></li>';
};
$count = fn($key) => count(array_unique(array_filter(array_map(fn($b) => $b[$key] ?? null, $books))));
$rest = count($books) - PREVIEW;
$site = LIB_URL . '/';
$ld = ['@context' => 'https://schema.org', '@graph' => [
  ['@type' => 'WebSite', '@id' => "{$site}#website", 'url' => $site, 'inLanguage' => 'fa', 'name' => 'کتابخانه مدرسه آفرینش',
    'potentialAction' => ['@type' => 'SearchAction', 'target' => ['@type' => 'EntryPoint', 'urlTemplate' => "{$site}?q={search_term_string}"], 'query-input' => 'required name=search_term_string']],
  ['@type' => 'CollectionPage', '@id' => "{$site}#catalog", 'url' => $site, 'inLanguage' => 'fa', 'name' => 'فهرست کتاب‌های کتابخانه مدرسه آفرینش',
    'mainEntity' => ['@type' => 'ItemList', 'numberOfItems' => count($books), 'itemListElement' => array_map(fn($b, $i) => ['@type' => 'ListItem', 'position' => $i + 1,
      'item' => array_filter(['@type' => 'Book', 'name' => $b['title'], 'identifier' => $b['id'], 'inLanguage' => 'fa',
        'author' => !empty($b['author']) ? ['@type' => 'Person', 'name' => $b['author']] : null,
        'publisher' => !empty($b['publisher']) ? ['@type' => 'Organization', 'name' => $b['publisher']] : null])], $books, array_keys($books))]],
]];
$cards = implode('', array_map(fn($b, $i) => $card($b, $i >= PREVIEW), $books, array_keys($books)));
$html = preg_replace('/<!--SSR:BOOKS-N-->[\s\S]*?<!--\/SSR:BOOKS-N-->/', fa_digits(count($books)), $html);
$html = preg_replace('/<!--SSR:AUTHORS-N-->[\s\S]*?<!--\/SSR:AUTHORS-N-->/', fa_digits($count('author')), $html);
$html = preg_replace('/<!--SSR:PUBLISHERS-N-->[\s\S]*?<!--\/SSR:PUBLISHERS-N-->/', fa_digits($count('publisher')), $html);
$html = preg_replace_callback('/<!--SSR:BOOKS-->[\s\S]*?<!--\/SSR:BOOKS-->/', fn() => $cards, $html);
$html = preg_replace('/<!--SSR:MORE-HIDDEN-->[\s\S]*?<!--\/SSR:MORE-HIDDEN-->/', $rest > 0 ? '' : ' hidden', $html);
$html = str_replace('<!--SSR:MORE-STATUS-->', fa_digits(min(PREVIEW, count($books))) . ' کتاب از ' . fa_digits(count($books)) . ' کتاب نمایش داده شده است', $html);
$html = str_replace('<!--SSR:MORE-BTN-->', $rest > 0 ? 'نمایش بیشتر (' . fa_digits($rest) . ' کتاب دیگر)' : '', $html);
$html = str_replace('<!--SSR:HEAD-->', '<script type="application/ld+json">' . $json($ld) . "</script>\n  <script type=\"application/json\" id=\"catalog-data\">" . $json($data) . '</script>', $html);
$html = str_replace(['aria-busy="true"', '<!--SSR:BOT-->'], ['aria-busy="false"', ''], $html);

header('Content-Type: text/html; charset=utf-8');
header('Cache-Control: public, max-age=0, must-revalidate');
echo $html;
