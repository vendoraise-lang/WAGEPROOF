import { httpServerHandler } from 'cloudflare:node';
import { createApp } from './server.js';

let handler, origin;
export default {
  async fetch(request, env, ctx) {
    const currentOrigin = new URL(request.url).origin;
    const path = new URL(request.url).pathname;
    const eventRequest = path === '/api/events' ? request.clone() : null;
    if (env.FACTORY && request.method === 'POST' && ['/api/preview', '/api/report'].includes(path)) {
      const access = await env.FACTORY.access('proposal-preflight').catch(() => ({ allowed: true }));
      if (!access.allowed) return new Response(JSON.stringify({ error: `Experiment paused: ${access.reason}` }), { status: 410, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
    }
    if (!handler || origin !== currentOrigin) {
      origin = currentOrigin;
      const server = createApp({
        // Live payments cannot be enabled in this launch build, even through a dashboard flag.
        env: { ...env, PUBLIC_BASE_URL: currentOrigin, PAYMENT_MODE: 'test', LIVE_PAYMENTS_APPROVED: 'false' },
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
    if (env.FACTORY && (request.headers.get('X-Factory-Test') === '1' || !/bot|crawl|spider|headless|uptime/i.test(request.headers.get('User-Agent') || ''))) {
      let event = request.method === 'GET' && path === '/' && response.ok ? 'pageviews'
        : request.method === 'POST' && ['/api/preview', '/api/report'].includes(path) && response.ok ? 'reviews'
        : request.method === 'POST' && response.status >= 400 ? 'errors' : null;
      if (eventRequest && response.ok) {
        const value = await eventRequest.json().catch(() => null);
        event = value?.event === 'download' ? 'downloads' : value?.event === 'support' ? 'supportClicks' : null;
      }
      if (event) ctx.waitUntil(env.FACTORY.record({ product: 'proposal-preflight', event, channel: new URL(request.url).searchParams.get('source') === 'sla-checklist' ? 'sla-checklist' : 'direct', test: request.headers.get('X-Factory-Test') === '1' }).catch(() => {}));
    }
    return response;
  }
};
