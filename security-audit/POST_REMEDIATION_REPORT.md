# Post-Remediation Report

- **Remediation:** after the checkpoint commit `9153182` (tag `pre-security-fixes`), 2026-11-03.
- **Re-test method:** the same two probe scripts (`evidence/probe*.mjs`), run again unchanged, plus the full unit and UI test suites.
- **Raw output:** `evidence/probe-after.txt`, `evidence/probe2-after.txt`.

## Before and after

| ID | Test | Before | After | Result |
|---|---|---|---|---|
| SEC-01 | 125 junk requests from 125 IPs, then one real job application from a new IP | Junk: `{"400":120,"429":5}`; real application: **429 rate_limited** | Junk: `{"400":125}`; real application: **201** | Fixed |
| SEC-02 | Stranger submits a child's national ID, then the family submits | Family: **429 duplicate** (locked out for 24 h) | Family: **201**, stored with `repeat: 2`; the Telegram message opens with a warning for staff; the 4th submission within 24 h still gets 429 | Fixed |
| SEC-05 | `parentName: {a:1}`, `phone: [..]`, `grade: ["7"]` | **201**, stored `"[object Object]"` | **422** with errors for all three fields | Fixed |
| SEC-06 | `GET /%E0%A4%A` | **500** + `URIError` in the error log | **400**, no error logged | Fixed |
| SEC-07 | Foreign Origin + forged `X-Forwarded-Host`, no proxy configured | **201** | **403** | Fixed |
| SEC-08 | 1,000 addresses into a limiter capped at 100 | Unbounded within the window | Oldest entries dropped; the map stays at the cap | Fixed |
| SEC-03 | Per-instance limits on Vercel | Best-effort | Unchanged: needs the own-host migration or a shared store | Open (decision) |
| SEC-04 | Retention, Telegram as store | No retention | Unchanged: organisational | Open (school policy) |
| SEC-09 to SEC-13 | Informational | n/a | Unchanged; see the roadmap | Accepted / open |

## Nothing else regressed

| Check | Before | After |
|---|---|---|
| Path traversal variants (11) | All 404 | All 404 |
| Foreign / `null` Origin | 403 | 403 |
| `text/plain` body | 415 | 415 |
| Oversized body | 413 | 413 |
| Prototype pollution | Not polluted | Not polluted |
| Mass assignment | Ignored | Ignored |
| XSS / template payloads | Stored inert, angle brackets stripped | Same |
| Per-IP limit (careers, 3/h) | `201,201,201,429…` | Same |
| Per-phone limit (inquiry, 2/h) | 3rd gets 429 | Same |
| Security headers on pages, 404 and API | Present | Present |
| Unit tests | 60 pass | **66 pass** (6 new security regressions) |
| UI tests (desktop and mobile) | 45 pass, 1 skipped | 45 pass, 1 skipped |
| `npm audit` | 0 | 0 |

## Code changes

| File | Change |
|---|---|
| `server/forms.mjs` | The flood guard counts only accepted submissions. National-ID limit raised to 3 per 24 h, and repeats are recorded (`repeat`) and flagged in the staff message. `X-Forwarded-Host` is read only behind a configured proxy. The limiter has a size cap and a `count()` helper |
| `server/app.mjs` | Undecodable paths get 400 |
| `public/assets/js/validate.js` | Field values that are not text or numbers count as empty, so validation rejects them. The browser and the server share this file, so both behave the same |
| `tests/server.test.mjs`, `tests/telegram.test.mjs` | Regression tests for SEC-01, 02, 05, 06, 07, 08 and the repeat flag |

## Behaviour changes to note
- **Family resubmits pre-registration:** a family that resubmits now gets "submitted" instead of "already submitted". Staff see a warning line on the 2nd and 3rd submission for the same ID and should confirm by phone which record is genuine.
- **Flood guard:** it still caps the staff channel at 120 accepted submissions per form per hour, per process.
- **No authentication, authorization, database or infrastructure changes:** none were made, because none exist in this application.

## Still open
SEC-03 (rate limits on Vercel) and SEC-04 (retention and channel access) need decisions; see `REMEDIATION_ROADMAP.md`. Nothing has been deployed: the changes are local commits only.
