import test from 'node:test';
import assert from 'node:assert/strict';
import { traffic, productEvent, experimentDecision } from '../telemetry.js';
import commercial from '../factory/commercial.json' with { type: 'json' };
import registry from '../factory/registry.json' with { type: 'json' };
import { rankOpportunity } from '../factory/core.js';
import { prepareLemonTestCheckout } from '../payments/lemon.js';

test('US customer market never changes Moroccan operator eligibility or turns global interest into US demand', () => {
  assert.equal(registry.targetMarket.countryCode, 'US');
  assert.equal(registry.operator.jurisdictionCode, 'MA');
  assert.equal(commercial.operatorJurisdiction, 'MA');
  assert.equal(commercial.experiment.targetMarket, 'US');
  assert.equal(commercial.experiment.currency, 'USD');
  assert.ok(commercial.opportunities.every(o => o.targetMarket === 'US'));
  assert.equal(commercial.monetization.operatorJurisdiction, 'MA');
  assert.equal(commercial.monetization.buyerMarket, 'US');
  assert.equal(commercial.monetization.livePaymentsEnabled, false);
  const ranked = rankOpportunity([{ views: 100000, title: 'Global fixture', url: 'https://example.com' }]);
  assert.equal(ranked.targetMarket, 'US');
  assert.equal(ranked.dimensions.demand, 0);
  assert.equal(ranked.dimensions.revenueEvidence, 0);
});

test('Bot, operator and health traffic is excluded; tagged tests and checklist attribution remain segregated', () => {
  const req = (agent, test) => new Request('https://example.com/?source=sla-checklist', { headers: { 'User-Agent': agent, ...(test ? { 'X-Factory-Test': '1' } : {}) } });
  for (const agent of ['Googlebot', 'BusinessFactoryHealth/1.0', 'ProposalPreflightSmoke/1.0', 'curl/8', '']) assert.equal(traffic(req(agent)), null);
  assert.deepEqual(traffic(req('BusinessFactoryHealth/1.0', true)), { test: true, channel: 'sla-checklist' });
  assert.deepEqual(traffic(req('Mozilla/5.0')), { test: false, channel: 'sla-checklist' });
  const event = new Request('https://example.com/api/events?source=sla-checklist', { method: 'POST' });
  assert.equal(productEvent(event, new Response(), { event: 'intent' }), 'purchaseIntent');
  assert.equal(productEvent(event, new Response(), { event: 'payment' }), null);
  assert.equal(productEvent(event, new Response('', { status: 400 }), { event: 'intent' }), 'errors');
});
test('Commercial experiment stops without distribution or useful interest; never automatically publishes or activates payment', () => {
  const e = commercial.experiment, start = Date.parse(e.startedAt);
  const empty = { pageviews: 0, reviews: 0, purchaseIntent: 0 };
  assert.equal(experimentDecision(e, empty, start).action, 'observe');
  assert.equal(experimentDecision(e, empty, start + 30 * 86400000).action, 'stop-channel-investment');
  assert.equal(experimentDecision(e, { pageviews: 10, reviews: 9, purchaseIntent: 3 }, start + 30 * 86400000).action, 'stop-scaling');
  assert.equal(experimentDecision(e, { pageviews: 10, reviews: 10, purchaseIntent: 3 }, start + 30 * 86400000).action, 'review-payment-readiness');
  assert.equal(commercial.opportunities.filter(o => o.selected).length, 1);
});
const env = { PAYMENT_MODE: 'test', LEMON_TEST_INTEGRATION_APPROVED: 'true', LEMON_API_KEY: 'offline-fixture', LEMON_STORE_ID: '1', LEMON_VARIANT_ID: '2', PUBLIC_BASE_URL: 'https://example.com' };
const bindings = { reportDigest: 'a'.repeat(64), buyerKeyHash: 'b'.repeat(64), checkoutToken: 'c'.repeat(64) };
test('Prepared Lemon test checkout fixes price and mode, binds only hashes, and rejects redirect substitution', async () => {
  const providerFetch = async (url, options) => {
    if (url.endsWith('/users/me')) return Response.json({ meta: { test_mode: true } });
    if (url.endsWith('/stores/1')) return Response.json({ data: { type: 'stores', id: '1', attributes: { currency: 'USD' } } });
    if (url.endsWith('/variants/2')) return Response.json({ data: { type: 'variants', id: '2', attributes: { test_mode: true, is_subscription: false } } });
    assert.equal(url, 'https://api.lemonsqueezy.com/v1/checkouts');
    const a = JSON.parse(options.body).data.attributes;
    assert.equal(a.test_mode, true); assert.equal(a.custom_price, 900);
    assert.deepEqual(Object.keys(a.checkout_data.custom).sort(), ['buyer_key_hash','checkout_key_hash','product','report_digest']);
    assert.equal(a.product_options.redirect_url, 'https://example.com/?checkout=ls_test_' + 'c'.repeat(64));
    return Response.json({ data: { type: 'checkouts', attributes: { custom_price: 900, store_id: 1, variant_id: 2, test_mode: true, url: 'https://fixture.lemonsqueezy.com/checkout/buy/test' } } });
  };
  assert.equal((await prepareLemonTestCheckout({ env, ...bindings, providerFetch })).testOnly, true);
  for (const url of ['http://fixture.lemonsqueezy.com/checkout/test', 'https://fixture.lemonsqueezy.com.evil.test/checkout/test', 'https://fixture.lemonsqueezy.com@evil.test/checkout/test']) {
    await assert.rejects(() => prepareLemonTestCheckout({ env, ...bindings, providerFetch: async (path, options) => path.endsWith('/checkouts') ? Response.json({ data: { type: 'checkouts', attributes: { custom_price: 900, store_id: 1, variant_id: 2, test_mode: true, url } } }) : providerFetch(path, options) }));
  }
});
test('No missing credentials, live mode or live provider response can create a usable test checkout', async () => {
  let calls = 0;
  const providerFetch = async url => {
    calls++;
    if (url.endsWith('/users/me')) return Response.json({ meta: { test_mode: true } });
    if (url.endsWith('/stores/1')) return Response.json({ data: { type: 'stores', id: '1', attributes: { currency: 'USD' } } });
    if (url.endsWith('/variants/2')) return Response.json({ data: { type: 'variants', id: '2', attributes: { test_mode: true, is_subscription: false } } });
    return Response.json({ data: { type: 'checkouts', attributes: { custom_price: 900, store_id: 1, variant_id: 2, test_mode: false, url: 'https://fixture.lemonsqueezy.com/checkout/buy/live' } } });
  };
  for (const bad of [{ ...env, PAYMENT_MODE: 'live' }, { ...env, LEMON_API_KEY: '' }, { ...env, LEMON_TEST_INTEGRATION_APPROVED: 'false' }, { ...env, PUBLIC_BASE_URL: 'http://example.com' }]) await assert.rejects(() => prepareLemonTestCheckout({ env: bad, ...bindings, providerFetch }));
  assert.equal(calls, 0);
  await assert.rejects(() => prepareLemonTestCheckout({ env, ...bindings, providerFetch }));
  assert.equal(calls, 4);
});
test('Test checkout refuses non-USD stores and subscription or live variants before creation', async () => {
  for (const scenario of ['currency', 'subscription', 'live']) {
    const providerFetch = async url => {
      if (url.endsWith('/users/me')) return Response.json({ meta: { test_mode: true } });
    if (url.endsWith('/stores/1')) return Response.json({ data: { type: 'stores', id: '1', attributes: { currency: scenario === 'currency' ? 'EUR' : 'USD' } } });
      if (url.endsWith('/variants/2')) return Response.json({ data: { type: 'variants', id: '2', attributes: { test_mode: scenario !== 'live', is_subscription: scenario === 'subscription' } } });
      assert.fail('Rejected configuration must never reach checkout creation.');
    };
    await assert.rejects(() => prepareLemonTestCheckout({ env, ...bindings, providerFetch }));
  }
});


test('Directory listing attribution stays bounded and segregates operator tests', () => {
  assert.deepEqual(traffic(new Request('https://example.com/?source=directory-listing', { headers: { 'User-Agent': 'Mozilla/5.0', 'X-Factory-Test': '1' } })), { test: true, channel: 'directory-listing' });
  assert.equal(traffic(new Request('https://example.com/?source=arbitrary-private-url', { headers: { 'User-Agent': 'Mozilla/5.0' } })).channel, 'direct');
});
