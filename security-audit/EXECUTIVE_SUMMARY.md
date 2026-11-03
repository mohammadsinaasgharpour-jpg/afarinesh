# Executive Summary: Security Audit of afarineshshiraz.ir (rebuild)

**Date:** 2026-11-03
**Scope:**
- the site's code (static pages, a Node server and three Vercel form functions);
- passive header checks of the live preview at afarinesh-site.vercel.app.

## Bottom line

The site is in good shape. It has a small attack surface by design: no logins, no database, no file uploads, no third-party scripts and no runtime npm packages.

Strict CSP, server-side validation, plain-text output and same-origin-only APIs block the classic web attacks:
- cross-site scripting;
- injection;
- path traversal;
- cross-site request forgery;
- data leaks.

No Critical or High issues were found, and no secrets were found in the code or its history.

The real risks are about **availability and trust in the enrolment forms**, plus **how the children's data is kept**:

1. **Form lockout:** anyone with a few dozen IP addresses could switch the online forms off for an hour at a time during enrolment (SEC-01, confirmed).
2. **National-ID pre-emption:** someone who knows a child's national ID could pre-register first with fake details, and the real family would be refused for 24 hours (SEC-02, confirmed).
3. **Per-instance limits on Vercel:** the spam limits are only best-effort while the site runs on Vercel. They become exact after the planned move to the school's own host (SEC-03).
4. **Data retention:** pre-registration data (children's national IDs, birth dates, addresses) is kept with no end date, and on Vercel its only copy is the school's Telegram channel (SEC-04). That calls for school policy (who is in the channel, two-step verification on their accounts, when records are deleted) more than code.

## Findings

| Severity | Count | Confirmed | Probable or potential |
|---|---|---|---|
| Critical | 0 | 0 | 0 |
| High | 0 | 0 | 0 |
| Medium | 4 | 2 (SEC-01, SEC-02) | 2 (SEC-03 probable, SEC-04 potential) |
| Low | 3 | 3 (SEC-05, SEC-06, SEC-07) | 0 |
| Informational | 6 | 4 | 2 |
| **Total** | **13** | **9** | **4** |

Full list: `VULNERABILITY_REGISTER.md`. Fix plan: `REMEDIATION_ROADMAP.md`. Before-and-after results: `POST_REMEDIATION_REPORT.md`.

## What was fixed in code (no new services, no change to how the site is hosted)

| ID | Fix |
|---|---|
| SEC-01 | Only accepted submissions count toward the hourly flood guard, so junk traffic can no longer lock real families out |
| SEC-02 | A national ID can be submitted up to 3 times per day instead of once. Every repeat is flagged to staff in the Telegram message |
| SEC-05 | Malformed field types are rejected |
| SEC-06 | Malformed URLs get a clean 400 |
| SEC-07 | The origin check trusts forwarding headers only behind a known proxy |
| SEC-08 | The rate-limit memory is capped |

## What needs a decision from the school
- **SEC-03:** keep best-effort limits until the move to the school's host, or add a shared counter service on Vercel now. That is a new external service.
- **SEC-04:**
  - keep the Telegram channel private with as few members as possible;
  - turn on two-step verification for every member;
  - set a date (for example, the end of admissions) after which records are deleted.
- **SEC-10:** before switching the domain, get valid HTTPS certificates for every subdomain in use (including `mail.`), because the site's HSTS header applies to all of them.

Nothing was deployed. Every change is a local commit, waiting for your go-ahead to publish.
