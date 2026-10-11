import test from 'node:test';
import assert from 'node:assert/strict';
import registry from '../registry.json' with { type: 'json' };
import { createHmac } from 'node:crypto';
import { verifyTestReceipt } from '../accounting.js';
import resource from '../resource.json' with { type: 'json' };
import { resourceDigest, resourceHTML } from '../resource.js';
import { safeEvent, evidenceFromFeed, evidenceFromGithub, rankOpportunity, economics, decision, publicationAllowed, resourceDraft } from '../core.js';
test('Analytics retains only aggregate event shape and rejects unregistered products/events', () => {
  assert.deepEqual(safeEvent({ product: 'proposal-preflight', event: 'reviews', proposal: 'private', ip: 'private', test: true }, registry), { product: 'proposal-preflight', event: 'reviews', test: true });
  assert.throws(() => safeEvent({ product: 'unknown', event: 'reviews' }, registry));
  assert.throws(() => safeEvent({ product: 'proposal-preflight', event: 'payment' }, registry));
});
test('Evidence validates source URLs and does not turn public interest into paid demand', () => {
  const evidence = evidenceFromFeed({ items: [{ question_id: 1, title: 'test fixture', link: 'https://serverfault.com/questions/1/test', view_count: 2000, answer_count: 2, creation_date: 1 }, { question_id: 2, link: 'https://evil.example/' }] });
  assert.equal(evidence.length, 1); const ranked = rankOpportunity(evidence);
  assert.equal(ranked.dimensions.revenueEvidence, 0); assert.equal(ranked.automaticLaunchAllowed, false);
  assert.equal(rankOpportunity([]).dimensions.demand, 0);
  assert.throws(() => evidenceFromFeed({}));
  const issues = evidenceFromGithub({ items: [{ id: 1, title: 'fixture', html_url: 'https://github.com/test/example/issues/1', comments: 2, created_at: '2026-10-11' }] });
  assert.equal(issues[0].views, null); assert.equal(issues[0].comments, 2); assert.equal(rankOpportunity(issues).dimensions.revenueEvidence, 0);
});
test('Unknown costs and absent verified payments cannot produce a profit claim', () => {
  const e = economics({ ...registry, costs: [{ amountCents: 1500 }, { amountCents: -10 }] });
  assert.equal(e.recordedCostCents, 1500); assert.equal(e.verifiedRevenueCents, 0); assert.equal(e.profitCents, null);
});
test('Thresholds require age and observations; external products are never silently retired', () => {
  const p = { ...registry.products[0], managed: false }, now = Date.parse(registry.products[0].launchedAt);
  assert.equal(decision(p, { pageviews: 500 }, null, now).action, 'observe');
  assert.equal(decision(p, {}, null, now + 31*86400000).action, 'improve-distribution');
  const d = decision(p, { pageviews: 100, reviews: 2 }, null, now + 31*86400000);
  assert.equal(d.action, 'discontinue'); assert.equal(d.pause, false);
  assert.equal(decision({ ...p, managed: true }, { pageviews: 100, reviews: 2 }, null, now + 31*86400000).pause, true);
  assert.equal(decision(p, {}, { failedChecks: 3 }, now).action, 'repair');
  assert.equal(decision({ ...p, managed: true }, {}, null, now + 61*86400000).pause, true);
});
test('Resource remains unpublished; changes invalidate approval and rendered content is escaped', async () => {
  const digest = await resourceDigest(resource);
  assert.equal(publicationAllowed(resource, digest), false);
  assert.notEqual(await resourceDigest({ ...resource, intro: 'changed' }), digest);
  assert.equal(resourceHTML({ ...resource, title: '<script>alert(1)</script>' }).includes('<script>'), false);
});
test('Publication requires approval for the precise artifact, not a generic permission or stale digest', () => {
  assert.equal(publicationAllowed(registry.candidates[0], 'abc'), false);
  const candidate = { publication: 'approved', approval: { actor: 'founder', artifactDigest: 'abc', approvedAt: '2026-10-11' } };
  assert.equal(publicationAllowed(candidate, 'abc'), true); assert.equal(publicationAllowed(candidate, 'changed'), false);
  assert.equal(resourceDraft(rankOpportunity([])).publication, 'awaiting-approval');
});
test('Test receipt verification binds signed content, timestamp and product; live receipts cannot become revenue', async () => {
  const secret = 'test-only-secret-fixture'.repeat(3), now = Date.now(), t = Math.floor(now/1000);
  const event = { type: 'checkout.session.completed', livemode: false, data: { object: { id: 'cs_test_fixture', payment_status: 'paid', amount_total: 900, currency: 'usd', metadata: { product: 'proposal-preflight-v1' } } } };
  const raw = JSON.stringify(event), signature = `t=${t},v1=${createHmac('sha256', secret).update(`${t}.${raw}`).digest('hex')}`;
  assert.equal((await verifyTestReceipt(raw, signature, secret, registry.products, now)).mode, 'test');
  await assert.rejects(() => verifyTestReceipt(raw.replace('false','true'), signature, secret, registry.products, now));
  await assert.rejects(() => verifyTestReceipt(raw, signature, secret, registry.products, now+301000));
  const live = raw.replace('false','true'), liveSignature = `t=${t},v1=${createHmac('sha256', secret).update(`${t}.${live}`).digest('hex')}`;
  await assert.rejects(() => verifyTestReceipt(live, liveSignature, secret, registry.products, now));
});
