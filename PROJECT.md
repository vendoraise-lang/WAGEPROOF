# Proposal Preflight

Updated 2026-10-11. Existing MVP improved in place. Cloudflare Workers Free replaces Render; no paid hosting, API calls or live payments activated. Source publication and free public test deployment are authorized. Actual HTTPS deployment is still blocked by a missing Cloudflare account token.

## Product
English checklist (30 rows, 6,000 characters) + short proposal (16,000 characters) → explicit duration/uptime/count comparisons with unit conversion, missing commitments, conflicting values, 24/7 coverage gaps, process-detail gaps and response coverage. Findings cite passages and provide next actions. Certificates, truth, service scopes and legal compliance need human verification; unsupported requirements fall back to matching. No model/API costs or compliance certification.

Free beta provides the full review and HTML/CSV downloads without a payment account. Proposed future price: $9/report. Buyer demand remains unvalidated. No customers or revenue claimed. Live payments are hard-disabled in the Worker entrypoint, regardless of dashboard flags. Existing Stripe test checkout and stateless text-bound receipt verification are preserved; real Stripe testing awaits credentials and merchant eligibility is unverified for Morocco. Operator identity/support remain pending; public beta displays prelaunch legal terms.

## Run and deploy
Node 24. `npm ci` installs pinned development tooling; no application runtime dependencies. `npm start` for Node; `npm run dev:worker` for the actual workerd runtime. `npm test`, `npm run check`, `npm run build:worker`. Browser tests: `python tools/browser-smoke.py` when system Chromium/Python Playwright exist.

`worker.js` uses Cloudflare's supported Node HTTP adapter, reusing server.js and checker.js. Static assets in public/, no database/file uploads. wrangler.jsonc defaults to Free beta and test payments, using the assigned workers.dev origin automatically. Proxy-provided IPs on Workers drive best-effort isolate-local limits; limits/counters reset between isolates and are not distributed abuse protection. Inputs are capped for Free CPU limits; production CPU and HTTPS behavior must still be checked after deployment. Never upgrade the account, add paid resources or accept charges.

Only account prerequisite: securely inject CLOUDFLARE_API_TOKEN scoped to one **Free-plan account**, with Account / Workers Scripts / Edit and Account / Account Settings / Read. `python tools/deploy.py` discovers its account, registers workers.dev if necessary, and deploys. No card, Stripe key, custom domain or public-URL configuration is needed for the beta. If Cloudflare requires billing or a paid upgrade, stop. Secrets stay in secure settings; never in chat, source, output or asset bundles.

Official current Cloudflare documentation retrieved from its cloudflare-docs GitHub source confirms Free is the default plan, 100,000 daily requests and 10ms request CPU allowance; Node HTTP adapter is officially supported. No paid-plan change is part of deployment.

## Security and verification
23 tests pass: numeric/semantic-rule regressions, equivalent units, RTO/RPO separation, tier conflicts, copied requirements, evidence uncertainty, free beta, payment binding/mode guards, refunds, abuse limits, origin checks and input caps. Desktop/mobile browser tests pass for Node preview + mocked checkout + report/download/recovery. Actual local workerd tests pass for full beta analysis, numeric/process/coverage findings, both downloads, hidden purchase, no horizontal overflow or JS errors. Cloudflare bundle build is validated separately. Real deployment, provider checkout and live payments are not yet verified.

CSP, safe DOM rendering, HTML escaping, CSV formula protection, TLS on workers.dev, no server document storage, browser sessionStorage clear action. Host metadata/log handling remains governed by Cloudflare. No Stripe proposal contents; fingerprints only. Losing a paid draft would require operator support/refund.

## Launch next action
Connect the Cloudflare Free account through the scoped token; then deploy and verify the actual HTTPS URL, desktop/mobile review, exports, error cases and disabled payments. No additional permission request is needed for the already-authorized free beta release. One screenshot + ten individually approved relevant MSP contacts is the acquisition experiment; outreach remains unsent. Before real payment: legal operator/support, eligible provider, approved terms/refunds, real integration tests, and separately authorized live activation. Do not add speculative features.
