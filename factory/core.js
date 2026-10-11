export { EVENTS } from '../telemetry.js';
import { EVENTS } from '../telemetry.js';
export const FEED = 'https://api.stackexchange.com/2.3/questions?site=serverfault&tagged=sla&sort=activity&order=desc&pagesize=10&filter=default';
export const FALLBACK_FEED = 'https://api.github.com/search/issues?q=%22service+level+agreement%22+is%3Aissue+is%3Aopen&per_page=10';
export function safeEvent(value, registry) {
  if (!value || !registry.products.some(p => p.id === value.product) || !EVENTS.includes(value.event)) throw new Error('Invalid event');
  // No arbitrary fields, identifiers, document contents, IPs, referrers or URLs retained.
  return { product: value.product, event: value.event, test: value.test === true };
}
export function evidenceFromFeed(data, now = new Date().toISOString()) {
  if (!Array.isArray(data.items)) throw new Error('Invalid public signal feed');
  return data.items.slice(0, 10).filter(x => Number.isSafeInteger(x.question_id) && /^https:\/\/serverfault\.com\/questions\/\d+\//.test(x.link || '')).map(x => ({
    id: String(x.question_id), title: String(x.title || '').slice(0, 250), url: x.link,
    views: Math.max(0, Number(x.view_count) || 0), score: Number(x.score) || 0,
    answers: Math.max(0, Number(x.answer_count) || 0), observedAt: now,
    postedAt: new Date(x.creation_date * 1000).toISOString(),
    kind: 'public-question', attribution: 'Server Fault / Stack Exchange, CC BY-SA; original authors linked at source',
    limitation: 'Interest in SLA operations, not evidence of proposal-checker purchase intent or willingness to pay.'
  }));
}
export function rankOpportunity(evidence) {
  const totalViews = evidence.reduce((n, e) => n + e.views, 0);
  const dimensions = {
    demand: evidence.length ? Math.min(35, 5 + evidence.length * 2 + Math.log10(1 + totalViews) * 3) : 0,
    development: 85, acquisition: 15, operatingCost: 95, revenueEvidence: 0
  };
  const weights = { demand: .3, development: .2, acquisition: .2, operatingCost: .15, revenueEvidence: .15 };
  return { id: 'it-service-commitments', title: 'IT service commitment review', dimensions, weights,
    score: Math.round(Object.keys(weights).reduce((n, k) => n + dimensions[k] * weights[k], 0)),
    evidence, confidence: 'low', status: 'research', automaticLaunchAllowed: false,
    assumptions: ['Existing tested analysis template lowers engineering effort.', 'Free hosting assumes remaining free quota.', 'Acquisition and revenue are unvalidated; no paid demand inferred from question views.'],
    nextExperiment: 'Publish one approved practical SLA checklist, measure attributed visits and completed reviews, then test an eligible paid offer with approval.' };
}
export function evidenceFromGithub(data, now = new Date().toISOString()) {
  if (!Array.isArray(data.items)) throw new Error('Invalid public issue feed');
  return data.items.slice(0, 10).filter(x => Number.isSafeInteger(x.id) && /^https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/issues\/\d+$/.test(x.html_url || '')).map(x => ({
    id: `github-${x.id}`, title: String(x.title || '').slice(0, 250), url: x.html_url,
    views: null, comments: Math.max(0, Number(x.comments) || 0), answers: null, score: 0,
    observedAt: now, postedAt: x.created_at, kind: 'public-issue', attribution: 'GitHub public issues; original contributors linked at source',
    limitation: 'Open public discussions mentioning service level agreements; adjacent technical interest, not paid proposal-checker demand.'
  }));
}
export function economics(registry) {
  const costs = registry.costs.filter(c => Number.isSafeInteger(c.amountCents) && c.amountCents >= 0);
  return { currency: 'USD', verifiedPaymentCount: 0, verifiedRevenueCents: 0,
    recordedCostCents: costs.reduce((n, c) => n + c.amountCents, 0), costCoverageComplete: registry.costCoverageComplete,
    profitCents: null, status: 'not-verifiable', livePaymentsEnabled: false,
    limitation: 'No payment provider is connected. Recorded costs are operator-reported. Codex credits, founder labor and unallocated costs are excluded until recorded. No revenue or profitability claim.' };
}
export function decision(product, counts, health, now = Date.now()) {
  const ageDays = Math.max(0, (now - Date.parse(product.launchedAt)) / 86400000);
  const thresholds = product.thresholds;
  // Terminal experiment thresholds take priority over support/health recommendations.
  if (ageDays >= thresholds.maximumDays && (counts.pageviews || 0) < thresholds.minimumPageviews) return { action: 'discontinue', reason: '60-day acquisition threshold missed. Experiment paused; founder approval is required to restart.', pause: product.managed === true };
  if (ageDays >= thresholds.reviewDays && (counts.pageviews || 0) >= thresholds.minimumPageviews && (counts.reviews || 0) < thresholds.minimumReviews) return { action: 'discontinue', reason: 'Predefined 30-day utility threshold missed. Independent products require approved retirement; factory-managed products pause automatically.', pause: product.managed === true };
  if ((health?.failedChecks || 0) >= thresholds.maximumFailedChecks) return { action: 'repair', reason: 'Repeated operational failures; no new publication until repaired.', pause: false };
  if ((counts.supportClicks || 0) >= 3) return { action: 'review-product', reason: 'Anonymous problem signals require investigation before expanding distribution.', pause: false };
  if (ageDays < thresholds.reviewDays) return { action: 'observe', reason: 'Measurement window is still open.', pause: false };
  if ((counts.pageviews || 0) < thresholds.minimumPageviews) return { action: 'improve-distribution', reason: 'Insufficient observed pageviews to judge utility; no customer or unique-visitor inference.', pause: false };
  return { action: 'validate-paid-demand', reason: 'Observed utility events justify an approved pricing experiment; events are not customers or revenue.', pause: false };
}
export function resourceDraft(opportunity) {
  return { title: 'Five commitments to verify before signing an IT service agreement', publication: 'awaiting-approval',
    body: 'Separate response time from resolution time. Specify uptime measurement windows and exclusions. Distinguish recovery time (RTO) from tolerated data loss (RPO). State whether support is business-hours or 24/7. Ask for independent evidence of certifications; a written claim is not proof.',
    sourceUrls: opportunity.evidence.map(e => e.url),
    limitation: 'Educational checklist, not legal advice or proof of compliance. Generated from the tested template rules; not attributed to the public questions.',
    acquisition: 'One useful approved resource linked from relevant existing channels; no outreach, mass pages or paid advertising automatically sent.' };
}
export function publicationAllowed(candidate, digest) {
  return candidate?.publication === 'approved' && candidate.approval?.artifactDigest === digest && candidate.approval?.actor === 'founder' && !!candidate.approval?.approvedAt;
}
