# Attack Surface Map

## Architecture

```
Visitor's browser
   |  HTTPS
   v
Vercel edge (today) / LiteSpeed on the school's host (planned)
   |-- static files from public/  (HTML, CSS, ES modules, fonts, images)
   |-- /api/inquiries, /api/pre-registration, /api/careers  -> server/forms.mjs (one shared handler)
   |-- /api/health
   v
Telegram Bot API (api.telegram.org)  -> the school's private channel
data/<form>.jsonl on disk (own-host server only)
```

- **Frontend:** hand-written HTML, CSS and vanilla ES modules. No framework and no third-party scripts, fonts or analytics.
- **Backend:** Node built-ins only (`node:http`, `node:fs`, `node:crypto`, `node:zlib`). There are no runtime npm dependencies.
- **Shared validation:** `public/assets/js/validate.js` runs in both the browser and the server.
- **Build scripts:** `scripts/*.mjs`. They run only on the developer machine and are never exposed.

## Entry points

| # | Entry point | Method | Auth | Input | Notes |
|---|---|---|---|---|---|
| E1 | `/`, `/pre-registration`, `/careers`, `/404` | GET/HEAD | none | URL path | Clean URLs; own server resolves paths inside `public/` |
| E2 | `/assets/**`, `/robots.txt`, `/sitemap.xml`, `/manifest.webmanifest` | GET/HEAD | none | URL path | Media cached for 7 days |
| E3 | `/api/inquiries` | POST | none | JSON (max 4 KB) | Callback request |
| E4 | `/api/pre-registration` | POST | none | JSON (max 8 KB) | Child's national ID, birth date, address, parents' mobiles |
| E5 | `/api/careers` | POST | none | JSON (max 4 KB) | Applicant name, field, degree, phone |
| E6 | `/api/health` | GET | none | none | Returns `{ok:true}` |
| E7 | Request headers | any | none | `Origin`, `Host`, `X-Forwarded-*`, `X-Vercel-Forwarded-For`, `Accept-Encoding`, `If-None-Match` | IP and origin decisions |

Outbound calls: only `POST https://api.telegram.org/bot<token>/sendMessage`, with an 8 s timeout and plain text. The URL is fixed and nothing a visitor sends can change it, so there is no SSRF.

## Trust boundaries

1. **Browser to server:** every request body and header is untrusted. Client-side validation is for convenience only, and the server re-validates.
2. **Proxy to server:** forwarding headers are trusted only when `TRUST_PROXY` is set, or on Vercel.
3. **Server to Telegram:** the token comes from an environment variable and never reaches the browser, the logs or the repository.
4. **Telegram channel to staff:** the channel members are the people who can read the personal data.

## Critical assets

| Asset | Where | Sensitivity |
|---|---|---|
| Pre-registration records (minors' national ID, date of birth, address, parents' phones) | Telegram channel; `data/preRegistration.jsonl` on the own host | High (personal data of children) |
| Callback and job-application records (names, phones) | Same | Medium |
| `TELEGRAM_BOT_TOKEN` | Vercel environment / host environment | High (whoever holds it can post to and read the bot's chats) |
| Availability of the forms during the enrolment period | Server | Medium (business) |
| Site integrity (defacement) | Vercel deployment / host files | Medium |

## Threat model

| Attacker | Realistic goals | Paths examined | Result |
|---|---|---|---|
| Unauthenticated visitor | Read other people's submissions | No read API exists; data files are outside `public/`; path traversal blocked | No path found |
| Automated bot | Spam the channel, take the forms offline | Rate limits, flood guard, validation | SEC-01 (form lockout), SEC-03 (per-instance limits on Vercel) |
| Malicious visitor with a victim's details | Block or impersonate an applicant | National-ID dedupe | SEC-02 |
| Malicious third-party site | Make visitors' browsers submit forms | JSON content type, Origin check, no cookies | Blocked |
| Script-injection attacker | XSS against visitors or staff | Strict CSP, `textContent` only, angle brackets stripped, plain-text Telegram | Blocked |
| Registered user, privilege escalation, malicious admin | Not applicable | The site has no accounts, roles or admin panel | n/a |
| Compromised Telegram member account or bot token | Read every submission | Outside the code | SEC-04 (organisational controls) |
| Compromised developer machine or Vercel account | Change the site | Outside the code | Use 2FA on Vercel and GitHub; tokens stay in `.env.local` (gitignored) |

## STRIDE summary

| | Finding |
|---|---|
| Spoofing | Origin check uses a spoofable header without a proxy (SEC-07, low) |
| Tampering | Fake applications under someone else's national ID (SEC-02) |
| Repudiation | Each record has a UUID and timestamp; the logs keep ids only |
| Information disclosure | Nothing exposed by the code; retention and Telegram exposure are organisational (SEC-04) |
| Denial of service | Form lockout (SEC-01), per-instance limits (SEC-03), limiter memory (SEC-08) |
| Elevation of privilege | No privileges exist |
