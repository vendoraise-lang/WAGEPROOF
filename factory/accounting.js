// Optional test-mode receipt adapter. Live receipts are rejected until a separately approved implementation.
export async function verifyTestReceipt(raw, signature, secret, products, now = Date.now()) {
  if (!secret || secret.length < 32 || raw.length > 40000) throw new Error('Receipt verification unavailable');
  const fields = (signature || '').split(',').map(p => p.split('='));
  const timestamp = Number(fields.find(([k]) => k === 't')?.[1]);
  if (!Number.isSafeInteger(timestamp) || Math.abs(now / 1000 - timestamp) > 300) throw new Error('Expired signature');
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
  const payload = new TextEncoder().encode(`${timestamp}.${raw}`);
  let valid = false;
  for (const [name, value] of fields) if (name === 'v1' && /^[a-f0-9]{64}$/i.test(value || '')) {
    const bytes = Uint8Array.from(value.match(/../g), h => parseInt(h, 16));
    if (await crypto.subtle.verify('HMAC', key, bytes, payload)) valid = true;
  }
  if (!valid) throw new Error('Invalid signature');
  const event = JSON.parse(raw), session = event.data?.object;
  if (event.livemode !== false || event.type !== 'checkout.session.completed') throw new Error('Only test checkout receipts accepted');
  const product = products.find(p => `${p.id}-v1` === session?.metadata?.product);
  if (!product || session.payment_status !== 'paid' || session.amount_total !== 900 || session.currency !== 'usd' || !/^cs_test_[\w]{1,160}$/.test(session.id || '')) throw new Error('Receipt does not match this experiment');
  return { id: session.id, product: product.id, mode: 'test', amountCents: session.amount_total, currency: 'USD', provider: 'stripe', verifiedAt: new Date(now).toISOString() };
}
