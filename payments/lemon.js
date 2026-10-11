// Prepared against official @lemonsqueezy/lemonsqueezy.js 4.0.0 NewCheckout contract.
// Not connected to public checkout. Morocco bank-payout support and published fees are verified; actual operator/store/product approval remains pending.
// Deliberately incapable of creating a live checkout; activation needs separate approved work.
export async function prepareLemonTestCheckout({ env, reportDigest, buyerKeyHash, providerFetch = fetch, now = Date.now() }) {
  if (env.PAYMENT_MODE !== 'test' || env.LEMON_TEST_INTEGRATION_APPROVED !== 'true') throw new Error('Only explicitly configured test checkout preparation is allowed.');
  if (!env.LEMON_API_KEY || !/^[1-9]\d*$/.test(env.LEMON_STORE_ID || '') || !/^[1-9]\d*$/.test(env.LEMON_VARIANT_ID || '')) throw new Error('Test provider account is not connected.');
  if (![reportDigest, buyerKeyHash].every(x => /^[a-f0-9]{64}$/.test(x || ''))) throw new Error('Opaque report and browser bindings required.');
  const base = new URL(env.PUBLIC_BASE_URL);
  if (base.protocol !== 'https:' || base.username || base.password || base.pathname !== '/' || base.search || base.hash) throw new Error('HTTPS application origin required.');
  const auth = { Authorization: `Bearer ${env.LEMON_API_KEY}`, Accept: 'application/vnd.api+json' };
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
    product_options: { enabled_variants: [Number(env.LEMON_VARIANT_ID)], redirect_url: `${base.origin}/?lemon_test=return` },
    checkout_options: { embed: false, discount: false },
    checkout_data: { custom: { product: 'proposal-preflight-v1', report_digest: reportDigest, buyer_key_hash: buyerKeyHash } },
    expires_at: new Date(now + 1800000).toISOString()
  }, relationships: { store: { data: { type: 'stores', id: env.LEMON_STORE_ID } }, variant: { data: { type: 'variants', id: env.LEMON_VARIANT_ID } } } } };
  const response = await providerFetch('https://api.lemonsqueezy.com/v1/checkouts', {
    method: 'POST', headers: { ...auth, 'Content-Type': 'application/vnd.api+json' },
    body: JSON.stringify(payload), signal: AbortSignal.timeout(15000)
  });
  if (!response.ok) throw new Error('Test provider unavailable.');
  const result = await response.json(), attributes = result.data?.attributes;
  if (result.data?.type !== 'checkouts' || attributes?.test_mode !== true) throw new Error('Non-test or unsupported provider response rejected.');
  const url = new URL(attributes.url);
  if (url.protocol !== 'https:' || url.username || url.password || !/^[a-z0-9-]+\.lemonsqueezy\.com$/.test(url.hostname) || !url.pathname.startsWith('/checkout/')) throw new Error('Unexpected checkout origin.');
  return { url: url.href, testOnly: true, deliveryConnected: false };
}
