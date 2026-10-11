import { DurableObject, WorkerEntrypoint } from 'cloudflare:workers';
import { verifyLemonTestWebhook, reducePurchase, paymentTotals } from '../payments/lemon.js';
import { auditSEO, sitemap, robots, RESOURCE_URL, PRODUCT_ORIGIN, FACTORY_ORIGIN, submitSitemap } from '../seo.js';
import registry from './registry.json';
import resource from './resource.json';
import commercial from './commercial.json';
import distributionPlan from './distribution.json';
import { traffic, experimentDecision, CHANNELS } from '../telemetry.js';
import { resourceDigest, resourceHTML } from './resource.js';
import { verifyTestReceipt } from './accounting.js';
import { EVENTS, FEED, FALLBACK_FEED, safeEvent, evidenceFromFeed, evidenceFromGithub, rankOpportunity, economics, decision, resourceDraft, publicationAllowed } from './core.js';

const headers = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store',
  'Content-Security-Policy': "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
  'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'Strict-Transport-Security': 'max-age=31536000' };
const json = (value, status = 200) => new Response(JSON.stringify(value), { status, headers });
const store = env => env.PORTFOLIO.get(env.PORTFOLIO.idFromName('portfolio-v1'));

export class PortfolioStore extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.sql.exec('CREATE TABLE IF NOT EXISTS events (day TEXT, product TEXT, test INTEGER, pageviews INTEGER DEFAULT 0, reviews INTEGER DEFAULT 0, downloads INTEGER DEFAULT 0, errors INTEGER DEFAULT 0, supportClicks INTEGER DEFAULT 0, PRIMARY KEY(day, product, test))');
    const columns = new Set([...this.sql.exec('PRAGMA table_info(events)')].map(c => c.name));
    for (const event of EVENTS) if (!columns.has(event)) this.sql.exec(`ALTER TABLE events ADD COLUMN ${event} INTEGER DEFAULT 0`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS funnel (day TEXT, product TEXT, channel TEXT, test INTEGER, ${EVENTS.map(e => `${e} INTEGER DEFAULT 0`).join(', ')}, PRIMARY KEY(day,product,channel,test))`);
    this.sql.exec('CREATE TABLE IF NOT EXISTS state (key TEXT PRIMARY KEY, value TEXT NOT NULL)');
    this.sql.exec('CREATE TABLE IF NOT EXISTS test_receipts (id TEXT PRIMARY KEY, product TEXT, amountCents INTEGER, verifiedAt TEXT)');
    this.sql.exec('CREATE TABLE IF NOT EXISTS lemon_purchases (key_hash TEXT PRIMARY KEY, order_id TEXT UNIQUE, value TEXT NOT NULL)');
    this.sql.exec('CREATE TABLE IF NOT EXISTS channels (day TEXT, product TEXT, channel TEXT, test INTEGER, count INTEGER DEFAULT 0, PRIMARY KEY(day,product,channel,test))');
  }
  get(key, fallback) { const rows = [...this.sql.exec('SELECT value FROM state WHERE key = ?', key)]; return rows[0] ? JSON.parse(rows[0].value) : fallback; }
  put(key, value) { this.sql.exec('INSERT INTO state(key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value', key, JSON.stringify(value)); }
  record(value) {
    const e = safeEvent(value, registry), day = new Date().toISOString().slice(0, 10);
    this.sql.exec(`INSERT INTO events(day,product,test,${e.event}) VALUES (?,?,?,1) ON CONFLICT(day,product,test) DO UPDATE SET ${e.event}=${e.event}+1`, day, e.product, Number(e.test));
    const channel = CHANNELS.includes(value.channel) ? value.channel : 'direct';
    this.sql.exec(`INSERT INTO funnel(day,product,channel,test,${e.event}) VALUES (?,?,?,?,1) ON CONFLICT(day,product,channel,test) DO UPDATE SET ${e.event}=${e.event}+1`, day, e.product, channel, Number(e.test));
    if (e.event === 'pageviews' && value.channel === 'sla-checklist') this.sql.exec('INSERT INTO channels(day,product,channel,test,count) VALUES (?,?,?, ?,1) ON CONFLICT(day,product,channel,test) DO UPDATE SET count=count+1', day, e.product, 'sla-checklist', Number(e.test));
    return { recorded: true };
  }
  access(product) {
    const p = registry.products.find(p => p.id === product);
    if (!p) return { allowed: false, reason: 'Product not registered.' };
    const day = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
    const counts = [...this.sql.exec('SELECT SUM(pageviews) AS pageviews, SUM(reviews) AS reviews FROM events WHERE product=? AND test=0 AND day>=?', product, day)][0];
    const result = decision(p, counts || {}, this.get('health', {})[product]);
    return { allowed: !result.pause, ...result };
  }
  recordTestReceipt(receipt) {
    this.sql.exec('INSERT OR IGNORE INTO test_receipts(id,product,amountCents,verifiedAt) VALUES (?,?,?,?)', receipt.id, receipt.product, receipt.amountCents, receipt.verifiedAt);
    return { accepted: true, testOnly: true };
  }
  reserveTestPurchase(purchase) {
    if (purchase.test !== true || !['keyHash','reportDigest','buyerHash'].every(k => /^[a-f0-9]{64}$/.test(purchase[k] || '')) || !['storeId','variantId'].every(k => /^[1-9]\d*$/.test(purchase[k] || ''))) throw new Error('Invalid test purchase reservation.');
    if ([...this.sql.exec('SELECT COUNT(*) AS n FROM lemon_purchases')][0].n >= 500) throw new Error('Test ledger capacity reached; checkout paused.');
    const value = { keyHash: purchase.keyHash, reportDigest: purchase.reportDigest, buyerHash: purchase.buyerHash, storeId: purchase.storeId, variantId: purchase.variantId, channel: CHANNELS.includes(purchase.channel) ? purchase.channel : 'direct', test: true, state: 'pending', createdAt: new Date().toISOString(), orderId: null };
    this.sql.exec('INSERT INTO lemon_purchases(key_hash,value) VALUES (?,?)', value.keyHash, JSON.stringify(value));
    return { reserved: true, testOnly: true };
  }
  lookupTestPurchase(key, buyer, report) {
    const row = [...this.sql.exec('SELECT value FROM lemon_purchases WHERE key_hash=?', key)][0];
    const p = row && JSON.parse(row.value);
    return p && p.buyerHash === buyer && p.reportDigest === report ? p : null;
  }
  applyTestOrder(receipt) {
    const row = [...this.sql.exec('SELECT value FROM lemon_purchases WHERE key_hash=?', receipt.keyHash)][0];
    if (!row) throw new Error('Payment not reserved by this product.');
    const next = reducePurchase(JSON.parse(row.value), receipt);
    this.sql.exec('UPDATE lemon_purchases SET order_id=?,value=? WHERE key_hash=?', next.orderId, JSON.stringify(next), receipt.keyHash);
    return next;
  }
  paymentConfiguration() { return this.get('paymentConfiguration', { ready: false, reason: 'Operator-owned Lemon Squeezy test account not connected.', merchantEligibilityConfirmed: false }); }
  purchases() { return [...this.sql.exec('SELECT value FROM lemon_purchases')].map(r => JSON.parse(r.value)); }
  snapshot() {
    const cutoff = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
    const rows = [...this.sql.exec('SELECT * FROM events WHERE day >= ? ORDER BY day', cutoff)];
    const health = this.get('health', {}), job = this.get('job', null), evidence = this.get('evidence', []);
    const products = registry.products.map(p => {
      const total = Object.fromEntries(EVENTS.map(e => [e, 0]));
      const tests = Object.fromEntries(EVENTS.map(e => [e, 0]));
      for (const r of rows.filter(r => r.product === p.id)) for (const e of EVENTS) (r.test ? tests : total)[e] += r[e] || 0;
      const checklistFunnel = Object.fromEntries(EVENTS.map(e => [e, [...this.sql.exec(`SELECT COALESCE(SUM(${e}),0) AS n FROM funnel WHERE day>=? AND product=? AND channel='sla-checklist' AND test=0`, cutoff, p.id)][0].n]));
      const testChecklistFunnel = Object.fromEntries(EVENTS.map(e => [e, [...this.sql.exec(`SELECT COALESCE(SUM(${e}),0) AS n FROM funnel WHERE day>=? AND product=? AND channel='sla-checklist' AND test=1`, cutoff, p.id)][0].n]));
      return { ...p, counts: total, testCounts: tests, health: health[p.id] || null, decision: decision(p, total, health[p.id]),
        checklistFunnel, testChecklistFunnel,
        acquisitionChannels: Object.fromEntries(['organic-search','shared-link'].map(channel => [channel, Object.fromEntries(EVENTS.map(e => [e, [...this.sql.exec(`SELECT COALESCE(SUM(${e}),0) AS n FROM funnel WHERE day>=? AND product=? AND channel=? AND test=0`, cutoff, p.id, channel)][0].n]))])),
        resourceReferralPageviews: [...this.sql.exec('SELECT COALESCE(SUM(count),0) AS n FROM channels WHERE day>=? AND product=? AND test=0', cutoff, p.id)][0].n,
        completionEventsPerPageview: total.pageviews ? total.reviews / total.pageviews : null };
    });
    const opportunity = rankOpportunity(evidence);
    const draft = resource;
    const experiment = { ...commercial.experiment, metrics: products[0].checklistFunnel, decision: experimentDecision(commercial.experiment, products[0].checklistFunnel), indexingVerified: false };
    return { observedAt: new Date().toISOString(), products, targetMarket: registry.targetMarket, operator: registry.operator, annualRevenueTarget: registry.annualRevenueTarget, researchPolicy: registry.researchPolicy, monetization: commercial.monetization, opportunityQueue: [opportunity], commercialOpportunities: commercial.opportunities, experiment,
      candidates: registry.candidates, distributionDraft: { title: draft.title, publication: draft.publication }, economics: { ...economics(registry), verifiedTestReceiptCount: [...this.sql.exec('SELECT COUNT(*) AS n FROM test_receipts')][0].n }, scheduledJob: job,
      payments: { ...paymentTotals(this.purchases()), connection: this.paymentConfiguration(), monitoring: this.get('paymentMonitoring', null) }, seo: this.get('seo', null), distribution: this.get('distribution', distributionPlan), periodicReport: this.get('periodicReport', null),
      measurement: 'Rolling 30-day event counts, not unique people, sessions or customers. Checklist funnel measured since 2026-10-11; earlier pageviews may include untagged operator traffic. Known bots, samples and tagged tests excluded. Repeat/spoofed events remain possible; intent is nonbinding, not a sale.',
      costs: { estimatedMonthlyPlatformUSD: 0, aiInferenceUSD: 0, paidServicesEnabled: false, quotaBehavior: 'Free limits fail closed; no upgrade automation.', unallocated: ['Codex development credits', 'Founder time'] } };
  }
  async runScheduled(invocation = 'cron') {
    // Serialized via the DO input gate while state is read/written; no deployment, payment or publication authority.
    const job = this.get('job', null);
    if (job?.status === 'running' && Date.now() - Date.parse(job.startedAt) < 300000) return { skipped: 'already-running' };
    const startedAt = new Date().toISOString(); this.put('job', { startedAt, status: 'running' });
    const health = this.get('health', {}); let feedError = null, sourceStatus = null;
    for (const p of registry.products) {
      let ok = false, status = null, paymentsDisabled = null, coreAnalysisWorks = null;
      try {
        const r = await fetch(p.url + '/health', { signal: AbortSignal.timeout(10000), headers: { 'User-Agent': 'BusinessFactoryHealth/1.0', 'X-Factory-Test': '1' } });
        status = r.status; ok = r.ok && (await r.json()).ok === true;
        const c = await fetch(p.url + '/api/config', { signal: AbortSignal.timeout(10000), headers: { 'User-Agent': 'BusinessFactoryHealth/1.0', 'X-Factory-Test': '1' } });
        const config = await c.json(); paymentsDisabled = c.ok && config.livePaymentsEnabled === false && config.paymentMode === 'test';
        ok = ok && paymentsDisabled;
        if (ok && this.access(p.id).allowed) {
          const probe = await fetch(p.url + '/api/preview', { method: 'POST', signal: AbortSignal.timeout(10000), headers: { 'User-Agent': 'BusinessFactoryHealth/1.0', 'Content-Type': 'application/json', 'Origin': p.url, 'X-Factory-Test': '1' }, body: JSON.stringify({ requirements: 'Provide response within 30 minutes', proposal: 'SYNTHETIC MONITORING CHECK. Our response time is 60 minutes.' }) });
          const report = await probe.json();
          coreAnalysisWorks = probe.ok && report.findings?.[0]?.status === 'Numeric requirement mismatch';
          ok = ok && coreAnalysisWorks;
        }
      } catch { ok = false; }
      health[p.id] = { checkedAt: new Date().toISOString(), ok, status, paymentsDisabled, coreAnalysisWorks, failedChecks: ok ? 0 : (health[p.id]?.failedChecks || 0) + 1 };
    }
    try {
      const retryAt = this.get('feedRetryAt', 0);
      if (Date.now() >= retryAt && Date.now() - this.get('feedFetchedAt', 0) >= 86400000) {
        const r = await fetch(FEED, { signal: AbortSignal.timeout(10000), headers: { 'User-Agent': 'BusinessFactoryEvidence/1.0' } });
        sourceStatus = r.status;
        if (!r.ok) {
          const detail = await r.json().catch(() => ({}));
          const retry = String(detail.error_message || '').match(/more requests available in (\d+) seconds/);
          if (retry) this.put('feedRetryAt', Date.now() + Number(retry[1]) * 1000);
          sourceStatus = `${r.status}: ${String(detail.error_message || detail.error_name || 'request rejected').slice(0, 160)}`;
          throw new Error('Public feed unavailable');
        }
        const data = await r.json();
        if (data.backoff) this.put('feedRetryAt', Date.now() + Math.max(data.backoff * 1000, 86400000));
        if (data.error_id) throw new Error('Public feed rejected request');
        const evidence = evidenceFromFeed(data);
        this.put('evidence', evidence);
        this.put('feedFetchedAt', Date.now());
        this.put('feedQuota', data.quota_remaining ?? null);
        this.put('evidenceSource', FEED);
      } else if (Date.now() < retryAt) feedError = 'Public source requested backoff; prior evidence retained.';
    } catch {
      feedError = `Primary source unavailable (${sourceStatus ?? 'connection failure'}).`;
      try {
        const r = await fetch(FALLBACK_FEED, { signal: AbortSignal.timeout(10000), headers: { 'User-Agent': 'BusinessFactoryEvidence/1.0', 'Accept': 'application/vnd.github+json' } });
        if (!r.ok) {
          const detail = await r.json().catch(() => ({}));
          feedError += ` Fallback status ${r.status}: ${String(detail.message || 'request rejected').slice(0, 160)}.`;
          throw new Error('Fallback unavailable');
        }
        const evidence = evidenceFromGithub(await r.json());
        this.put('evidence', evidence); this.put('feedFetchedAt', Date.now()); this.put('evidenceSource', FALLBACK_FEED);
        feedError += ' Public GitHub issue fallback collected; these are adjacent interest signals only.';
      } catch { feedError += ' Fallback unavailable; prior evidence retained. No signals invented.'; }
    }
    if (job?.bootstrapRevision !== this.env.BOOTSTRAP_REVISION || Date.now() - this.get('seoCheckedAt', 0) >= 86400000) {
      const urls = [PRODUCT_ORIGIN + '/'];
      if (publicationAllowed(resource, await resourceDigest(resource))) urls.push(RESOURCE_URL);
      this.put('seo', await auditSEO(urls)); this.put('seoCheckedAt', Date.now());
    }
    if (this.env.PRODUCT_PAYMENTS) {
      try {
        if (!this.paymentConfiguration().ready && this.env.LEMON_WEBHOOK_SECRET && (job?.bootstrapRevision !== this.env.BOOTSTRAP_REVISION || Date.now() - this.get('paymentSetupCheckedAt', 0) >= 3600000)) {
          this.put('paymentSetupCheckedAt', Date.now());
          try { this.put('paymentConfiguration', await this.env.PRODUCT_PAYMENTS.configure(this.env.LEMON_WEBHOOK_SECRET)); } catch (error) { this.put('paymentConfiguration', { ready: false, merchantEligibilityConfirmed: false, reason: 'Test account, product or API access could not be verified. Live processing remains disabled.', diagnostic: String(error.message).replace(/Bearer\s+\S+/gi, '[redacted]').replace(/[A-Za-z0-9_-]{32,}/g, '[redacted]').slice(0, 220) }); }
        }
        const pending = this.purchases().filter(p => p.orderId && p.state !== 'revoked').sort((a,b) => Date.parse(a.verifiedAt || 0) - Date.parse(b.verifiedAt || 0)).slice(0, 5);
        const check = await this.env.PRODUCT_PAYMENTS.reconcile(pending);
        for (const receipt of check.receipts) this.applyTestOrder(receipt);
        this.put('paymentMonitoring', { checkedAt: new Date().toISOString(), connected: check.connected, failures: check.failures || 0 });
      } catch { this.put('paymentMonitoring', { checkedAt: new Date().toISOString(), connected: null, error: 'Reconciliation unavailable; new fulfillment still requires fresh provider verification.' }); }
    }
    // Only explicit founder-approved exact sitemap tasks can execute; a draft is never approval.
    const distribution = this.get('distribution', structuredClone(distributionPlan));
    for (const task of distribution.submissions || []) if (!task.result?.submitted && (!task.retryAt || Date.now() >= task.retryAt)) {
      try { task.result = await submitSitemap(task, this.env.GOOGLE_SEARCH_CONSOLE_TOKEN); } catch { task.result = { submitted: false, reason: 'Authenticated submission unavailable.' }; }
      task.retryAt = Date.now() + 86400000;
    }
    if (distribution.submissions?.length) this.put('distribution', distribution);
    this.put('health', health);
    // Perform intelligence, drafting and optimization on the timer, not only dashboard reads.
    const opportunity = rankOpportunity(this.get('evidence', []));
    this.put('opportunity', opportunity);
    this.put('productDraft', { ...registry.candidates[0], generatedAt: startedAt, templateReady: true, deploymentAllowed: false });
    this.put('distributionDraft', resourceDraft(opportunity));
    this.put('optimization', registry.products.map(p => ({ product: p.id, ...this.access(p.id) })));
    const snapshot = this.snapshot();
    const week = Math.floor(Date.now() / (7 * 86400000));
    if (this.get('reportWeek', null) !== week || this.get('periodicReport', {})?.bootstrapRevision !== this.env.BOOTSTRAP_REVISION) { this.put('periodicReport', { bootstrapRevision: this.env.BOOTSTRAP_REVISION, generatedAt: new Date().toISOString(), products: snapshot.products.map(p => ({ id: p.id, counts: p.counts, health: p.health, decision: p.decision, acquisitionChannels: p.acquisitionChannels })), payments: snapshot.payments, economics: snapshot.economics, experiment: snapshot.experiment.decision, seo: snapshot.seo, actualRevenueCents: 0, disclaimer: 'Event counts are not unique buyers. Test payments never count as revenue. Actual operating costs remain incomplete.' }); this.put('reportWeek', week); }
    this.sql.exec("DELETE FROM lemon_purchases WHERE order_id IS NULL AND json_extract(value, '$.createdAt') < ?", new Date(Date.now() - 7 * 86400000).toISOString());
    this.put('experiment', { checkedAt: new Date().toISOString(), ...snapshot.experiment });
    this.sql.exec('DELETE FROM events WHERE day < ?', new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10));
    this.sql.exec('DELETE FROM channels WHERE day < ?', new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10));
    this.sql.exec('DELETE FROM funnel WHERE day < ?', new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10));
    const result = { startedAt, completedAt: new Date().toISOString(), invocation, bootstrapRevision: this.env.BOOTSTRAP_REVISION, status: feedError ? 'partial' : 'completed', feedError,
      source: this.get('evidenceSource', FEED), sourceQuotaRemaining: this.get('feedQuota', null), experimentDecision: snapshot.experiment.decision, automation: ['technical SEO audit', 'test refund reconciliation', 'weekly persisted report', 'approved sitemap submission', 'health checks', 'public signal refresh', 'ranking', 'aggregate retention', 'threshold recommendations', 'attributed funnel monitoring', 'unpublished resource draft'],
      requiresApproval: ['new product publication', 'distribution publication', 'code deployment', 'live payments', 'spending', 'retiring independent products'] };
    this.put('job', result); return result;
  }
}

// RPC is accessible only through an account-owned service binding, never the public HTTP router.
export class Analytics extends WorkerEntrypoint {
  async paymentConfiguration() { return store(this.env).paymentConfiguration(); }
  async reserveTestPurchase(value) { return store(this.env).reserveTestPurchase(value); }
  async lookupTestPurchase(key, buyer, report) { return store(this.env).lookupTestPurchase(key, buyer, report); }
  async applyTestOrder(receipt) { return store(this.env).applyTestOrder(receipt); }
  async record(value) { return store(this.env).record(value); }
  async access(product) { return store(this.env).access(product); }
}
export class Operations extends WorkerEntrypoint {
  async run() { return store(this.env).runScheduled(); }
}
export default {
  async fetch(request, env, ctx) {
    const path = new URL(request.url).pathname;
    if (request.method === 'POST' && path === '/api/payments/lemon-test') {
      if (!env.LEMON_WEBHOOK_SECRET || !(await store(env).paymentConfiguration()).ready) return json({ error: 'Test merchant connection pending. Live payments disabled.' }, 503);
      try {
        if (Number(request.headers.get('Content-Length') || 0) > 40000 || !request.body) return json({ error: 'Invalid receipt size.' }, 413);
        const reader = request.body.getReader(); let total = 0, chunks = [];
        while (true) { const { value, done } = await reader.read(); if (done) break; total += value.length; if (total > 40000) { await reader.cancel(); return json({ error: 'Receipt too large.' }, 413); } chunks.push(value); }
        const body = new Uint8Array(total); let offset = 0; for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.length; }
        const receipt = await verifyLemonTestWebhook(new TextDecoder('utf-8', { fatal: true }).decode(body), request.headers.get('X-Signature'), env.LEMON_WEBHOOK_SECRET);
        await store(env).applyTestOrder(receipt);
        return json({ accepted: true, testOnly: true });
      } catch { return json({ error: 'Unsigned, live, unbound or unsupported test receipt rejected.' }, 400); }
    }
    if (request.method === 'POST' && path === '/api/payments/stripe-test') {
      if (!env.STRIPE_WEBHOOK_SECRET) return json({ error: 'Payment receipt adapter not configured. Live payments disabled.' }, 503);
      if (Number(request.headers.get('Content-Length') || 0) > 40000) return json({ error: 'Receipt too large.' }, 413);
      try {
        const reader = request.body.getReader(); let total = 0, chunks = [];
        while (true) { const { value, done } = await reader.read(); if (done) break; total += value.length; if (total > 40000) { await reader.cancel(); return json({ error: 'Receipt too large.' }, 413); } chunks.push(value); }
        const body = new Uint8Array(total); let offset = 0; for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.length; }
        const receipt = await verifyTestReceipt(new TextDecoder().decode(body), request.headers.get('Stripe-Signature'), env.STRIPE_WEBHOOK_SECRET, registry.products);
        return json(await store(env).recordTestReceipt(receipt));
      } catch { return json({ error: 'Unverified, expired, live or unsupported receipt rejected.' }, 400); }
    }
    if (request.method !== 'GET') return json({ error: 'Read-only public interface.' }, 405);
    try {
      if (path === '/robots.txt') return new Response('User-agent: *\nDisallow: /api/\nDisallow: /health\nDisallow: /$\nSitemap: ' + FACTORY_ORIGIN + '/sitemap.xml\n', { headers: { ...headers, 'Content-Type': 'text/plain; charset=utf-8' } });
      if (path === '/sitemap.xml') return new Response(sitemap(publicationAllowed(resource, await resourceDigest(resource)) ? [RESOURCE_URL] : []), { headers: { ...headers, 'Content-Type': 'application/xml; charset=utf-8' } });
      if (path === '/health') return json({ ok: true, paymentsEnabled: false });
      if (path === '/resources/sla-checklist' && publicationAllowed(resource, await resourceDigest(resource))) {
        const measurement = traffic(request);
        if (measurement) ctx.waitUntil(store(env).record({ product: 'proposal-preflight', event: 'resourceViews', ...measurement, channel: measurement.channel === 'direct' ? 'sla-checklist' : measurement.channel }).catch(() => {}));
        return new Response(resourceHTML(resource), { headers: { ...headers, 'Content-Type': 'text/html; charset=utf-8' } });
      }
      if (path === '/api/portfolio') {
        const snapshot = await store(env).snapshot();
        if (snapshot.scheduledJob?.bootstrapRevision !== env.BOOTSTRAP_REVISION) ctx.waitUntil(store(env).runScheduled('initialization'));
        return json(snapshot);
      }
      if (['/', '/dashboard.js', '/style.css'].includes(path)) {
        const r = await env.ASSETS.fetch(request);
        return new Response(r.body, { status: r.status, headers: { ...Object.fromEntries(r.headers), ...headers, 'X-Robots-Tag': 'noindex', 'Content-Type': r.headers.get('Content-Type') } });
      }
      return json({ error: 'Not published. New product and distribution assets require founder approval.' }, 404);
    } catch { return json({ error: 'Portfolio temporarily unavailable.' }, 503); }
  },
  async scheduled(event, env, ctx) { ctx.waitUntil(store(env).runScheduled()); }
};
