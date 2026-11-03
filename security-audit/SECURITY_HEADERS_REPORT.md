# Security Headers Report

The same headers come from `buildSecurityHeaders()` in `server/app.mjs` (own host) and from the generated `vercel.json` (Vercel). Production was checked passively with `curl -I` on 2026-11-03.

| Header | Value | Own host (local probe) | Production | Assessment |
|---|---|---|---|---|
| Content-Security-Policy | `default-src 'self'; img-src 'self' data:; style-src 'self'; font-src 'self'; script-src 'self' 'sha256-…'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'` | Present on pages, 404 and API | Present on pages and API | Strong: no `unsafe-inline` or `unsafe-eval`; the one inline script is pinned by hash |
| Strict-Transport-Security | `max-age=31536000; includeSubDomains` | Present | Present | Good. See SEC-10 before moving to the school domain (`mail.` subdomain) |
| X-Content-Type-Options | `nosniff` | Present | Present | Good |
| Referrer-Policy | `strict-origin-when-cross-origin` | Present | Present | Good |
| Permissions-Policy | `camera=(), microphone=(), geolocation=(), interest-cohort=()` | Present | Present | Good |
| Cross-Origin-Opener-Policy | `same-origin` | Present | Present | Good |
| X-Frame-Options | absent | Absent | Absent | Covered by `frame-ancestors`; optional `DENY` for old browsers (SEC-13) |
| Cross-Origin-Resource-Policy | absent | Absent | Absent | Optional `same-origin` (SEC-13) |
| Access-Control-Allow-Origin | absent | Absent | `*` on static files (Vercel default), absent on `/api/*` | Harmless for public files (SEC-11) |
| Server / X-Powered-By | absent | Absent | `Server: Vercel` | Fine |
| Cache-Control on API | `no-store` | Present | Present | Personal data never cached |
| Cookies | none set | n/a | n/a | No session cookies exist, so Secure, HttpOnly and SameSite do not apply |
| HTTPS enforcement | n/a locally | n/a | `http://` gets 308 to `https://` | Good |

## For the planned move to the school's LiteSpeed host
The same headers must be added in `.htaccess`, and the CSP hash must be regenerated with `npm run build` whenever the inline theme script changes. The checklist in `research/hosting-plan.md` §6 already covers this.
