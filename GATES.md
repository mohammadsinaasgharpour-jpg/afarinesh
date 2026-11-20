# Gates: site updates, Git and release

OWNS: api/**, server/**, public/**, content/**, scripts/**, source-images/**, tests/**, package.json, package-lock.json, README.md, vercel.json

Scope: Complete the requested site improvements that are safe to ship, verify the build and tests, and prepare a reviewable Git release without committing secrets.

- [ ] G1: The project builds and all automated tests pass after the site updates.
  CHECK: npm test; npm run build
  EXPECT: BUILD_AND_TESTS_PASSED
  EVIDENCE: pending

- [ ] G2: The production asset set contains the selected school hero image in optimized WebP variants and no longer contains the removed legacy hero source.
  CHECK: node -e "const fs=require('fs'); const ok=['public/assets/img/wall-640.webp','public/assets/img/wall-960.webp','public/assets/img/wall-1280.webp','public/assets/img/wall-gate-720.webp','public/assets/img/wall-gate-1440.webp'].every(fs.existsSync) && !fs.existsSync('source-images/PXL_20251209_025859000.NIGHT_-scaled.jpg'); if(!ok) process.exit(1); console.log('ASSETS_VERIFIED')"
  EXPECT: ASSETS_VERIFIED
  EVIDENCE: pending

- [ ] G3: The staged release contains no tracked environment files, credentials, tokens, or local-only Codex settings.
  CHECK: node -e "const cp=require('child_process'); const out=cp.execFileSync('git',['diff','--cached','--name-only'],{encoding:'utf8'}); const bad=out.split(/\r?\n/).filter(Boolean).filter(x=>/^\.env|(^|\\/)\.mcp\.json$|(^|\\/)\.claude\//.test(x)); if(bad.length){console.error(bad.join('\n')); process.exit(1)} console.log('STAGED_SECRET_SCAN_PASSED')"
  EXPECT: STAGED_SECRET_SCAN_PASSED
  EVIDENCE: pending

- [ ] G4: Git release is reviewable with a named branch and a descriptive commit, while no remote push is claimed without a user-provided repository URL.
  EVIDENCE: pending

- [ ] G5: The hosting upload or deployment is confirmed by the hosting provider, or an explicit handoff identifies the exact remaining manual upload step.
  EVIDENCE: pending
