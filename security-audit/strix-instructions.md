Scope: the source code of this repository and the local server started from it (http://host.docker.internal:8080 from inside the sandbox). Do not contact afarinesh-site.vercel.app, afarineshshiraz.ir, api.telegram.org or any other external host.

The app is a static school website plus three public JSON form endpoints (POST /api/inquiries, /api/pre-registration, /api/careers) and GET /api/health. There are no accounts, sessions, database or file uploads.

Findings already known and fixed (see security-audit/VULNERABILITY_REGISTER.md): SEC-01 flood guard, SEC-02 national-ID pre-emption, SEC-05 type coercion, SEC-06 malformed URL, SEC-07 X-Forwarded-Host, SEC-08 limiter memory. Known and open: SEC-03 in-memory rate limits on serverless, SEC-04 data retention.

Focus on anything not in that list: validation bypasses in public/assets/js/validate.js, rate-limit bypasses in server/forms.mjs, path handling in server/app.mjs, CSP gaps, and DOM XSS in public/assets/js/*.js.

Rules: non-destructive tests only, synthetic data only, no denial-of-service or load tests (stay under 200 requests per endpoint), do not modify files in the repository.
