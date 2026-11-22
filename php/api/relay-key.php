<?php
// GET /api/relay-key: the public half of the key this host signs its Vercel relay messages with. It is public
// by design (Vercel checks signatures with it); the private half never leaves the host.
declare(strict_types=1);
require_once __DIR__ . '/_lib/bootstrap.php';

$pk = relay_public_key();
if (!$pk) out(503, ['error' => 'sodium_unavailable']);
out(200, ['ok' => true, 'publicKey' => $pk]);
