# Dependency & Supply-Chain Audit

## Inventory

| Package | Version | Type | Reaches production? |
|---|---|---|---|
| `@playwright/test` | 1.56.1 | dev | No (UI tests only) |
| `playwright`, `playwright-core` | 1.56.1 | dev (transitive) | No |
| `fsevents` | 2.3.2 | optional (macOS only) | No; not installed on Windows |

- **Runtime dependencies:** none. The server uses only Node built-ins, and the browser code loads no third-party scripts, fonts or CDNs. CSP `default-src 'self'` would block them anyway.
- **Package manager:** npm, with one committed lockfile (`package-lock.json`), no competing lockfiles and no `packageManager` field.
- **Install scripts:** none declared in `package.json`. Playwright downloads browsers only when `npx playwright install` is run explicitly.

## Results

| Check | Result |
|---|---|
| `npm audit` | 0 vulnerabilities (info 0, low 0, moderate 0, high 0, critical 0) |
| `npm audit signatures` | 3 packages have verified attestations |
| Typosquatting and suspicious names | None (only the official `@playwright/test` scope) |
| Dependency confusion | Not applicable: no private package names |
| Lockfile consistency | `npm ls` matches the lockfile (fsevents unmet as expected on Windows) |

## Runtime platform

| Item | Finding | Action |
|---|---|---|
| Local Node.js | v26.7.0; a published advisory was flagged by the environment | Upgrade to 26.12.1 or later (developer machine) |
| `engines.node` | `>=20` (open-ended; Node 20 is past end of life) | Pin a supported LTS (`22.x` or `24.x`) to match the host's Node selector during the migration. Not changed now: it can change which runtime Vercel picks |
| Python (image build only) | Run with `-I` (isolated mode), never on the server | None |

## Not available in this environment
Semgrep, Gitleaks, Trivy and OWASP ZAP are not installed. They were replaced by:
- a manual source review of every server and client file (about 1,250 lines);
- regex secret scans of the working tree and the full git history;
- `npm audit` and `npm audit signatures`;
- scripted local probes.
