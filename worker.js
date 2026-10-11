import { WorkerEntrypoint } from 'cloudflare:workers';
import { verifyLemonTestOrder, configureLemonTestAccount } from './payments/lemon.js';
import { httpServerHandler } from 'cloudflare:node';
import { createApp } from './server.js';
import { traffic, productEvent } from './telemetry.js';

let handler, origin, configurationKey;
export default {
  async fetch(request, env, ctx) {
    const currentOrigin = new URL(request.url).origin;
    const path = new URL(request.url).pathname;
    const eventRequest = path === '/api/events' ? request.clone() : null;
    if (env.FACTORY && request.method === 'POST' && ['/api/preview', '/api/report'].includes(path)) {
      const access = await env.FACTORY.access('proposal-preflight').catch(() => ({ allowed: true }));
      if (!access.allowed) return new Response(JSON.stringify({ error: `Experiment paused: ${access.reason}` }), { status: 410, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
    }
    const connection = env.LEMON_API_KEY && env.FACTORY ? await env.FACTORY.paymentConfiguration().catch(() => null) : null;
    const key = JSON.stringify([currentOrigin, connection?.storeId, connection?.variantId, connection?.ready]);
    if (!handler || configurationKey !== key) {
      configurationKey = key;
      origin = currentOrigin;
      const server = createApp({
        // Live payments cannot be enabled in this launch build, even through a dashboard flag.
        env: { ...env, PUBLIC_BASE_URL: currentOrigin, PAYMENT_MODE: 'test', LIVE_PAYMENTS_APPROVED: 'false', ...(connection?.ready ? { LEMON_STORE_ID: connection.storeId, LEMON_VARIANT_ID: connection.variantId } : {}) },
        paymentStore: env.FACTORY,
        clientIP: req => req.headers['cf-connecting-ip'] || req.socket.remoteAddress,
        readStatic: async file => {
          const response = await env.ASSETS.fetch(new Request(`${currentOrigin}/${file}`));
          if (!response.ok) throw new Error('Application asset unavailable.');
          return new Uint8Array(await response.arrayBuffer());
        }
      });
      handler = httpServerHandler(server);
    }
    const response = await handler.fetch(request, env, ctx);
    // Best-effort aggregate telemetry never stores documents or changes product availability.
    const measurement = traffic(request);
    if (env.FACTORY && measurement) {
      const value = eventRequest && response.ok ? await eventRequest.json().catch(() => null) : null;
      const event = productEvent(request, response, value);
      if (event) ctx.waitUntil(env.FACTORY.record({ product: 'proposal-preflight', event, ...measurement }).catch(() => {}));
    }
    return response;
  }
};

// Private scheduled reconciliation; no public payment administration route.
export class PaymentOperations extends WorkerEntrypoint {
  async configure(webhookSecret) { return configureLemonTestAccount({ ...this.env, PAYMENT_MODE: 'test' }, webhookSecret); }
  async reconcile(purchases) {
    if (!this.env.LEMON_API_KEY || this.env.PAYMENT_PROVIDER !== 'lemonsqueezy') return { connected: false, receipts: [] };
    const receipts = []; let failures = 0;
    for (const purchase of purchases.slice(0, 5)) {
      try { receipts.push({ ...await verifyLemonTestOrder({ ...this.env, PAYMENT_MODE: 'test' }, purchase), keyHash: purchase.keyHash }); }
      catch { failures++; }
    }
    return { connected: true, receipts, failures };
  }
}
