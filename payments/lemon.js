// Prepared against official @lemonsqueezy/lemonsqueezy.js 4.0.0 NewCheckout contract.
// Test-only automated checkout and verification. Actual operator/store/product approval remains pending.
// Deliberately incapable of creating a live checkout; activation needs separate approved work.
export async function prepareLemonTestCheckout({ env, reportDigest, buyerKeyHash, checkoutToken = crypto.randomUUID().replaceAll('-', '') + crypto.randomUUID().replaceAll('-', ''), channel = 'direct', providerFetch = fetch, now = Date.now() }) {
  if (env.PAYMENT_MODE !== 'test' || env.LEMON_TEST_INTEGRATION_APPROVED !== 'true') throw new Error('Only explicitly configured test checkout preparation is allowed.');
  if (!env.LEMON_API_KEY || !/^[1-9]\d*$/.test(env.LEMON_STORE_ID || '') || !/^[1-9]\d*$/.test(env.LEMON_VARIANT_ID || '')) throw new Error('Test provider account is not connected.');
  if (![reportDigest, buyerKeyHash].every(x => /^[a-f0-9]{64}$/.test(x || ''))) throw new Error('Opaque report and browser bindings required.');
  if (!/^[a-f0-9]{64}$/.test(checkoutToken)) throw new Error('Invalid checkout binding.');
  const base = new URL(env.PUBLIC_BASE_URL);
  if (base.protocol !== 'https:' || base.username || base.password || base.pathname !== '/' || base.search || base.hash) throw new Error('HTTPS application origin required.');
  const auth = { Authorization: `Bearer ${env.LEMON_API_KEY}`, Accept: 'application/vnd.api+json' };
  await requireTestKey(env, providerFetch);
  const storeResponse = await providerFetch(`https://api.lemonsqueezy.com/v1/stores/${env.LEMON_STORE_ID}`, { headers: auth, signal: AbortSignal.timeout(15000) });
  if (!storeResponse.ok) throw new Error('Test store unavailable.');
  const store = (await storeResponse.json()).data;
  if (store?.type !== 'stores' || store.id !== env.LEMON_STORE_ID || store.attributes?.currency !== 'USD') throw new Error('USD store binding required.');
  const variantResponse = await providerFetch(`https://api.lemonsqueezy.com/v1/variants/${env.LEMON_VARIANT_ID}`, { headers: auth, signal: AbortSignal.timeout(15000) });
  if (!variantResponse.ok) throw new Error('Test variant unavailable.');
  const variant = (await variantResponse.json()).data;
  if (variant?.type !== 'variants' || variant.id !== env.LEMON_VARIANT_ID || variant.attributes?.test_mode !== true || variant.attributes?.is_subscription !== false) throw new Error('One-time test variant required.');
  const payload = { data: { type: 'checkouts', attributes: {
    test_mode: true, custom_price: 900,
    product_options: { enabled_variants: [Number(env.LEMON_VARIANT_ID)], redirect_url: `${base.origin}/?checkout=ls_test_${checkoutToken}${channel !== 'direct' ? '&source=' + encodeURIComponent(channel) : ''}` },
    checkout_options: { embed: false, discount: false },
    checkout_data: { custom: { product: 'proposal-preflight-v1', report_digest: reportDigest, buyer_key_hash: buyerKeyHash, checkout_key_hash: await sha256(checkoutToken) } },
    expires_at: new Date(now + 1800000).toISOString()
  }, relationships: { store: { data: { type: 'stores', id: env.LEMON_STORE_ID } }, variant: { data: { type: 'variants', id: env.LEMON_VARIANT_ID } } } } };
  const response = await providerFetch('https://api.lemonsqueezy.com/v1/checkouts', {
    method: 'POST', headers: { ...auth, 'Content-Type': 'application/vnd.api+json' },
    body: JSON.stringify(payload), signal: AbortSignal.timeout(15000)
  });
  if (!response.ok) throw new Error('Test provider unavailable.');
  const result = await response.json(), attributes = result.data?.attributes;
  if (result.data?.type !== 'checkouts' || attributes?.test_mode !== true || attributes?.custom_price !== 900 || String(attributes?.store_id) !== env.LEMON_STORE_ID || String(attributes?.variant_id) !== env.LEMON_VARIANT_ID) throw new Error('Non-test or unsupported provider response rejected.');
  const url = new URL(attributes.url);
  if (url.protocol !== 'https:' || url.username || url.password || !/^[a-z0-9-]+\.lemonsqueezy\.com$/.test(url.hostname) || !url.pathname.startsWith('/checkout/')) throw new Error('Unexpected checkout origin.');
  return { url: url.href, sessionId: `ls_test_${checkoutToken}`, testOnly: true };
}

export async function sha256(value) {
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)))].map(x => x.toString(16).padStart(2, '0')).join('');
}
export async function lemonRequest(env, path, providerFetch = fetch, body, method = body ? 'POST' : 'GET') {
  const response = await providerFetch('https://api.lemonsqueezy.com/v1/' + path, { method,
    headers: { Authorization: `Bearer ${env.LEMON_API_KEY}`, Accept: 'application/vnd.api+json', ...(body ? { 'Content-Type': 'application/vnd.api+json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(15000) });
  if (!response.ok) { const e = new Error('Test payment provider rejected the request.'); e.status = 502; e.providerStatus = response.status; e.operation = method + ' ' + path.split('?')[0]; const detail = await response.json().catch(() => ({})); e.validationFields = (detail.errors || []).map(v => v.source?.pointer).filter(v => typeof v === 'string' && /^\/data\/(attributes|relationships)\/[a-z_/-]{1,100}$/.test(v)); throw e; }
  return response.json();
}
export async function requireTestKey(env, providerFetch = fetch) {
  if (!env.LEMON_API_KEY || env.PAYMENT_MODE !== 'test') throw new Error('Only a connected test provider is allowed.');
  const user = await lemonRequest(env, 'users/me', providerFetch);
  if (user.meta?.test_mode !== true) throw new Error('A test-mode API key is required. Live account access is rejected.');
}
export function testOrder(data, expected = {}, now = Date.now()) {
  const a = data?.attributes, item = a?.first_order_item;
  if (data?.type !== 'orders' || !/^[1-9]\d{0,19}$/.test(String(data.id || '')) || a?.test_mode !== true || item?.test_mode !== true) throw new Error('Only test orders accepted.');
  if (a.currency !== 'USD' || a.subtotal !== 900 || a.discount_total !== 0 || a.setup_fee !== 0 || item.price !== 900 || String(item.order_id) !== String(data.id) || !Number.isSafeInteger(a.tax) || !Number.isSafeInteger(a.total) || a.tax < 0 || a.total !== 900 + a.tax) throw new Error('Order price, currency or quantity is unsupported.');
  const refunded = a.refunded_amount;
  if (!Number.isSafeInteger(refunded) || refunded < 0 || refunded > a.total || !['paid','refunded','partial_refund','fraudulent','pending','failed'].includes(a.status)) throw new Error('Unsupported order state.');
  const updated = Date.parse(a.updated_at);
  if (!Number.isFinite(updated) || updated > now + 300000) throw new Error('Invalid order timestamp.');
  for (const [field, actual] of [['orderId', data.id], ['storeId', a.store_id], ['variantId', item.variant_id]]) if (expected[field] && String(expected[field]) !== String(actual)) throw new Error('Order does not match this purchase.');
  const state = refunded > 0 || a.refunded === true || ['refunded','partial_refund','fraudulent'].includes(a.status) ? 'revoked' : a.status === 'paid' ? 'paid' : 'pending';
  let receiptUrl = null;
  try { const url = new URL(a.urls?.receipt); if (url.protocol === 'https:' && url.hostname === 'app.lemonsqueezy.com' && url.pathname.startsWith('/my-orders/') && !url.username && !url.password) receiptUrl = url.href; } catch {}
  return { orderId: String(data.id), storeId: String(a.store_id), variantId: String(item.variant_id), state, subtotalCents: 900, totalCents: a.total, refundedCents: refunded, updatedAt: a.updated_at, verifiedAt: new Date(now).toISOString(), test: true, receiptUrl };
}
export async function verifyLemonTestWebhook(raw, signature, secret, now = Date.now()) {
  if (!secret || secret.length < 32 || raw.length > 40000 || !/^[a-f0-9]{64}$/i.test(signature || '')) throw new Error('Webhook verification unavailable.');
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
  if (!await crypto.subtle.verify('HMAC', key, Uint8Array.from(signature.match(/../g), h => parseInt(h, 16)), new TextEncoder().encode(raw))) throw new Error('Invalid webhook signature.');
  const event = JSON.parse(raw), meta = event.meta?.custom_data;
  if (!['order_created','order_refunded'].includes(event.meta?.event_name) || meta?.product !== 'proposal-preflight-v1' || ![meta.checkout_key_hash, meta.report_digest, meta.buyer_key_hash].every(v => /^[a-f0-9]{64}$/.test(v || ''))) throw new Error('Unsupported webhook metadata.');
  const receipt = testOrder(event.data, {}, now);
  if (event.meta.event_name === 'order_refunded') receipt.state = 'revoked';
  return { ...receipt, keyHash: meta.checkout_key_hash, reportDigest: meta.report_digest, buyerHash: meta.buyer_key_hash };
}
export async function verifyLemonTestOrder(env, purchase, providerFetch = fetch) {
  await requireTestKey(env, providerFetch);
  if (!/^[1-9]\d{0,19}$/.test(purchase.orderId || '')) throw new Error('Invalid test order.');
  return testOrder((await lemonRequest(env, `orders/${purchase.orderId}`, providerFetch)).data, purchase);
}
export function reducePurchase(purchase, receipt) {
  if (!purchase || purchase.test !== true || receipt.test !== true || ['storeId','variantId','reportDigest','buyerHash'].some(k => receipt[k] !== undefined && String(receipt[k]) !== String(purchase[k])) || (purchase.orderId && purchase.orderId !== receipt.orderId)) throw new Error('Unbound payment receipt.');
  // Refund/revocation is terminal. Replayed created events can never restore access.
  const stale = purchase.updatedAt && Date.parse(receipt.updatedAt) < Date.parse(purchase.updatedAt);
  if (stale && receipt.state !== 'revoked') return purchase;
  return { ...purchase, orderId: receipt.orderId, state: purchase.state === 'revoked' ? 'revoked' : receipt.state,
    subtotalCents: receipt.subtotalCents, totalCents: receipt.totalCents, refundedCents: Math.max(purchase.refundedCents || 0, receipt.refundedCents), updatedAt: receipt.updatedAt, verifiedAt: receipt.verifiedAt, test: true };
}
export function paymentTotals(purchases) {
  const orders = purchases.filter(p => p.test === true && p.orderId);
  return { testOrderCount: orders.length, testPaidOrderCount: orders.filter(p => p.state === 'paid').length,
    testRevokedOrderCount: orders.filter(p => p.state === 'revoked').length, testSubtotalCents: orders.reduce((n,p) => n + p.subtotalCents, 0),
    testRefundedCents: orders.reduce((n,p) => n + p.refundedCents, 0), verifiedLivePaymentCount: 0, verifiedLiveRevenueCents: 0,
    limitation: 'All stored Lemon orders are test-only. Test amounts and refunds are not revenue, costs or cash movements.' };
}

// Connect only an existing operator-owned TEST store/product. Never creates a product,
// activates a merchant, changes pricing, charges/refunds money, or touches live webhooks.
export async function configureLemonTestAccount(env, webhookSecret, providerFetch = fetch) {
  if (!env.LEMON_API_KEY) return { ready: false, reason: 'Operator-owned test API connection required.' };
  if (!env.APP_SECRET || env.APP_SECRET.length < 32 || !webhookSecret || webhookSecret.length !== 32) return { ready: false, reason: 'Secure application bindings unavailable.' };
  await requireTestKey({ ...env, PAYMENT_MODE: 'test' }, providerFetch);
  const stores = await lemonRequest(env, 'stores?page[size]=100', providerFetch);
  const products = await lemonRequest(env, 'products?page[size]=100', providerFetch);
  // Never silently choose one business out of an ambiguous portfolio.
  const intended = p => ['proposal preflight','proposal preflight report'].includes(String(p.attributes?.name || '').trim().toLowerCase());
  const discovery = { testApiKeyVerified: true, stores: (stores.data || []).map(s => ({ storeId: s.id, currency: s.attributes?.currency ?? null })), testProducts: (products.data || []).filter(p => p.attributes?.test_mode === true).map(p => ({ productId: p.id, storeId: String(p.attributes.store_id), name: String(p.attributes.name).slice(0, 80), priceCents: p.attributes.price })), usdStoreCount: (stores.data || []).filter(s => s.attributes?.currency === 'USD').length, testProductCount: (products.data || []).filter(p => p.attributes?.test_mode === true).length, namedTestProductCount: (products.data || []).filter(p => p.attributes?.test_mode === true && intended(p)).length };
  const eligible = (products.data || []).filter(p => p.type === 'products' && p.attributes?.test_mode === true && intended(p));
  if (eligible.length !== 1 || products.links?.next) return { ready: false, reason: 'Exactly one intended Proposal Preflight test product is required.', discovery };
  const product = eligible[0], storeId = String(product.attributes.store_id);
  const boundStore = (stores.data || []).find(s => s.id === storeId);
  const variants = await lemonRequest(env, `variants?filter[product_id]=${encodeURIComponent(product.id)}&page[size]=100`, providerFetch);
  discovery.variants = (variants.data || []).filter(v => String(v.attributes?.product_id) === product.id && v.attributes?.test_mode === true).map(v => ({ variantId: v.id, priceCents: v.attributes.price, isSubscription: v.attributes.is_subscription }));
  const available = (variants.data || []).filter(v => v.type === 'variants' && String(v.attributes?.product_id) === product.id && v.attributes?.test_mode === true && v.attributes?.is_subscription === false);
  if (!boundStore || available.length !== 1 || variants.links?.next) return { ready: false, storeId, productId: product.id, reason: 'Exactly one intended one-time test variant and its store are required. No checkout activated.', discovery };
  const priceReady = boundStore.attributes?.currency === 'USD' && Number.isSafeInteger(available[0].attributes.price) && available[0].attributes.price >= 0 && product.attributes.pay_what_you_want !== true;
  const url = 'https://business-factory.preflight-f1224675ed.workers.dev/api/payments/lemon-test';
  const webhooks = await lemonRequest(env, `webhooks?filter[store_id]=${storeId}&page[size]=100`, providerFetch);
  const existing = (webhooks.data || []).filter(w => w.type === 'webhooks' && w.attributes?.url === url && w.attributes?.test_mode === true && String(w.attributes?.store_id) === storeId);
  if (existing.length > 1 || webhooks.links?.next) return { ready: false, reason: 'Ambiguous test webhook configuration; no changes made.' };
  const attributes = { url, events: ['order_created','order_refunded'], secret: webhookSecret, ...(!existing.length ? { test_mode: true } : {}) };
  const payload = { data: { type: 'webhooks', ...(existing.length ? { id: existing[0].id } : {}), attributes, relationships: { store: { data: { type: 'stores', id: storeId } } } } };
  const result = await lemonRequest(env, existing.length ? `webhooks/${existing[0].id}` : 'webhooks', providerFetch, payload, existing.length ? 'PATCH' : 'POST');
  if (result.data?.type !== 'webhooks' || result.data.attributes?.test_mode !== true || result.data.attributes?.url !== url || String(result.data.attributes?.store_id) !== storeId) throw new Error('Test webhook registration could not be verified.');
  return { ready: priceReady, webhookConfigured: true, storeId, productId: product.id, currency: boundStore.attributes.currency, priceCents: 900, variantListPriceCents: available[0].attributes.price, checkoutPriceSource: 'server-fixed-test-checkout-override', oneTime: true, ...(!priceReady ? { reason: 'Test webhook configured. Correct the intended store/product to $9 USD in the dashboard; checkout remains disabled.', discovery } : {}), variantId: available[0].id, webhookId: result.data.id, testOnly: true, merchantEligibilityConfirmed: false, connectedAt: new Date().toISOString() };
}

// Compatibility with the existing encrypted Cloudflare binding; never expose or persist its value.
export const paymentEnvironment = env => ({ ...env, LEMON_API_KEY: env.LEMON_API_KEY || env.LEMON_API_KE });
