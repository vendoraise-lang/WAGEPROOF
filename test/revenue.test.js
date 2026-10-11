// Provider fixtures exercise contracts, NOT actual merchant transactions or business results.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { createApp } from '../server.js';
import { sha256, testOrder, verifyLemonTestWebhook, reducePurchase, paymentTotals, prepareLemonTestCheckout, configureLemonTestAccount, paymentEnvironment } from '../payments/lemon.js';
import { auditSEO, sitemap, submitSitemap, RESOURCE_URL, PRODUCT_ORIGIN, FACTORY_ORIGIN } from '../seo.js';
import { traffic } from '../telemetry.js';
const secret = 'local-fixture-'.padEnd(32, 'x');
const env = { PAYMENT_PROVIDER: 'lemonsqueezy', PAYMENT_MODE: 'test', LEMON_TEST_INTEGRATION_APPROVED: 'true', LEMON_API_KEY: 'offline-fixture', LEMON_STORE_ID: '1', LEMON_VARIANT_ID: '2', APP_SECRET: secret, PUBLIC_BASE_URL: 'https://example.com', FREE_BETA: 'true' };
const input = { requirements: 'Response within 30 minutes\nUptime at least 99.9%\nProvide 24/7 support\nDescribe incident escalation process', proposal: 'Our response time is 60 minutes. Our uptime commitment is 99.5%. We provide business-hours support. The incident escalation process is excellent.', buyerKey: 'a'.repeat(64) };
function order(overrides = {}) {
  return { type: 'orders', id: '10', attributes: { store_id: 1, test_mode: true, currency: 'USD', subtotal: 900, discount_total: 0, setup_fee: 0, tax: 90, total: 990, refunded_amount: 0, status: 'paid', updated_at: new Date().toISOString(), first_order_item: { order_id: 10, variant_id: 2, price: 900, test_mode: true }, urls: { receipt: 'https://app.lemonsqueezy.com/my-orders/fixture?signature=fixture' }, ...overrides } };
}
const signed = (raw, key = secret) => createHmac('sha256', key).update(raw).digest('hex');
class Ledger {
  rows = new Map();
  async reserveTestPurchase(p) { this.rows.set(p.keyHash, { ...p, state: 'pending', orderId: null }); }
  async lookupTestPurchase(k,b,r) { const p = this.rows.get(k); return p?.buyerHash === b && p?.reportDigest === r ? p : null; }
  async applyTestOrder(receipt) { const next = reducePurchase(this.rows.get(receipt.keyHash), receipt); this.rows.set(receipt.keyHash, next); return next; }
}
test('Self-service Lemon test journey verifies signed order, browser and text, fulfills, recovers, and revokes on refund', async t => {
  const ledger = new Ledger(); let metadata, actualOrder = order();
  const providerFetch = async (url, options) => {
    if (url.endsWith('/users/me')) return Response.json({ meta: { test_mode: true } });
    if (url.endsWith('/stores/1')) return Response.json({ data: { type: 'stores', id: '1', attributes: { currency: 'USD' } } });
    if (url.endsWith('/variants/2')) return Response.json({ data: { type: 'variants', id: '2', attributes: { test_mode: true, is_subscription: false } } });
    if (url.endsWith('/checkouts')) { const attributes = JSON.parse(options.body).data.attributes; metadata = attributes.checkout_data.custom; assert.equal(attributes.custom_price, 900); assert.equal(attributes.test_mode, true); assert(!options.body.includes('incident')); return Response.json({ data: { type: 'checkouts', attributes: { custom_price: 900, store_id: 1, variant_id: 2, test_mode: true, url: 'https://fixture.lemonsqueezy.com/checkout/buy/fixture' } } }); }
    assert.equal(url, 'https://api.lemonsqueezy.com/v1/orders/10'); return Response.json({ data: actualOrder });
  };
  const server = createApp({ env, lemonFetch: providerFetch, paymentStore: ledger });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = (path, value) => fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(value) });
  const config = await (await fetch(base + '/api/config')).json(); assert.equal(config.livePaymentsEnabled, false); assert.equal(config.paymentsAvailable, true); assert.equal(config.freeBeta, false);
  const preview = await (await post('/api/preview', input)).json(); assert.equal(preview.findings.length, 3);
  const checkout = await (await post('/api/checkout?source=sla-checklist', input)).json(); assert.match(checkout.sessionId, /^ls_test_[a-f0-9]{64}$/);
  assert.equal((await post('/api/report', { ...input, sessionId: checkout.sessionId })).status, 409);
  const raw = JSON.stringify({ meta: { event_name: 'order_created', custom_data: metadata }, data: actualOrder });
  const receipt = await verifyLemonTestWebhook(raw, signed(raw), secret);
  await ledger.applyTestOrder(receipt); await ledger.applyTestOrder(receipt);
  const result = await post('/api/report', { ...input, sessionId: checkout.sessionId }); assert.equal(result.status, 200);
  const full = await result.json(); assert.equal(full.findings.length, 4); assert.equal(full.testPayment, true); assert.deepEqual(full.payment, { mode: 'test', orderId: '10', currency: 'USD', subtotalCents: 900, totalCents: 990 }); assert.match(full.receiptUrl, /^https:\/\/app.lemonsqueezy.com\/my-orders\//);
  for (const altered of [{ buyerKey: 'b'.repeat(64) }, { proposal: 'Different draft.' }]) assert.equal((await post('/api/report', { ...input, ...altered, sessionId: checkout.sessionId })).status, 403);
  actualOrder = order({ status: 'refunded', refunded_amount: 990 });
  assert.equal((await post('/api/report', { ...input, sessionId: checkout.sessionId })).status, 403);
  await ledger.applyTestOrder(receipt); // replay cannot restore access
  assert.equal((await post('/api/report', { ...input, sessionId: checkout.sessionId })).status, 403);
  const totals = paymentTotals([...ledger.rows.values()]); assert.equal(totals.testOrderCount, 1); assert.equal(totals.testRevokedOrderCount, 1); assert.equal(totals.testRefundedCents, 990); assert.equal(totals.verifiedLiveRevenueCents, 0);
});
test('Webhook tampering, live orders, wrong amounts, unknown products and binding substitution are rejected', async () => {
  const metadata = { product: 'proposal-preflight-v1', checkout_key_hash: 'a'.repeat(64), report_digest: 'b'.repeat(64), buyer_key_hash: 'c'.repeat(64) };
  const raw = JSON.stringify({ meta: { event_name: 'order_created', custom_data: metadata }, data: order() });
  await assert.rejects(() => verifyLemonTestWebhook(raw + ' ', signed(raw), secret));
  await assert.rejects(() => verifyLemonTestWebhook(raw, signed(raw, 'wrong-secret'), secret));
  for (const change of [{ test_mode: false }, { subtotal: 1 }, { total: 100 }, { currency: 'EUR' }, { status: 'unknown' }, { updated_at: '2099-01-01' }, { first_order_item: { price: 900, order_id: 11, variant_id: 2, test_mode: true } }]) assert.throws(() => testOrder(order(change)));
  const unknown = raw.replace('proposal-preflight-v1', 'other-product'); await assert.rejects(() => verifyLemonTestWebhook(unknown, signed(unknown), secret));
  const receipt = await verifyLemonTestWebhook(raw, signed(raw), secret);
  const purchase = { keyHash: receipt.keyHash, test: true, storeId: '1', variantId: '2', reportDigest: metadata.report_digest, buyerHash: metadata.buyer_key_hash, state: 'pending', orderId: '10' };
  for (const change of [{ storeId: '3' }, { variantId: '4' }, { reportDigest: 'd'.repeat(64) }, { buyerHash: 'e'.repeat(64) }, { orderId: '11' }]) assert.throws(() => reducePurchase(purchase, { ...receipt, ...change }));
  const refundRaw = JSON.stringify({ meta: { event_name: 'order_refunded', custom_data: metadata }, data: order({ status: 'partial_refund', refunded_amount: 100 }) });
  assert.equal((await verifyLemonTestWebhook(refundRaw, signed(refundRaw), secret)).state, 'revoked');
});
test('Live API keys cannot create checkout even with test flags', async () => {
  let calls = 0;
  await assert.rejects(() => prepareLemonTestCheckout({ env, reportDigest: 'a'.repeat(64), buyerKeyHash: 'b'.repeat(64), providerFetch: async url => { calls++; assert(url.endsWith('/users/me')); return Response.json({ meta: { test_mode: false } }); } }));
  assert.equal(calls, 1);
});
test('SEO audits only approved URLs and sitemap submission never infers approval or ownership', async () => {
  const mock = async url => {
    if (url.endsWith('/robots.txt')) return new Response(`Sitemap: ${new URL(url).origin}/sitemap.xml`);
    if (url.endsWith('/sitemap.xml')) return new Response(sitemap([url.startsWith(FACTORY_ORIGIN) ? RESOURCE_URL : PRODUCT_ORIGIN + '/']));
    return new Response(`<title>Existing product</title><meta name="description" content="Existing useful tool"><link rel="canonical" href="${url}"><a href="${url === RESOURCE_URL ? PRODUCT_ORIGIN + '/?source=sla-checklist' : RESOURCE_URL}">Tool</a>`);
  };
  assert.equal((await auditSEO([PRODUCT_ORIGIN + '/', RESOURCE_URL], mock)).ok, true);
  assert.equal((await auditSEO([RESOURCE_URL], async url => url === RESOURCE_URL ? new Response('missing metadata') : mock(url))).ok, false);
  await assert.rejects(() => auditSEO(['https://unapproved.test/'], mock));
  assert.throws(() => sitemap([PRODUCT_ORIGIN + '/?checkout=secret']));
  let calls = 0; const fetcher = async (url, options) => { calls++; assert.match(url, /^https:\/\/www.googleapis.com\/webmasters\/v3\/sites\//); assert.equal(options.method, 'PUT'); return new Response(null, { status: 204 }); };
  const task = { url: FACTORY_ORIGIN + '/sitemap.xml' };
  assert.equal((await submitSitemap(task, 'fixture', fetcher)).submitted, false);
  task.approval = { actor: 'founder', approvedAt: '2026-10-11', url: task.url };
  assert.equal((await submitSitemap(task, 'fixture', fetcher)).submitted, false);
  task.ownershipVerified = true;
  assert.equal((await submitSitemap(task, null, fetcher)).submitted, false); assert.equal(calls, 0);
  assert.equal((await submitSitemap(task, 'fixture', fetcher)).submitted, true); assert.equal(calls, 1);
});
test('Fixed organic/referral attribution never stores arbitrary URLs or assumes US visitor identity', () => {
  const req = new Request(PRODUCT_ORIGIN + '/', { headers: { 'User-Agent': 'Mozilla/5.0', Referer: 'https://www.google.com/search?q=private+query' } });
  assert.deepEqual(traffic(req), { test: false, channel: 'organic-search' });
  assert.deepEqual(traffic(new Request(PRODUCT_ORIGIN + '/?source=shared-link', { headers: { 'User-Agent': 'Mozilla/5.0' } })), { test: false, channel: 'shared-link' });
});


test('Account connection discovers one named test product with a fixed $9 checkout override and creates a signed test-only webhook', async () => {
  let registered = 0;
  const providerFetch = async (url, options) => {
    if (url.endsWith('/users/me')) return Response.json({ meta: { test_mode: true } });
    if (url.includes('/stores?')) return Response.json({ data: [{ type: 'stores', id: '1', attributes: { currency: 'USD' } }] });
    if (url.includes('/products?')) return Response.json({ data: [{ type: 'products', id: '3', attributes: { store_id: 1, name: 'Proposal Preflight Report', test_mode: true } }] });
    if (url.includes('/variants?')) return Response.json({ data: [{ type: 'variants', id: '2', attributes: { product_id: 3, test_mode: true, is_subscription: false, price: 9999 } }] });
    if (url.includes('/webhooks?')) return Response.json({ data: [] });
    assert.equal(url, 'https://api.lemonsqueezy.com/v1/webhooks'); registered++;
    const payload = JSON.parse(options.body).data;
    assert.equal(payload.attributes.test_mode, true); assert.equal(payload.attributes.secret, secret); assert.deepEqual(payload.attributes.events, ['order_created','order_refunded']);
    return Response.json({ data: { type: 'webhooks', id: '4', attributes: { ...payload.attributes, store_id: 1 } } });
  };
  const config = await configureLemonTestAccount(env, secret, providerFetch);
  assert.equal(config.ready, true); assert.equal(config.priceCents, 900); assert.equal(config.variantListPriceCents, 9999); assert.equal(config.currency, 'USD'); assert.equal(config.oneTime, true); assert.equal(config.storeId, '1'); assert.equal(config.variantId, '2'); assert.equal(config.merchantEligibilityConfirmed, false); assert.equal(registered, 1); assert.equal(config.secret, undefined);
  const nonUSD = async (url, options) => url.includes('/stores?') ? Response.json({ data: [{ type: 'stores', id: '1', attributes: { currency: 'MAD' } }] }) : providerFetch(url, options);
  const wrongCurrency = await configureLemonTestAccount(env, secret, nonUSD); assert.equal(wrongCurrency.ready, false); assert.equal(wrongCurrency.discovery.variants[0].variantId, '2'); assert.equal(wrongCurrency.webhookConfigured, true); assert.equal(registered, 2);
  const unavailable = await configureLemonTestAccount({ ...env, LEMON_API_KEY: '' }, secret, () => assert.fail('No API call without credentials')); assert.equal(unavailable.ready, false);
  const bad = async (url, options) => url.includes('/products?') ? Response.json({ data: [{ type: 'products', id: '3', attributes: { store_id: 1, name: 'Proposal Preflight', test_mode: false } }] }) : providerFetch(url, options);
  assert.equal((await configureLemonTestAccount(env, secret, bad)).ready, false); assert.equal(registered, 2);
});

test('Uses the existing encrypted misspelled binding without overriding the standard key', () => {
  assert.equal(paymentEnvironment({ LEMON_API_KE: 'offline-alias' }).LEMON_API_KEY, 'offline-alias');
  assert.equal(paymentEnvironment({ LEMON_API_KEY: 'offline-standard', LEMON_API_KE: 'offline-alias' }).LEMON_API_KEY, 'offline-standard');
});

test('Rejects oversized signing secrets locally instead of sending provider-invalid webhook configuration', async () => {
  const result = await configureLemonTestAccount(env, 'x'.repeat(64), () => assert.fail('Invalid signing binding must not reach the provider'));
  assert.equal(result.ready, false);
});


test('Checkout override rejects a provider response with wrong price, store, variant or live mode', async () => {
  const attributes = { test_mode: true, custom_price: 900, store_id: 1, variant_id: 2, url: 'https://fixture.lemonsqueezy.com/checkout/buy/fixture' };
  for (const changed of [{ custom_price: 9999 }, { store_id: 3 }, { variant_id: 4 }, { test_mode: false }]) {
    const providerFetch = async url => {
      if (url.endsWith('/users/me')) return Response.json({ meta: { test_mode: true } });
      if (url.endsWith('/stores/1')) return Response.json({ data: { type: 'stores', id: '1', attributes: { currency: 'USD' } } });
      if (url.endsWith('/variants/2')) return Response.json({ data: { type: 'variants', id: '2', attributes: { test_mode: true, is_subscription: false } } });
      return Response.json({ data: { type: 'checkouts', attributes: { ...attributes, ...changed } } });
    };
    await assert.rejects(() => prepareLemonTestCheckout({ env, reportDigest: 'a'.repeat(64), buyerKeyHash: 'b'.repeat(64), providerFetch }), /unsupported provider response/);
  }
});
