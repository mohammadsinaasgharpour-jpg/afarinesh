# Testing Methodology

## Rules of engagement
- **Active tests:** only against a local instance of `server/app.mjs` started in-process, with a fresh temporary data folder and with `TELEGRAM_BOT_TOKEN` / `TELEGRAM_CHAT_ID` unset, so nothing was sent to Telegram.
- **Synthetic data only:** generated test names, `0912…` test mobiles, and a national ID built from a made-up prefix with a computed check digit.
- **Production (`afarinesh-site.vercel.app`):** passive only, with a few `curl -I` header requests. No payloads, no form submissions and no load.
- **Out of scope:**
  - the school library site (a separate project);
  - the school's current WordPress host (no access yet);
  - Telegram's and Vercel's own infrastructure.
- **No destructive actions:** nothing was deleted, no persistent changes were made, and no real records were read.

## Steps
1. **Reconnaissance:**
   - listed every tracked file;
   - read all server, API, build and client code (about 1,250 lines);
   - read the deploy config (`vercel.json`, `.vercelignore`, `.gitignore`) and the package manifests;
   - listed the names (not the values) of variables in `.env.local`.
2. **Threat model:** assets, trust boundaries, attacker profiles and STRIDE (`ATTACK_SURFACE_MAP.md`).
3. **Static review:**
   - DOM sinks (`innerHTML`, `eval`, `document.write`, storage, `postMessage`);
   - path handling, header trust, the error paths, rate-limit logic, and how validation treats types.
4. **Secrets:** regex scan of the working tree and `git log --all -p` for Telegram bot tokens, AWS keys, private keys, GitHub tokens, `sk-` keys, Slack tokens and password assignments.
5. **Dependencies:** `npm audit`, `npm audit signatures`, `npm ls --all`.
6. **Probe 1** (`probe-before.txt`, all requests from 127.0.0.1):
   - path traversal variants, null byte, malformed percent-encoding;
   - HTTP methods and the security headers on 200, 404 and API responses;
   - content type, size and JSON-shape errors;
   - Origin checks (foreign, `null`, forged `X-Forwarded-Host`);
   - pre-registration national-ID pre-emption;
   - per-IP limits.
7. **Probe 2** (`probe2-before.txt`), with `trustProxy: "proxy"` so each request could carry a distinct documentation-range IP (198.51.100.0/24, 203.0.113.0/24, 192.0.2.0/24):
   - type confusion, XSS and template payloads, prototype pollution, mass assignment;
   - honeypot and timing, bidi and zero-width characters, links in the message, phone dedupe;
   - flood-guard exhaustion followed by one legitimate request.
8. **Passive production check:** headers on `/` and `/api/health`, and the HTTP-to-HTTPS redirect.
9. **Re-test after fixes:** the same probes plus regression tests in `tests/server.test.mjs`.

## Tool limitations
- Semgrep, Gitleaks, Trivy and OWASP ZAP are not installed, and nothing was installed for this audit. Manual review and scripted probes covered their ground for a codebase of this size.
- Vercel's multi-instance rate-limit behaviour (SEC-03) cannot be shown without load on production.
- Telegram channel membership and the 2FA status of member accounts cannot be checked from the code.
