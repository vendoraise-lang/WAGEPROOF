const $ = id => document.getElementById(id);
function element(tag, text, cls) { const n = document.createElement(tag); n.textContent = text; if (cls) n.className = cls; return n; }
function card(parent, title, lines) { const c = element('article', ''); c.append(element('h3', title)); for (const text of lines) c.append(element('p', text)); parent.append(c); return c; }
function link(parent, label, url) { if (!/^https:\/\/(?:serverfault\.com\/|github\.com\/|proposal-preflight\.[a-z0-9-]+\.workers\.dev(?:\/|$))/.test(url)) return; const a = element('a', label); a.href = url; a.rel = 'noopener noreferrer'; a.target = '_blank'; parent.append(a); }
async function refresh() {
  $('refresh').disabled = true;
  try {
    const r = await fetch('/api/portfolio', { signal: AbortSignal.timeout(15000) });
    if (!r.ok) throw new Error('Observations are temporarily unavailable.'); const data = await r.json();
    for (const id of ['summary','products','queue','operations','approvals','economics']) $(id).replaceChildren();
    const totals = data.products.reduce((n, p) => ({ pageviews: n.pageviews + p.counts.pageviews, reviews: n.reviews + p.counts.reviews }), { pageviews: 0, reviews: 0 });
    for (const [title, value] of [['30-day pageviews', totals.pageviews], ['Completed review events', totals.reviews], ['Verified revenue', `$${(data.economics.verifiedRevenueCents/100).toFixed(2)}`], ['Profit', 'Unverified']]) { const c = card($('summary'), title, []); c.append(element('div', String(value), 'metric')); }
    for (const p of data.products) {
      const c = card($('products'), p.name, [`Health: ${p.health ? (p.health.ok ? 'passing' : 'needs attention') : 'not checked yet'}`, `Reviews: ${p.counts.reviews} · downloads: ${p.counts.downloads} · request errors: ${p.counts.errors} · anonymous problem signals: ${p.counts.supportClicks}`, `Checklist funnel since October 11: ${p.checklistFunnel.resourceViews} resource views → ${p.checklistFunnel.pageviews} product pageviews → ${p.checklistFunnel.reviews} review events → ${p.checklistFunnel.downloads} downloads → ${p.checklistFunnel.purchaseIntent} nonbinding $9-interest clicks`, `Historic checklist referral pageviews: ${p.resourceReferralPageviews || 0}`, `Excluded test events: ${Object.values(p.testCounts).reduce((a,b) => a+b, 0)}`, `Next: ${p.decision.action} — ${p.decision.reason}`]); link(c, 'Open independent experiment ↗', p.url);
    }
    for (const o of data.opportunityQueue) {
      const c = card($('queue'), o.title, [`Score: ${o.score}/100 · confidence: ${o.confidence}`, `Revenue evidence: ${o.dimensions.revenueEvidence}/100 · acquisition feasibility: ${o.dimensions.acquisition}/100`, 'Public questions are adjacent interest signals, not purchase intent.']);
      if (!o.evidence.length) c.append(element('p', 'No source observations yet. Missing evidence is not filled with estimates.'));
      for (const e of o.evidence) { const p = element('p', e.kind === 'public-issue' ? `${e.comments} public comments · ` : `${e.views} reported source views · ${e.answers} answers · `); link(p, e.title, e.url); c.append(p); }
      c.append(element('small', 'Sources: Server Fault / Stack Exchange (CC BY-SA) or GitHub public issues. Original contributors at linked pages.'));
    }
    for (const o of data.commercialOpportunities || []) {
      const c = card($('queue'), o.title, [`Buyer: ${o.buyer}`, `Confidence: ${o.commercialConfidence}${o.selected ? ' · selected existing experiment' : ' · not built or published'}`, o.gap, o.organicChannel]);
      for (const e of o.evidence) { const p = element('p', e.observation + ' '); const a = element('a', 'Official source ↗'); const u = new URL(e.url); if (['www.pandadoc.com','loopio.com','www.responsive.io'].includes(u.hostname) && u.protocol === 'https:') { a.href = u.href; a.rel = 'noopener noreferrer'; a.target = '_blank'; p.append(a); } c.append(p); }
    }
    if (data.experiment) card($('operations'), 'One zero-cost organic experiment', [`Next: ${data.experiment.decision.action}`, data.experiment.decision.reason, '30-day thresholds: 10 checklist referrals, 10 attributed reviews and 3 nonbinding price-interest clicks. Event ratios are not unique-person conversion rates. Indexing remains unverified.']);
    const job = data.scheduledJob;
    card($('operations'), '15-minute health · daily signal refresh', job ? [`Last run: ${job.completedAt || job.startedAt}`, `Invocation: ${job.invocation || 'initializing'} · ${job.status}`, job.feedError || 'Public source observations refreshed or retained within daily limit.'] : ['Initialization is running. Refresh shortly.']);
    for (const c of data.candidates) card($('approvals'), c.name, [`Status: ${c.publication}`, c.offer, 'Exact-artifact approval required; not publicly served.']);
    const resource = card($('approvals'), data.distributionDraft.title, [data.distributionDraft.publication === 'approved' ? 'Founder-approved educational resource published; no outreach or advertising sent.' : 'Resource content is withheld pending approval; no outreach or advertising sent.']);
    if (data.distributionDraft.publication === 'approved') { const a = element('a', 'Read the SLA checklist'); a.href = '/resources/sla-checklist'; resource.append(a); }
    card($('economics'), 'USD · live payments disabled', [`Verified transactions: ${data.economics.verifiedPaymentCount}`, `Recorded operating costs: $${(data.economics.recordedCostCents / 100).toFixed(2)} · cost coverage incomplete`, 'Free-tier estimate: $0/month hosting and storage within quota; $0 AI inference. Free quota exhaustion causes failures, not an automated upgrade.', data.economics.limitation]);
    $('status').textContent = `Persisted observations as of ${new Date(data.observedAt).toLocaleString()}. No business results are simulated.`;
  } catch (e) { $('status').textContent = e.message; }
  finally { $('refresh').disabled = false; }
}
$('refresh').addEventListener('click', refresh); refresh();
