# استقرار روی cPanel میهن‌وب‌هاست

این پروژه دو Node.js App جدا می‌خواهد:

| برنامه | دامنه | startup file | دادهٔ ماندگار |
|---|---|---|---|
| سایت مدرسه | `afarineshshiraz.ir` | `server/index.mjs` | `DATA_DIR` بیرون از public root |
| کتابخانه | `library.afarineshshiraz.ir` | `scripts/dev-server.mjs` | `LOCAL_STORE_DIR` بیرون از public root |

قبل از جایگزینی `public_html` از File Manager و MySQL/WordPress فعلی backup کامل بگیرید. هر دو ZIP آماده‌اند:

- `release/afarinesh-main-cpanel-c312612.zip`
- `release/afarinesh-library-cpanel.zip`

در cPanel برای هر برنامه Node.js 20 یا بالاتر، startup file، `HOST=0.0.0.0` و `PORT` اختصاصی تنظیم کنید. برای سایت اصلی این متغیرها لازم‌اند: `SUPABASE_URL`، `SUPABASE_SECRET_KEY`، `TELEGRAM_BOT_TOKEN`، `TELEGRAM_CHAT_ID`، `ADMIN_PASSWORD_HASH`، `ADMIN_SESSION_SECRET`، `ADMIN_PUBLIC_URL` و `TRUST_PROXY=proxy`.

برای کتابخانه: `SITE_URL=https://library.afarineshshiraz.ir`، `LOCAL_STORE_DIR`، `ADMIN_PASSWORD`، و در صورت استفاده `SUPABASE_*` و متغیرهای Telegram را تنظیم کنید. رمزها داخل Git یا ZIP قرار نگیرند.

پس از ساخت app و تنظیم SSL/AutoSSL، ابتدا زیردامنه را تست کنید؛ سپس دامنه اصلی را به app وصل کنید. تا وقتی گزینه‌ی Node.js App/Passenger در cPanel تأیید نشده، `public_html` وردپرس فعلی نباید overwrite شود.
