# Full Security Report

## 1. Scope and system

**Application:** the rebuilt website of Afarinesh lower-secondary school (Shiraz).
- **Repository:** this folder.
- **Live preview:** https://afarinesh-site.vercel.app (checked passively).
- **Planned host:** the school's LiteSpeed shared hosting (`research/hosting-plan.md`).

**Components:**
- Static pages: `index`, `pre-registration`, `careers`, `404`.
- Vanilla browser modules: `common.js`, `main.js`, `form-page.js`, `search.js`, `validate.js`.
- A Node HTTP server: `server/app.mjs`, `server/forms.mjs`, `server/index.mjs`.
- Vercel functions: `api/*.js`, which wrap the same form handler.
- Build scripts that never run in production.

Architecture, entry points and threat model are in `ATTACK_SURFACE_MAP.md`.

## 2. Methodology
See `TESTING_METHODOLOGY.md`. In short:
- full manual review of the code;
- secret scans of the working tree and the full git history;
- `npm audit` and `npm audit signatures`;
- two scripted probe runs against an isolated local instance;
- passive header checks on production.

## 3. Results by category

### A. Authentication: not applicable
There are no accounts, passwords, sessions, password resets, "remember me" or MFA. Nothing to test.

### B. Authorization and access control
- There is no read, update or delete API, so there is no IDOR or BOLA surface.
- Stored submissions are only on disk outside `public/` (own host) or in Telegram (Vercel).
- Probes for `/data/inquiry.jsonl`, `/.git/config`, `.env.local` and the server source through traversal all returned 404.

### C. Injection
- The server has no database, shell, template engine or `eval`.
- Payloads such as `{{7*7}}`, `${7*7}` and `<script>` were stored as inert text with `<>{}` stripped.
- No injection sink exists.

### D. Cross-site scripting
- Every dynamic DOM write uses `textContent` or `replaceChildren` with text.
- `innerHTML` appears once (`common.js:15`), with a constant template whose message is then set with `textContent`, so it is a false positive.
- The CSP has no `unsafe-inline`; the one inline script is pinned by SHA-256.
- Telegram messages are sent without `parse_mode`, so staff see the text exactly as typed and nothing is rendered.
- Result: not exploitable.

### E. CSRF and request security
Cross-site form submission is blocked, for four reasons:
- the site uses no cookies, so there is no ambient credential to abuse;
- the API requires `application/json`, so a `text/plain` body gets 415, and a browser must send a preflight first, which gets 405 with no CORS headers;
- a foreign or `null` `Origin` gets 403;
- no GET request changes anything.

Weakness: the origin check reads `X-Forwarded-Host` even without a proxy (SEC-07). Only scripts can exploit this, and scripts can post directly anyway.

### F. API security
- **Per-endpoint controls:** see `API_SECURITY_MATRIX.md`.
- **Confirmed weaknesses:**
  - flood-guard exhaustion (SEC-01);
  - national-ID pre-emption (SEC-02);
  - type coercion (SEC-05).
- **Probable:** per-instance limits on Vercel (SEC-03).
- **Mass assignment:** not possible.
- **Error messages:** fixed codes, no internals exposed.

### G. File upload: not applicable
There are no uploads. The site serves static media only.

### H. Database security: not applicable
There is no database yet.
- **Own host:** records are appended to `data/*.jsonl` with directory mode 700 and file mode 600.
- **Retention:** none (SEC-04).
- **Planned migration:** MySQL with parameterized queries, a user limited to INSERT and SELECT, and weekly backups (`research/hosting-plan.md`).

### I. Secrets and configuration
- No secrets were found in tracked files or in any of the 13 commits.
- `.env.local` holds only `VERCEL_OIDC_TOKEN`. It is gitignored and excluded from deploys by `.vercelignore`, and its value was not read.
- `TELEGRAM_BOT_TOKEN` exists only in the Vercel environment. Code uses it only to build the Telegram request URL, and never logs or returns it.
- Error objects from the Telegram call carry only the HTTP status (`telegram 4xx`).

### J. Headers and browser security
Strong. See `SECURITY_HEADERS_REPORT.md`. Optional additions are in SEC-13.

### K. Business logic
- **SEC-02, national-ID pre-emption:** the "once per national ID per day" rule meant to stop spam also lets a stranger lock a family out.
- **SEC-01, flood guard:** the guard meant to protect staff from floods could be spent by junk traffic.
- **Bot friction is client-controlled (SEC-09):** acceptable, because the server enforces the real limits.
- **No race conditions of consequence:** the limiter is synchronous within one process.

## 4. Probe evidence (before remediation)
These are excerpts. The full output is in `evidence/probe-before.txt` and `evidence/probe2-before.txt`.

```
GET /%2e%2e%2f.env.local                     404
GET /%E0%A4%A                                500 {"error":"server_error"}      <- SEC-06
text/plain body (form-CSRF shape)            415
foreign Origin                               403
forged X-Forwarded-Host matches evil Origin  201                               <- SEC-07
type confusion                               201 (stored "[object Object]")    <- SEC-05
proto pollution                              201, Object.prototype unchanged
mass assignment                              201, attacker id not stored
pre-reg attacker submits victim national ID  201
pre-reg real owner then blocked 24h          429 {"error":"duplicate"}         <- SEC-02
junk to careers from 125 IPs                 {"400":120,"429":5}
legit career from fresh IP after junk flood  429 {"error":"rate_limited"}      <- SEC-01
```

## 5. Areas not tested
- Production behaviour under load (SEC-03).
- The school's current WordPress host and its panel (no access yet).
- The library site, which is a separate project.
- Telegram channel membership and 2FA (organisational).
- Vercel and GitHub account security (2FA on both is recommended).

## 6. Conclusion
**Before remediation:**
- 0 Critical and 0 High findings;
- 2 confirmed Medium business-logic and availability issues;
- 1 probable Medium (rate limits on the hosting platform);
- 1 potential Medium (privacy and retention);
- 3 Low;
- 6 Informational.

The design itself keeps the risk low: no accounts, no database, no third-party code, and plain-text outputs. The fixes are in `POST_REMEDIATION_REPORT.md`.
