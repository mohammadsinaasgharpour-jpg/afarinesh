# Remediation Roadmap

| Priority | ID | Action | Owner | Effort | Status |
|---|---|---|---|---|---|
| P0 (Critical) | n/a | No critical findings | n/a | n/a | n/a |
| P1 (High) | n/a | No high findings | n/a | n/a | n/a |
| P2 (Medium) | SEC-01 | Count only accepted submissions toward the flood guard | Code | Small | Fixed |
| P2 | SEC-02 | 3 submissions per national ID per 24 h, with repeats flagged to staff | Code | Small | Fixed |
| P2 | SEC-03 | Exact rate limits: move to the single-process own host (planned), or add a shared store on Vercel | Decision: hosting | Medium | Open (needs a decision) |
| P2 | SEC-04 | Private channel, minimal members, 2FA for all of them, deletion date for records and `data/*.jsonl` | School | Small | Open (organisational) |
| P3 (Low) | SEC-05 | Reject non-string field values | Code | Small | Fixed |
| P3 | SEC-06 | 400 for malformed percent-encoding | Code | Small | Fixed |
| P3 | SEC-07 | Trust `X-Forwarded-Host` only behind a configured proxy | Code | Small | Fixed |
| P4 (Informational) | SEC-08 | Hard cap on the limiter map | Code | Small | Fixed |
| P4 | SEC-10 | Valid certificates on every subdomain before enabling HSTS on the school domain | Migration | Small | Open (migration checklist) |
| P4 | SEC-12 | Upgrade local Node to 26.12.1 or later; pin `engines.node` to the host's LTS during the migration | Developer | Small | Open |
| P4 | SEC-13 | Optional `X-Frame-Options: DENY`, `Cross-Origin-Resource-Policy: same-origin` | Code | Small | Open (optional) |
| P4 | SEC-09, SEC-11 | No action (expected behaviour) | n/a | n/a | Accepted |

## Ordering rationale
- **SEC-01 and SEC-02 first:** they are cheap and confirmed, and they protect the enrolment period, which is when the forms matter most.
- **SEC-03 next, folded into the migration:** the school's host runs one process, where the existing limiter is exact, so no new service or cost is needed.
- **SEC-04 by school policy:** it needs no code, but carries the most weight for families, because the records are children's data.

## Before the domain switch (add to `research/hosting-plan.md` §6)
- [ ] Same security headers in `.htaccess` (copy from `vercel.json`).
- [ ] `TRUST_PROXY=proxy` only if LiteSpeed rewrites `X-Forwarded-For`; otherwise leave it unset.
- [ ] Valid certificates on `www.`, `mail.` and `library.` before HSTS goes live.
- [ ] `data/` outside the web root, mode 700, with a deletion date.
