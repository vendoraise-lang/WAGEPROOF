# Business Factory: functional demonstration

**Verdict:** working scheduled operations and measurement, plus a tested product template and guarded release script. It is not yet a fully autonomous business factory. Discovery is narrow, scores are assumptions, building is manually invoked, and acquisition has not produced verified customer use. Commercial activation remains paused.

This demonstration used the existing public Workers and one private local staging process. No second product was published, no paid resource was activated, and the existing deployments were not changed.

## 1. What you can inspect

- [Live factory and current measurements](https://business-factory.preflight-f1224675ed.workers.dev/)
- [Machine-readable state](https://business-factory.preflight-f1224675ed.workers.dev/api/portfolio)
- [Existing working product](https://proposal-preflight.preflight-f1224675ed.workers.dev/)
- [Approved educational checklist](https://business-factory.preflight-f1224675ed.workers.dev/resources/sla-checklist)
- [Second candidate: desktop screenshot](demo/staging-desktop.png) and [mobile screenshot](demo/staging-mobile.png)

The staging screenshots show real generated code, real browser interactions and fictional demonstration inputs. They are not customer results. There is no public URL for the unpublished candidate.

## 2. What runs without Codex

| Task | Frequency | What it really does |
| --- | --- | --- |
| Product health | Every 15 minutes | Requests health/config and checks a tagged synthetic numerical review. |
| Source collection | At most once per 24 hours | Collects up to ten public SLA questions; uses GitHub issues as fallback, respecting available backoff. |
| Opportunity ranking | When a snapshot/report is computed | Applies the fixed weighted model below to the collected evidence. It does not search new industries. |
| Search-readiness audit | Daily; also after bootstrap revision changes | Checks approved pages, metadata, robots and sitemaps. A current false-negative warning is described below. |
| Usage retention | Each operational run | Deletes aggregates older than 90 days; reports a rolling 30-day window. |
| Experiment decisions | Each run/access check | Recommends action or blocks analysis when configured age/usage thresholds are met. |
| Performance report | Weekly; also initialization/revision change | Saves a report in the existing database. No report email is sent. |
| Existing test-order reconciliation | Each operational run, up to five orders | Preserves existing protections; all live processing stays disabled. No payment work was done for this demonstration. |
| Sitemap submission | Checked on each operational run | Does nothing until exact founder approval, account connection and site ownership exist. |

The deployed job recorded a real **cron** completion at **2026-10-11 15:30:10 UTC**, revision 18. Product health and numerical analysis were successful. This is evidence of a functioning scheduler, not merely a configured cron expression. Code deployment, building products and publishing content are not scheduled automatically.

## 3. Discovery and scoring: real versus assumed

Configured primary source: [Server Fault SLA questions](https://api.stackexchange.com/2.3/questions?site=serverfault&tagged=sla&sort=activity&order=desc&pagesize=10&filter=default). Fallback: [GitHub open SLA issues](https://api.github.com/search/issues?q=%22service+level+agreement%22+is%3Aissue+is%3Aopen&per_page=10).

The live database contains cached GitHub-source evidence with source URLs and observation timestamps, including:

- [Publish Service Level Agreement](https://github.com/se7en-labs-inc/daedalus/issues/12)
- [Service-level agreements](https://github.com/Karma47/RTFM/issues/273)
- [Starlink SLA tracking issue](https://github.com/OpenTermsArchive/contrib-declarations/issues/4113)

This session's independent API refetches were blocked by environment network policy. The links above are records retrieved from the running factory, not independently revalidated buyer signals in this session. They establish technical discussion, not US buyer geography, purchase intent or willingness to pay.

The current queue has one exploratory opportunity, **US IT service commitment review**, scored **34/100**, low confidence. The formula actually executed is:

| Dimension | Score | Weight | Basis |
| --- | --- | --- | --- |
| Demand | 0 | 30% | No verified US buyer demand. |
| Ease of development | 85 | 20% | Fixed assumption: a tested template already exists. |
| Acquisition feasibility | 15 | 20% | Fixed conservative assumption; no proven channel. |
| Low operating cost | 95 | 15% | Assumes available free quota. |
| Revenue evidence | 0 | 15% | No live revenue. |

Weighted total 34.25 rounds to 34. Changing issue counts does not currently change these scores. This is transparent hypothesis ranking, not autonomous commercial intelligence. The resource draft is a fixed educational template; no AI writes new articles in the background.

## 4. A genuinely working second candidate, withheld

Ran the existing builder: `node factory/build.mjs`. It copied the tested review engine, server and interface into the existing **SLA Preflight** draft and inserted an SLA-specific fictional example. No new framework or inference API was introduced. The original Proposal Preflight code remains intact.

Real staging browser results:

| Required commitment | Fictional offered commitment | Actual result |
| --- | --- | --- |
| Respond within 30 minutes | 60 minutes | Numerical mismatch |
| At least 99.9% uptime | 99.5% | Numerical mismatch |
| RTO within 4 hours | 8 hours | Numerical mismatch |
| RPO within 1 hour | 30 minutes | Within stated threshold; human verification still required |
| 24/7 support | Business hours | Missing coverage commitment |

The staging app delivered all five findings and downloadable HTML/CSV reports. Mobile layout passed at 390px width. No external service or payment is required to use this staging demonstration. It is a narrow specialization of the same engine, not a newly validated independent business.

Artifact fingerprint: `583d29b696f0554e3c77d6ae0bc08ddca71a62530bbc078e1579bd386768a831`. The page is marked **UNPUBLISHED STAGING DEMO** and `noindex`. The actual release command rejected it: **Publication denied: exact artifact lacks founder approval.** The one-product portfolio cap also remains in place. Building and launching are manual engineering actions; the scheduler cannot generate or deploy this artifact by itself.

## 5. Distribution and discoverability

Both public robots files and sitemaps returned **HTTPS 200**. The product sitemap lists its canonical homepage; the factory sitemap lists only the approved checklist. Both pages have titles, descriptions, matching canonical URLs and no observed noindex directive. The checklist links to the product with `source=sla-checklist`; the product links back to the checklist. User-initiated sharing uses `source=shared-link`.

- [Product sitemap](https://proposal-preflight.preflight-f1224675ed.workers.dev/sitemap.xml)
- [Checklist sitemap](https://business-factory.preflight-f1224675ed.workers.dev/sitemap.xml)
- [Product robots](https://proposal-preflight.preflight-f1224675ed.workers.dev/robots.txt)
- [Factory robots](https://business-factory.preflight-f1224675ed.workers.dev/robots.txt)

**Crawl readiness is verified; search-engine indexing is not.** Google/Bing searches were blocked in this session, and no connected Search Console ownership/index inspection is available. No indexing, rankings, search volumes or customer reach are claimed. The deployed scheduled SEO audit incorrectly reports the checklist sitemap missing despite the successful external request; that discrepancy remains unresolved and makes its overall warning unreliable.

Attribution recognizes explicit checklist/shared-link tags and known Google/Bing/DuckDuckGo/Yahoo referrer hosts. Subsequent browser requests carry the recognized source as a bounded query label. There are no campaigns, directory listings, external posts or automatic outreach running. Search Console submissions are prepared but gated and not executed. Refresh/tab-loss and spoofed tags can affect attribution; no visitor country or unique identity is collected.

## 6. Real metrics, with exclusions

Snapshot observed at **2026-10-11T15:35:46.498Z**:

| Non-test event | Count |
| --- | ---: |
| Product page views | 10 |
| Checklist views | 1 |
| Checklist-to-product visits | 0 |
| Recognized organic-search visits | 0 |
| Shared-link visits | 0 |
| Completed reviews | 0 |
| Downloads | 0 |
| Purchase-interest events | 0 |
| Checkout events | 0 |
| Verified live customers/revenue | 0 / $0 |

Known bots, health checks, fictional examples and tagged tests are excluded from these counts and stored separately. The untagged page/checklist events are **not verified humans or US buyers**; some historical operator traffic may remain. We cannot truthfully report an exact genuine visitor count. There is no verified customer product use or buying interest. Previously completed test payments are QA only and excluded from sales.

## 7. Decision rules demonstrated safely

The current real decision is **observe**. The following were executed with explicitly synthetic dates/counts; production metrics and product availability were not changed:

| Demonstration input | Actual decision |
| --- | --- |
| Day 31, ten page views | Recommend improving distribution; no pause |
| Day 31, 100 views and two reviews | Pause factory-managed analysis for poor utility |
| Day 61, ten views | Pause for failed acquisition |
| Three consecutive health failures | Recommend repair; does not repair or pause automatically |
| Three problem-button signals | Recommend product review; no automated support reply |

The checklist experiment has a separate 30-day test: fewer than ten tagged referrals stops channel investment; ten referrals, ten reviews and three nonbinding interest clicks justify review only. These are configured heuristics, not proven statistical thresholds. Neither decision system writes new product code, increases spending or republishes a product. Restart/retirement and interpretation still require review. Pausing blocks analysis endpoints; it does not delete or undeploy a Worker.

## 8. Manual responsibilities and cost limits

Still manual: validate demand, choose an opportunity, invoke a template build, review accuracy, approve the exact artifact and portfolio capacity, register/release a product, connect/verify search ownership, approve public distribution, interpret recommendations, fix failures, receive/respond to support, and authorize any spending or live processing. Merchant activation is paused by instruction. Billing data, legal identity and full cost allocation are not verified.

Operating estimate: **$0/month while existing Cloudflare Free quotas suffice**, **$0 AI inference** (no recurring inference calls), no ads or paid subscriptions. The scheduler runs 96 times/day; health checks alone make roughly 288 product requests/day, with daily source/SEO calls and existing reconciliation added. Request counts, database work/storage and CPU are not all metered in the current dashboard. Account invoices/free-tier entitlement were not independently verified, so this is an estimate, not audited spend. Codex credits, founder time and future support costs are excluded from the incomplete cost ledger; profit cannot be calculated.

**What this demonstration proves:** working scheduling, durable aggregate state, a functioning template-generated app, bounded analysis, export delivery, publication refusal and executable decision rules. **What it does not prove:** validated discovery, organic acquisition, autonomous product improvement, customer demand, revenue or a self-running portfolio business. No more products or content are needed to establish those missing facts.

Validation: **47/47 automated tests**, syntax/diff checks, real staging browser analysis/download/mobile checks, actual public search-readiness requests and an actual denied release. Public deployments and automation were preserved.
