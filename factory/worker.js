import { DurableObject, WorkerEntrypoint } from 'cloudflare:workers';
import registry from './registry.json';
import resource from './resource.json';
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
    this.sql.exec('CREATE TABLE IF NOT EXISTS state (key TEXT PRIMARY KEY, value TEXT NOT NULL)');
    this.sql.exec('CREATE TABLE IF NOT EXISTS test_receipts (id TEXT PRIMARY KEY, product TEXT, amountCents INTEGER, verifiedAt TEXT)');
    this.sql.exec('CREATE TABLE IF NOT EXISTS channels (day TEXT, product TEXT, channel TEXT, test INTEGER, count INTEGER DEFAULT 0, PRIMARY KEY(day,product,channel,test))');
  }
  get(key, fallback) { const rows = [...this.sql.exec('SELECT value FROM state WHERE key = ?', key)]; return rows[0] ? JSON.parse(rows[0].value) : fallback; }
  put(key, value) { this.sql.exec('INSERT INTO state(key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value', key, JSON.stringify(value)); }
  record(value) {
    const e = safeEvent(value, registry), day = new Date().toISOString().slice(0, 10);
    this.sql.exec(`INSERT INTO events(day,product,test,${e.event}) VALUES (?,?,?,1) ON CONFLICT(day,product,test) DO UPDATE SET ${e.event}=${e.event}+1`, day, e.product, Number(e.test));
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
  snapshot() {
    const cutoff = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
    const rows = [...this.sql.exec('SELECT * FROM events WHERE day >= ? ORDER BY day', cutoff)];
    const health = this.get('health', {}), job = this.get('job', null), evidence = this.get('evidence', []);
    const products = registry.products.map(p => {
      const total = Object.fromEntries(EVENTS.map(e => [e, 0]));
      const tests = Object.fromEntries(EVENTS.map(e => [e, 0]));
      for (const r of rows.filter(r => r.product === p.id)) for (const e of EVENTS) (r.test ? tests : total)[e] += r[e];
      return { ...p, counts: total, testCounts: tests, health: health[p.id] || null, decision: decision(p, total, health[p.id]),
        resourceReferralPageviews: [...this.sql.exec('SELECT COALESCE(SUM(count),0) AS n FROM channels WHERE day>=? AND product=? AND test=0', cutoff, p.id)][0].n,
        completionEventsPerPageview: total.pageviews ? total.reviews / total.pageviews : null };
    });
    const opportunity = rankOpportunity(evidence);
    const draft = resourceDraft(opportunity);
    return { observedAt: new Date().toISOString(), products, opportunityQueue: [opportunity],
      candidates: registry.candidates, distributionDraft: { title: draft.title, publication: draft.publication }, economics: { ...economics(registry), verifiedTestReceiptCount: [...this.sql.exec('SELECT COUNT(*) AS n FROM test_receipts')][0].n }, scheduledJob: job,
      measurement: 'Rolling 30-day event counts, not unique people or customers. Known bots and tagged test traffic excluded from production counts. Repeat events remain possible.',
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
        const config = await c.json(); paymentsDisabled = c.ok && !config.paymentsAvailable && config.paymentMode === 'test';
        ok = ok && paymentsDisabled;
        if (ok && this.access(p.id).allowed) {
          const probe = await fetch(p.url + '/api/preview', { method: 'POST', signal: AbortSignal.timeout(10000), headers: { 'User-Agent': 'BusinessFactoryHealth/1.0', 'Content-Type': 'application/json', 'Origin': p.url, 'X-Factory-Test': '1' }, body: JSON.stringify({ requirements: 'Provide response within 30 minutes', proposal: 'SYNTHETIC MONITORING CHECK. Our response time is 60 minutes.' }) });
          const report = await probe.json();
          coreAnalysisWorks = probe.ok && report.freeBeta === true && report.findings?.[0]?.status === 'Numeric requirement mismatch';
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
    this.put('health', health);
    this.sql.exec('DELETE FROM events WHERE day < ?', new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10));
    this.sql.exec('DELETE FROM channels WHERE day < ?', new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10));
    const result = { startedAt, completedAt: new Date().toISOString(), invocation, bootstrapRevision: this.env.BOOTSTRAP_REVISION, status: feedError ? 'partial' : 'completed', feedError,
      source: this.get('evidenceSource', FEED), sourceQuotaRemaining: this.get('feedQuota', null), automation: ['health checks', 'public signal refresh', 'ranking', 'aggregate retention', 'threshold recommendations', 'unpublished resource draft'],
      requiresApproval: ['new product publication', 'distribution publication', 'code deployment', 'live payments', 'spending', 'retiring independent products'] };
    this.put('job', result); return result;
  }
}

// RPC is accessible only through an account-owned service binding, never the public HTTP router.
export class Analytics extends WorkerEntrypoint {
  async record(value) { return store(this.env).record(value); }
  async access(product) { return store(this.env).access(product); }
}
export class Operations extends WorkerEntrypoint {
  async run() { return store(this.env).runScheduled(); }
}
export default {
  async fetch(request, env, ctx) {
    const path = new URL(request.url).pathname;
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
      if (path === '/health') return json({ ok: true, paymentsEnabled: false });
      if (path === '/resources/sla-checklist' && publicationAllowed(resource, await resourceDigest(resource))) return new Response(resourceHTML(resource), { headers: { ...headers, 'Content-Type': 'text/html; charset=utf-8' } });
      if (path === '/api/portfolio') {
        const snapshot = await store(env).snapshot();
        if (snapshot.scheduledJob?.bootstrapRevision !== env.BOOTSTRAP_REVISION) ctx.waitUntil(store(env).runScheduled('initialization'));
        return json(snapshot);
      }
      if (['/', '/dashboard.js', '/style.css'].includes(path)) {
        const r = await env.ASSETS.fetch(request);
        return new Response(r.body, { status: r.status, headers: { ...Object.fromEntries(r.headers), ...headers, 'Content-Type': r.headers.get('Content-Type') } });
      }
      return json({ error: 'Not published. New product and distribution assets require founder approval.' }, 404);
    } catch { return json({ error: 'Portfolio temporarily unavailable.' }, 503); }
  },
  async scheduled(event, env, ctx) { ctx.waitUntil(store(env).runScheduled()); }
};
