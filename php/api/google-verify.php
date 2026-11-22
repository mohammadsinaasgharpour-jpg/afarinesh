<?php
// Serves Google Search Console's verification file (googleXXXXXXXX.html) for the account the vice-principal
// chose: its name is saved in the admin panel (settings), so verifying needs no change to the site's code.
declare(strict_types=1);
require_once __DIR__ . '/_lib/bootstrap.php';

$name = basename((string)($_GET['f'] ?? ''));
$saved = (string)(secrets()['google_file'] ?? '');
if ($saved === '' || !hash_equals($saved, $name)) { http_response_code(404); header('Content-Type: text/plain; charset=utf-8'); echo 'Not found'; exit; }
header('Content-Type: text/html; charset=utf-8');
header('Cache-Control: no-store');
echo "google-site-verification: $saved";
