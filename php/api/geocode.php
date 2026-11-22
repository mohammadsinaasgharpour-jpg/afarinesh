<?php
// POST /api/geocode {address}: checks whether an address typed in the pre-registration form can be found on a map
// of Shiraz. The answer is only advice shown under the field; the form is never refused because of it. Neshan is
// asked when a Neshan key is saved in the admin panel, otherwise OpenStreetMap. Nothing is stored.
declare(strict_types=1);
require_once __DIR__ . '/_lib/bootstrap.php';
set_time_limit(20);

// Shiraz and its suburbs, as a box: west, north, east, south
const SHIRAZ = [52.35, 29.78, 52.72, 29.48];

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') out(405, ['error' => 'method_not_allowed']);
require_same_origin();
$address = trim((string)(read_json(2048)['address'] ?? ''));
if (mb_strlen($address) < 10 || mb_strlen($address) > 250 || !preg_match('/\p{Arabic}/u', $address)) out(422, ['error' => 'invalid']);
if (!rate_hit('geo:' . client_ip(), 30, 3600)) out(429, ['error' => 'rate_limited']);

function get_json(string $url, array $headers): ?array {
  $ch = curl_init($url);
  curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_CONNECTTIMEOUT => 5, CURLOPT_TIMEOUT => 8, CURLOPT_HTTPHEADER => $headers]);
  $raw = curl_exec($ch);
  $code = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
  curl_close($ch);
  return $code === 200 ? (json_decode((string)$raw, true) ?: []) : null;
}
function in_shiraz(float $lat, float $lng): bool {
  return $lng >= SHIRAZ[0] && $lng <= SHIRAZ[2] && $lat >= SHIRAZ[3] && $lat <= SHIRAZ[1];
}

// the parts after the street (plate, unit, floor, landmarks) are not on any map: try the address without them,
// then with fewer parts each time, so a correct street is still found
$parts = array_values(array_filter(array_map('trim', preg_split('/[،,]+/u', $address))));
$parts = array_values(array_filter($parts, fn($p) => !preg_match('/^(شیراز|استان|فارس)\b/u', $p)));
$streetParts = array_values(array_filter($parts, fn($p) => !preg_match('/(پلاک|واحد|طبقه|زنگ|روبه|روبرو|جنب|کنار|نبش|درب|درِ|ساختمان|مجتمع|بلوک)/u', $p)));
if (!$streetParts) $streetParts = $parts;
$tries = [];
for ($n = count($streetParts); $n >= 1 && count($tries) < 3; $n--) $tries[] = implode('، ', array_slice($streetParts, 0, $n));
$tries = array_values(array_unique($tries));

$neshan = (string)(secrets()['neshan_key'] ?? '');
foreach ($tries as $i => $q) {
  if ($neshan !== '') {
    $j = get_json('https://api.neshan.org/v4/geocoding?' . http_build_query(['address' => "شیراز، $q"]), ['Api-Key: ' . $neshan]);
    if ($j === null) out(200, ['ok' => true, 'found' => 'unavailable']);
    $loc = $j['location'] ?? null;
    if (($j['status'] ?? '') === 'OK' && $loc && in_shiraz((float)$loc['y'], (float)$loc['x'])) {
      out(200, ['ok' => true, 'found' => $i === 0 ? 'street' : 'area', 'lat' => round((float)$loc['y'], 5), 'lng' => round((float)$loc['x'], 5), 'label' => $q]);
    }
    continue;
  }
  // OpenStreetMap's public geocoder asks for at most one request a second and a name for the caller
  if ($i > 0) usleep(1_100_000);
  $j = get_json('https://nominatim.openstreetmap.org/search?' . http_build_query([
    'q' => $q, 'format' => 'jsonv2', 'limit' => 1, 'countrycodes' => 'ir', 'accept-language' => 'fa',
    'viewbox' => implode(',', SHIRAZ), 'bounded' => 1,
  ]), ['User-Agent: afarinesh-school-site/1.0 (' . SITE_URL . ')', 'Referer: ' . SITE_URL]);
  if ($j === null) out(200, ['ok' => true, 'found' => 'unavailable']);
  if ($hit = $j[0] ?? null) {
    $street = in_array($hit['category'] ?? $hit['class'] ?? '', ['highway', 'building', 'amenity', 'shop', 'place'], true) && ($hit['addresstype'] ?? '') !== 'suburb';
    $label = implode('، ', array_slice(array_map('trim', explode(',', (string)($hit['display_name'] ?? $q))), 0, 3));
    out(200, ['ok' => true, 'found' => $i === 0 && $street ? 'street' : 'area', 'lat' => round((float)$hit['lat'], 5), 'lng' => round((float)$hit['lon'], 5), 'label' => $label]);
  }
}
out(200, ['ok' => true, 'found' => 'none']);
