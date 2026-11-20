<?php
// GET /library/api/books: the public catalog.
declare(strict_types=1);
require __DIR__ . '/_lib/lib.php';
if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'GET') out(405, ['error' => 'method not allowed']);
header('X-Robots-Tag: noindex');
http_response_code(200);
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: public, max-age=0, must-revalidate');
echo json_encode(catalog_current()['data'], JSON_UNESCAPED_UNICODE);
