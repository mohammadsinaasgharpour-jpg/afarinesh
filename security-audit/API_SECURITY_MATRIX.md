# API Security Matrix

All three form endpoints go through `createFormHandler` in `server/forms.mjs`. The same handler runs on Vercel (`api/*.js`) and on the own-host server (`server/app.mjs`).

| Control | `/api/inquiries` | `/api/pre-registration` | `/api/careers` | `/api/health` |
|---|---|---|---|---|
| Methods | POST only (405 + `Allow`) | POST only | POST only | GET (any method answers 200 on own host) |
| Authentication | None, by design (public form) | None, by design | None, by design | None |
| Authorization / object access | No read or update operations exist | Same | Same | n/a |
| Content type | `application/json` required (415) | Same | Same | n/a |
| Body size | 4 KB, by header and streamed (413) | 8 KB | 4 KB | n/a |
| Schema validation | Allowlist: name 3-60, Iranian mobile, grade 7/8/9, message ≤ 500 with no links | 20 fields; national-ID checksum; Jalali date; enums; GPA 0-20; consent required | Name, field, degree enum, experience enum, phone, consent | n/a |
| Type strictness | Objects and arrays coerced to strings (SEC-05) | Same | Same | n/a |
| Mass assignment | Not possible: record built from the validated value only | Same | Same | n/a |
| Output encoding | JSON responses; Telegram plain text, `parse_mode` unset | Same | Same | Static |
| Error detail | Fixed error codes; field messages are fixed strings; no stack traces | Same | Same | n/a |
| Rate limit per IP | 5 / 10 min | 4 / hour | 3 / hour | none |
| Rate limit per subject | 2 per phone / hour | 1 per national ID / 24 h (SEC-02) | 1 per phone / 24 h | n/a |
| Flood guard | 120 / hour, spent by junk requests too (SEC-01) | Same | Same | n/a |
| Limit storage | In memory: exact on one process, per instance on Vercel (SEC-03) | Same | Same | n/a |
| CSRF / Origin | Foreign or `null` Origin gets 403; no cookies; JSON forces a preflight, which gets 405 | Same | Same | n/a |
| CORS | No CORS headers sent (same-origin only) | Same | Same | None (Vercel adds `*` to static files only) |
| Bot friction | Honeypot `website`, minimum fill time 3 s (client-supplied) | Same | Same | n/a |
| Logging | Form kind and record id only | Same | Same | none |
| Caching | `Cache-Control: no-store` | Same | Same | `no-store` |
| Data exposure in response | `{ok, id}` | Same | Same | `{ok}` |

Probe results for every row are in `FULL_SECURITY_REPORT.md` §4.
