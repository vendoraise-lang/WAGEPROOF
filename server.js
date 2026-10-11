import http from 'node:http';
import { randomBytes } from 'node:crypto';
import { prepareLemonTestCheckout, sha256, verifyLemonTestOrder } from './payments/lemon.js';
import { productSitemap, robots } from './seo.js';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { analyze, digest, keyHash, validate } from './checker.js';

const ROOT = typeof import.meta.url === 'string' && import.meta.url.startsWith('file:') ? fileURLToPath(new URL('./public/', import.meta.url)) : '';
const BODY_LIMIT = 256000;
const FILES = { '/': ['index.html', 'text/html; charset=utf-8'], '/app.js': ['app.js', 'text/javascript; charset=utf-8'], '/style.css': ['style.css', 'text/css; charset=utf-8'], '/legal': ['legal.html', 'text/html; charset=utf-8'] };
const SECURITY = {
  'Content-Security-Policy': "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
  'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()', 'Cache-Control': 'no-store'
};

export function createApp({ env = process.env, stripeFetch = fetch, lemonFetch = fetch, paymentStore, clock = Date.now, readStatic, clientIP } = {}) {
  const counters = { previews: 0, checkouts: 0, reports: 0, errors: 0 };
  const buckets = new Map();
  let priceChecked = 0;
  const base = (env.PUBLIC_BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
  const paymentMode = env.PAYMENT_MODE || 'test';
  const lemon = env.PAYMENT_PROVIDER === 'lemonsqueezy';
  const lemonReady = lemon && paymentMode === 'test' && env.LEMON_TEST_INTEGRATION_APPROVED === 'true' && !!(env.LEMON_API_KEY && env.LEMON_STORE_ID && env.LEMON_VARIANT_ID && env.APP_SECRET?.length >= 32 && paymentStore);
  const freeBeta = env.FREE_BETA === 'true' && paymentMode === 'test' && !lemonReady;
  const ready = lemon ? lemonReady : !!(env.STRIPE_SECRET_KEY && env.STRIPE_PRICE_ID && env.APP_SECRET?.length >= 32 && env.PUBLIC_BASE_URL && paymentMode === 'test');
  const production = base.startsWith('https://');
  const headers = { ...SECURITY, ...(production ? { 'Strict-Transport-Security': 'max-age=31536000' } : {}) };
  const reply = (res, status, value) => { res.writeHead(status, { ...headers, 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(value)); };
  async function stripe(path, body) {
    const response = await stripeFetch(`https://api.stripe.com/v1/${path}`, {
      method: body ? 'POST' : 'GET', signal: AbortSignal.timeout(15000),
      headers: { Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`, ...(body ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}) },
      ...(body ? { body: new URLSearchParams(body) } : {})
    });
    if (!response.ok) { const e = new Error('Payment provider is unavailable. Try again later.'); e.status = 502; throw e; }
    return response.json();
  }
  async function body(req) {
    if (!/^application\/json(?:;|$)/i.test(req.headers['content-type'] || '')) { const e = new Error('Send JSON only.'); e.status = 415; throw e; }
    if (Number(req.headers['content-length'] || 0) > BODY_LIMIT) { const e = new Error('Request exceeds 256 KB.'); e.status = 413; throw e; }
    let size = 0, chunks = [];
    for await (const chunk of req) {
      size += chunk.length;
      if (size > BODY_LIMIT) { const e = new Error('Request exceeds 256 KB.'); e.status = 413; throw e; }
      chunks.push(chunk);
    }
    try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
    catch { throw new Error('Invalid JSON.'); }
  }
  function rate(req, route) {
    const forwarded = env.TRUST_PROXY === 'true' ? req.headers['x-forwarded-for']?.split(',').at(-1).trim() : '';
    const ip = clientIP ? clientIP(req) : forwarded || req.socket.remoteAddress;
    const key = `${ip}:${route}`;
    const now = clock();
    for (const [k, v] of buckets) if (now - v.since > 600000) buckets.delete(k);
    if (!buckets.has(key)) {
      if (buckets.size >= 10000) return false;
      buckets.set(key, { since: now, count: 0 });
    }
    const item = buckets.get(key); item.count++;
    return item.count <= (route === '/api/checkout' ? 5 : 30);
  }
  return http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, base);
      if (req.method === 'GET' && url.pathname === '/health') return reply(res, 200, { ok: true });
      if (req.method === 'GET' && url.pathname === '/api/config') return reply(res, 200, { paymentsAvailable: ready, paymentMode, livePaymentsEnabled: false, paymentProvider: lemon ? 'lemonsqueezy' : 'stripe', freeBeta, priceUSD: 9, previewRows: 3 });
      if (req.method === 'GET' && url.pathname === '/api/metrics') {
        if (!env.METRICS_TOKEN || req.headers.authorization !== `Bearer ${env.METRICS_TOKEN}`) return reply(res, 404, { error: 'Not found.' });
        return reply(res, 200, counters);
      }
      if (req.method === 'GET' && ['/robots.txt', '/sitemap.xml'].includes(url.pathname)) {
        res.writeHead(200, { ...headers, 'Content-Type': url.pathname === '/robots.txt' ? 'text/plain; charset=utf-8' : 'application/xml; charset=utf-8' });
        return res.end(url.pathname === '/robots.txt' ? robots(base) : productSitemap(base));
      }
      if (req.method === 'GET' && FILES[url.pathname]) {
        const [file, type] = FILES[url.pathname];
        let content = readStatic ? await readStatic(file) : await readFile(ROOT + file);
        if (file === 'index.html') content = Buffer.from(content).toString().replace('<!-- CANONICAL -->', `<link rel="canonical" href="${base}/">`);
        res.writeHead(200, { ...headers, ...(url.searchParams.has('checkout') || file === 'legal.html' ? { 'X-Robots-Tag': 'noindex' } : {}), 'Content-Type': type }); return res.end(content);
      }
      if (req.method !== 'POST' || !['/api/preview', '/api/checkout', '/api/report', '/api/events'].includes(url.pathname)) return reply(res, 404, { error: 'Not found.' });
      if (req.headers.origin && req.headers.origin !== base) return reply(res, 403, { error: 'Origin not permitted.' });
      if (!rate(req, url.pathname)) { res.setHeader('Retry-After', '600'); return reply(res, 429, { error: 'Usage limit reached. Please wait ten minutes.' }); }
      const input = await body(req);
      if (url.pathname === '/api/events') {
        if (!['download', 'support', 'intent'].includes(input?.event) || Object.keys(input).length !== 1) return reply(res, 400, { error: 'Invalid aggregate event.' });
        return reply(res, 200, { ok: true });
      }
      validate(input);
      if (url.pathname === '/api/preview') {
        const report = analyze(input); counters.previews++;
        return reply(res, 200, freeBeta ? { ...report, freeBeta: true } : { total: report.total, findings: report.findings.slice(0, 3), limitation: report.limitation });
      }
      if (!ready) return reply(res, 503, { error: 'Checkout is not activated yet. The free preview is available.' });
      if (!/^[a-f0-9]{64}$/.test(input.buyerKey || '')) throw new Error('Browser checkout key is missing. Run the preview again.');
      const fingerprint = digest(input, env.APP_SECRET);
      if (lemon) {
        if (url.pathname === '/api/checkout') {
          const token = randomBytes(32).toString('hex');
          const channel = ['sla-checklist','organic-search','shared-link'].includes(url.searchParams.get('source')) ? url.searchParams.get('source') : 'direct';
          await paymentStore.reserveTestPurchase({ keyHash: await sha256(token), reportDigest: fingerprint, buyerHash: keyHash(input.buyerKey), storeId: env.LEMON_STORE_ID, variantId: env.LEMON_VARIANT_ID, channel, test: true });
          const checkout = await prepareLemonTestCheckout({ env, reportDigest: fingerprint, buyerKeyHash: keyHash(input.buyerKey), checkoutToken: token, channel, providerFetch: lemonFetch, now: clock() });
          counters.checkouts++; return reply(res, 200, checkout);
        }
        if (!/^ls_test_[a-f0-9]{64}$/.test(input.sessionId || '')) throw new Error('Invalid test checkout reference.');
        const purchase = await paymentStore.lookupTestPurchase(await sha256(input.sessionId.slice(8)), keyHash(input.buyerKey), fingerprint);
        if (!purchase) return reply(res, 403, { error: 'Checkout does not match this browser and draft.' });
        if (purchase.state === 'revoked') return reply(res, 403, { error: 'This test order has been refunded or revoked.' });
        if (!purchase.orderId) return reply(res, 409, { error: 'Awaiting verified payment notification. Retry verification in this tab shortly.' });
        const receipt = await verifyLemonTestOrder(env, purchase, lemonFetch);
        const verified = await paymentStore.applyTestOrder({ ...receipt, keyHash: purchase.keyHash });
        if (verified.state !== 'paid') return reply(res, 403, { error: 'No matching paid test order, or access has been revoked.' });
        counters.reports++; return reply(res, 200, { ...analyze(input), testPayment: true, receiptUrl: receipt.receiptUrl });
      }
      if (url.pathname === '/api/checkout') {
        if (clock() - priceChecked > 300000 || !priceChecked) {
          const price = await stripe(`prices/${encodeURIComponent(env.STRIPE_PRICE_ID)}`);
          if (!price.active || price.currency !== 'usd' || price.unit_amount !== 900 || price.type !== 'one_time' || price.livemode !== (paymentMode === 'live')) return reply(res, 503, { error: 'Checkout price or payment-mode configuration needs attention.' });
          priceChecked = clock();
        }
        const session = await stripe('checkout/sessions', {
          mode: 'payment', 'payment_method_types[0]': 'card', 'line_items[0][price]': env.STRIPE_PRICE_ID, 'line_items[0][quantity]': '1',
          success_url: `${base}/?checkout={CHECKOUT_SESSION_ID}`, cancel_url: `${base}/?cancelled=1`,
          'metadata[report_digest]': fingerprint, 'metadata[buyer_key_hash]': keyHash(input.buyerKey),
          'metadata[product]': 'proposal-preflight-v1', expires_at: String(Math.floor(clock() / 1000) + 1800)
        });
        if (!session.url?.startsWith('https://checkout.stripe.com/')) return reply(res, 502, { error: 'Unexpected checkout response.' });
        counters.checkouts++; return reply(res, 200, { url: session.url });
      }
      if (!/^cs_(?:test_|live_)?[A-Za-z0-9_]{10,240}$/.test(input.sessionId || '')) throw new Error('Invalid checkout reference.');
      const session = await stripe(`checkout/sessions/${encodeURIComponent(input.sessionId)}`);
      if (session.livemode !== (paymentMode === 'live') || session.mode !== 'payment' || session.payment_status !== 'paid' || session.status !== 'complete' || session.amount_total !== 900 || session.currency !== 'usd' || session.metadata?.product !== 'proposal-preflight-v1' || session.metadata.report_digest !== fingerprint || session.metadata.buyer_key_hash !== keyHash(input.buyerKey)) return reply(res, 403, { error: 'No matching completed payment. Retry after payment completes, using the original text and browser.' });
      // Check refunds before each download; a refunded checkout must not unlock new reports.
      if (session.payment_intent) {
        const charges = await stripe(`charges?payment_intent=${encodeURIComponent(session.payment_intent)}&limit=1`);
        if (!charges.data?.length || charges.data[0].amount_refunded > 0 || charges.data[0].disputed) return reply(res, 403, { error: 'This payment has been refunded or disputed.' });
      } else return reply(res, 403, { error: 'Payment receipt is incomplete.' });
      counters.reports++; return reply(res, 200, analyze(input));
    } catch (error) {
      counters.errors++;
      // Never log input, excerpts, keys, provider responses or checkout references.
      const status = error.status || (error.name === 'TimeoutError' ? 502 : 400);
      if (status >= 500) console.error(JSON.stringify({ event: 'request_failure', status }));
      return reply(res, status, { error: status === 502 ? 'Payment verification is temporarily unavailable. Your checkout can be retried.' : error.message });
    }
  });
}

if (typeof import.meta.url === 'string' && import.meta.url.startsWith('file:') && process.argv[1] === fileURLToPath(import.meta.url)) {
  const server = createApp();
  server.requestTimeout = 20000;
  server.headersTimeout = 15000;
  server.listen(Number(process.env.PORT || 3000), '0.0.0.0', () => console.log('Proposal Preflight server started.'));
}
