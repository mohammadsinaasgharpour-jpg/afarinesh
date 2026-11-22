<?php
// POST /api/transcribe: a short recording of an address (sent by the form's microphone button) becomes Persian
// text through Gemini. The browser's own speech recognition goes through Google servers that are blocked in
// Iran, and Google refuses Gemini calls from Iranian servers, so calls go through the Vercel relay. Keys entered in the admin panel are tried in turn, then Vercel's AI
// Gateway, which needs no key. Nothing is stored.
declare(strict_types=1);
require_once __DIR__ . '/_lib/bootstrap.php';
set_time_limit(40);

const MAX_AUDIO = 1_500_000; // about 45 seconds of compressed speech

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') out(405, ['error' => 'method_not_allowed']);
require_same_origin();
if (!rate_hit('voice:' . client_ip(), 12, 3600)) out(429, ['error' => 'rate_limited'], ['Retry-After' => '600']);
// the page sends {type, audio: base64} as JSON: the host's firewall refuses a raw audio upload with a 403
$type = strtolower(trim(explode(';', (string)($_SERVER['CONTENT_TYPE'] ?? ''))[0]));
if ($type === 'application/json') {
  $j = read_json((int)(MAX_AUDIO * 1.4) + 1024);
  $type = strtolower(trim(explode(';', (string)($j['type'] ?? ''))[0]));
  $audio = base64_decode((string)($j['audio'] ?? ''), true);
} else {
  $audio = file_get_contents('php://input', false, null, 0, MAX_AUDIO + 1);
}
if (!in_array($type, ['audio/webm', 'audio/ogg', 'audio/mp4', 'audio/mpeg', 'audio/wav', 'audio/aac', 'audio/x-m4a'], true)) out(415, ['error' => 'unsupported_type']);
if ($audio === false || strlen($audio) < 800) out(400, ['error' => 'empty']);
if (strlen($audio) > MAX_AUDIO) out(413, ['error' => 'too_long']);

$keys = secrets()['gemini_keys'] ?? [];

function gemini_call(string $path, string $key, ?array $body = null): array {
  // Google refuses Gemini calls from Iranian servers, so they go through the Vercel relay (api/gemini.js).
  // With no key, Vercel answers through its own AI Gateway, so voice input works before any key is added.
  $payload = json_encode(['ts' => time(), 'path' => $path, 'key' => $key, 'body' => $body], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
  $ch = curl_init(relay_url('gemini'));
  curl_setopt_array($ch, [CURLOPT_POST => true, CURLOPT_POSTFIELDS => $payload, CURLOPT_RETURNTRANSFER => true,
    CURLOPT_CONNECTTIMEOUT => 8, CURLOPT_TIMEOUT => 35, CURLOPT_HTTPHEADER => relay_headers($payload)]);
  $raw = curl_exec($ch);
  $code = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
  curl_close($ch);
  return [$code, json_decode((string)$raw, true) ?: []];
}

/** The newest general "flash" model this key can use, remembered for a day. */
function model_for(string $key): string {
  if ($key === '') return 'gemini-2.5-flash';
  $cacheFile = SECRETS_DIR . '/gemini-models.json';
  $cache = is_file($cacheFile) ? (json_decode((string)file_get_contents($cacheFile), true) ?: []) : [];
  $id = substr(hash('sha256', $key), 0, 12);
  if (isset($cache[$id]) && $cache[$id]['at'] > time() - 86400) return $cache[$id]['model'];
  [$code, $j] = gemini_call('models?pageSize=1000', $key);
  $best = 'gemini-2.5-flash';
  if ($code === 200) {
    $names = [];
    foreach ($j['models'] ?? [] as $m) {
      $name = preg_replace('#^models/#', '', (string)($m['name'] ?? ''));
      if (in_array('generateContent', $m['supportedGenerationMethods'] ?? [], true) && preg_match('/^gemini-(\d+(?:\.\d+)?)-flash$/', $name, $v)) $names[$name] = (float)$v[1];
    }
    if ($names) { arsort($names); $best = array_key_first($names); }
  }
  $cache[$id] = ['model' => $best, 'at' => time()];
  @file_put_contents($cacheFile, json_encode($cache));
  return $best;
}

$prompt = 'این صدای یک نفر است که نشانی منزلش در شیراز را می‌گوید. فقط همان نشانی را به فارسی و با املای درست بنویس؛ '
  . 'عددها را با رقم فارسی بنویس (مثلاً «پلاک ۱۲»)، «خیابان»، «کوچه» و «پلاک» را کامل بنویس، و هیچ توضیح یا جمله‌ی دیگری اضافه نکن. '
  . 'اگر صدایی شنیده نمی‌شود یا نشانی گفته نشده، فقط بنویس: —';
$body = ['contents' => [['parts' => [['text' => $prompt], ['inlineData' => ['mimeType' => $type, 'data' => base64_encode($audio)]]]]],
  'generationConfig' => ['temperature' => 0, 'maxOutputTokens' => 300]];

// the keys saved in the admin panel, then Vercel's own gateway (the empty key) when all of them fail
$keys[] = '';
$start = (int)(secrets()['gemini_next'] ?? 0) % count($keys);
$n = count($keys);
for ($i = 0; $i < $n; $i++) {
  $k = ($start + $i) % $n;
  $key = $keys[$k];
  [$code, $j] = gemini_call('models/' . model_for($key) . ':generateContent', $key, $body);
  if ($code === 200) {
    if ($k !== $start && $key !== '') save_secrets(['gemini_next' => $k]);
    $text = trim(implode('', array_map(fn($p) => $p['text'] ?? '', $j['candidates'][0]['content']['parts'] ?? [])));
    $text = trim(preg_replace('/\s+/u', ' ', strip_tags($text)), " \t\n\r\0\x0B«»\"'.");
    if ($text === '' || $text === '—') out(422, ['error' => 'no_speech']);
    out(200, ['ok' => true, 'text' => mb_substr($text, 0, 250)]);
  }
  // quota, rate limit, a disabled or wrong key: try the next one; anything else is a real failure
  if (!in_array($code, [400, 401, 403, 429, 500, 503], true)) break;
}
// the last upstream answer, short and without any key, so a failure can be told apart (relay, gateway, quota)
out(502, ['error' => 'voice_unavailable', 'upstream' => $code, 'detail' => mb_substr((string)($j['error']['message'] ?? $j['error'] ?? ''), 0, 160) . ' ' . mb_substr((string)($j['detail'] ?? ''), 0, 160)]);
