# Proposal Preflight + Business Factory

Updated 2026-10-11. Existing code preserved. One repository, two independent Cloudflare Workers; no new repository/account needed. No paid services, recurring AI inference, live payments or external outreach activated.

## Live URLs
- Product: https://proposal-preflight.preflight-f1224675ed.workers.dev
- Read-only portfolio: https://business-factory.preflight-f1224675ed.workers.dev

## Architecture and operation
Proposal Preflight keeps its Node HTTP server, tested rule engine and responsive interface. English checklist (30 rows/6,000 characters) plus short draft (16,000 characters) produces numeric/unit comparisons, coverage/process questions, cited passages and HTML/CSV exports. Unsupported cases need human review; no certification, paid AI or server document retention. Complete reports are free in beta. Live payments remain hard-disabled in worker.js.

Factory lives in factory/: five small modules for public evidence/ranking, repeatable product artifacts, approval-gated resources, SQLite Durable Object operations/metrics, and threshold/economics recommendations. Product telemetry uses account-owned service-binding RPC. Daily aggregates retain no document text, IPs or user identities. Test traffic is segregated; counts are events, not unique visitors or customers. Anonymous problem signals collect no contact information and cannot receive individual replies. Raw event retention 90 days; dashboard window 30 days.

Cloudflare cron is registered every 15 minutes. An actual production cron execution was observed at 2026-10-11 02:00 UTC, passing health, payment-disabled and numeric-analysis probes. It checks health, disabled payments and actual numeric analysis with explicitly synthetic test traffic, collects public signals once/day, respects backoff, prunes aggregates and evaluates thresholds. No active Codex session is needed. Stack Exchange shared-IP rate limits occurred; actual GitHub SLA issue observations were collected as fallback. These are weak adjacent technical-interest signals, not buying intent.

Experiment thresholds: after 30 days and >=100 pageviews, fewer than 3 reviews pauses analysis; after 60 days and <100 pageviews, acquisition failure pauses analysis. Repeated operational failures and anonymous problem signals produce repair/review recommendations. Terminal thresholds take priority. Telemetry failures fail open; independently deploying/removing the binding detaches the product. No automatic code deployments or account spending.

## Generation, approval and verification
node factory/build.mjs creates a complete local SLA Preflight artifact from existing tested code. It was exercised end-to-end locally; it is not published. Publication requires founder approval of the exact artifact digest and an approved capacity increase (current cap: one active product). Candidate release refuses by default. The single original SLA checklist in factory/resource.json is also withheld from HTTP until its exact content hash is approved. No mass SEO pages or messages are produced.

31 automated tests pass, syntax checks pass, live HTTPS desktop/mobile product and dashboard checks pass, full exports and clear-data behavior pass. Browser tests use a temporary HTTPS relay with normal certificate verification; no permanent trust changes or disabled TLS verification. Real production test events persist across Worker redeployment. Unapproved product/resource routes return 404; public mutation routes are blocked. Test webhook adapter is unconfigured and returns 503; HMAC, timestamp, product/amount binding and live-receipt rejection have unit coverage only. No simulated payment events were submitted to production.

## Costs and remaining approval
Estimated recurring platform cost: $0 within Workers/SQLite Durable Objects Free quotas, zero AI inference. About 288 health/config/analysis HTTP requests/day plus one source refresh; telemetry grows with real usage. Quota exhaustion fails; no upgrades are configured. The scoped token cannot read account billing subscriptions. Recorded cost coverage is incomplete; Codex credits and founder time remain unallocated. Verified revenue is $0, profitability unknown.

Next distribution approval: review factory/resource.json and explicitly approve its publication. Live payments separately require verified legal operator/support details, a legitimately eligible provider for Morocco, real provider integration testing and explicit live activation. No demand, customers or revenue are invented. Commands, release gates and limitations: factory/README.md. Development: npm ci; npm test; npm run check. Release: python factory/release.py plan, operations or existing-product; candidate is gated.
