import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyze, digest, keyHash } from '../checker.js';
import { createApp } from '../server.js';

const input = { requirements: 'Provide 24/7 support\nMaintain SOC 2 Type II certification\nDescribe the incident escalation process\nProvide a 30 minute response time', proposal: 'We provide 24/7 support. We cannot claim SOC 2 Type II certification. The incident escalation process routes tickets. Our response time is 60 minutes.', buyerKey: 'a'.repeat(64) };
const env = { PUBLIC_BASE_URL: 'http://localhost:3000', STRIPE_SECRET_KEY: 'sk_test_fixture', STRIPE_PRICE_ID: 'price_fixture', APP_SECRET: 'test-secret-'.repeat(5), METRICS_TOKEN: 'fixture-metrics' };
const sessionId = 'cs_test_fixture1234567890';
function stripeMock({ paid = true, refund = false, price = 900, metadata, capture = [] } = {}) {
  return async (url, options) => {
    capture.push({ url, options });
    if (url.includes('/prices/')) return Response.json({ active: true, currency: 'usd', unit_amount: price, type: 'one_time' });
    if (url.includes('/charges?')) return Response.json({ data: [{ amount_refunded: refund ? 900 : 0, disputed: false }] });
    if (options.method === 'POST') return Response.json({ id: sessionId, url: `https://checkout.stripe.com/c/pay/${sessionId}` });
    return Response.json({ mode: 'payment', payment_status: paid ? 'paid' : 'unpaid', status: 'complete', amount_total: 900, currency: 'usd', payment_intent: 'pi_fixture', metadata: metadata || { product: 'proposal-preflight-v1', report_digest: digest(input, env.APP_SECRET), buyer_key_hash: keyHash(input.buyerKey) } });
  };
}
async function app(t, options = {}) {
  const server = createApp({ env, stripeFetch: stripeMock(), ...options });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));
  const base = `http://127.0.0.1:${server.address().port}`;
  return { base, post: (path, data = input, extra = {}) => fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json', ...extra }, body: JSON.stringify(data) }) };
}

test('Core review finds terminology, negation and a missing numeric threshold', () => {
  const result = analyze(input);
  assert.equal(result.total, 4);
  assert.equal(result.findings[0].status, 'Terms located');
  assert.equal(result.findings[1].status, 'Review possible negation');
  assert.equal(result.findings[2].status, 'Terms located');
  assert(result.findings[3].missing.includes('30'));
  assert(result.findings[3].excerpt.includes('60'));
});
test('Checks alternate wording honestly and rejects malformed/oversized inputs', () => {
  assert.equal(analyze({ requirements: 'Provide telephone assistance', proposal: 'We offer phone support.' }).findings[0].status, 'Terms not located');
  assert.equal(analyze({ requirements: 'Must provide', proposal: 'Hello' }).findings[0].status, 'Needs a clearer requirement');
  for (const value of [{}, { requirements: 'r', proposal: '' }, { requirements: Array(31).fill('Support').join('\n'), proposal: 'Support' }, { requirements: 'x'.repeat(601), proposal: 'x' }, { requirements: 'test', proposal: 'x'.repeat(180001) }]) assert.throws(() => analyze(value));
});
test('Fingerprints bind both text inputs without embedding contents', () => {
  assert.notEqual(digest(input, env.APP_SECRET), digest({ ...input, proposal: 'different' }, env.APP_SECRET));
  assert.notEqual(digest(input, env.APP_SECRET), digest({ ...input, requirements: 'different' }, env.APP_SECRET));
  assert.equal(digest(input, env.APP_SECRET).length, 64);
});
test('Preview reveals only three findings and no full-report summary', async t => {
  const { post } = await app(t);
  const r = await post('/api/preview'); const value = await r.json();
  assert.equal(r.status, 200); assert.equal(value.total, 4); assert.equal(value.findings.length, 3); assert.equal(value.summary, undefined);
});
test('Hosted checkout uses server-fixed price and non-document metadata', async t => {
  const capture = []; const { post } = await app(t, { stripeFetch: stripeMock({ capture }) });
  const r = await post('/api/checkout'); assert.equal(r.status, 200);
  const params = new URLSearchParams(capture.find(x => x.options.method === 'POST').options.body);
  assert.equal(params.get('line_items[0][price]'), env.STRIPE_PRICE_ID);
  assert.equal(params.get('mode'), 'payment');
  assert.equal(params.get('metadata[report_digest]'), digest(input, env.APP_SECRET));
  assert(!params.toString().includes('certification'));
  assert.equal(params.get('success_url'), 'http://localhost:3000/?checkout={CHECKOUT_SESSION_ID}');
});
test('Verified payment delivers all report rows', async t => {
  const { post } = await app(t); const r = await post('/api/report', { ...input, sessionId });
  assert.equal(r.status, 200); assert.equal((await r.json()).findings.length, 4);
});
test('Unpaid, refunded, wrong price, altered text or stolen receipt cannot unlock report', async t => {
  for (const options of [{ paid: false }, { refund: true }, { metadata: { product: 'other' } }]) {
    const { post } = await app(t, { stripeFetch: stripeMock(options) });
    assert.equal((await post('/api/report', { ...input, sessionId })).status, 403);
  }
  const { post } = await app(t);
  assert.equal((await post('/api/report', { ...input, proposal: 'altered', sessionId })).status, 403);
  assert.equal((await post('/api/report', { ...input, buyerKey: 'b'.repeat(64), sessionId })).status, 403);
  const wrong = await app(t, { stripeFetch: stripeMock({ price: 100 }) });
  assert.equal((await wrong.post('/api/checkout')).status, 503);
});
test('Unconfigured payments stay disabled, but preview works', async t => {
  const { base, post } = await app(t, { env: {} });
  assert.equal((await (await fetch(base + '/api/config')).json()).paymentsAvailable, false);
  assert.equal((await post('/api/preview')).status, 200);
  assert.equal((await post('/api/checkout')).status, 503);
});
test('Cross-origin requests, invalid media, traversal and public metrics are blocked', async t => {
  const { base, post } = await app(t);
  assert.equal((await post('/api/preview', input, { Origin: 'https://evil.example' })).status, 403);
  assert.equal((await post('/api/preview', input, { 'Content-Type': 'text/plain' })).status, 415);
  assert.equal((await fetch(base + '/.env')).status, 404);
  assert.equal((await fetch(base + '/api/metrics')).status, 404);
  const metrics = await fetch(base + '/api/metrics', { headers: { Authorization: 'Bearer fixture-metrics' } }); assert.equal(metrics.status, 200);
  const page = await fetch(base + '/'); assert.equal(page.status, 200);
  assert(page.headers.get('content-security-policy').includes("frame-ancestors 'none'"));
  assert.equal(page.headers.get('referrer-policy'), 'no-referrer');
});
test('Rate limit does not trust spoofed forwarding headers by default', async t => {
  const { post } = await app(t);
  for (let i = 0; i < 30; i++) assert.equal((await post('/api/preview', input, { 'X-Forwarded-For': `10.0.0.${i}` })).status, 200);
  assert.equal((await post('/api/preview', input, { 'X-Forwarded-For': 'other' })).status, 429);
});
test('Provider outages return an actionable safe error', async t => {
  const { post } = await app(t, { stripeFetch: async () => new Response('{}', { status: 500 }) });
  const r = await post('/api/checkout'); assert.equal(r.status, 502);
  assert(!(await r.text()).includes('sk_test'));
});
test('Oversized JSON is rejected before analysis or provider calls', async t => {
  const { post } = await app(t);
  assert.equal((await post('/api/preview', { ...input, proposal: 'x'.repeat(260000) })).status, 413);
});
