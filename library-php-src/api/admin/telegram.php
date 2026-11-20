<?php
// The library's own Telegram bot settings belonged to the Vercel version. On this host Telegram is blocked,
// so book requests go to the school's staff channel through the relay instead; this panel section says so.
declare(strict_types=1);
require dirname(__DIR__) . '/_lib/lib.php';
if (!is_admin()) out(401, ['error' => 'sign in required']);
out(503, ['error' => 'روی این هاست تلگرام مستقیم در دسترس نیست؛ درخواست‌های امانت در پنل مدیر (بخش کتابخانه) و کانال کارکنان مدرسه می‌آیند.']);
