import { httpServerHandler } from 'cloudflare:node';
import { createApp } from './server.js';

let handler, origin;
export default {
  async fetch(request, env, ctx) {
    const currentOrigin = new URL(request.url).origin;
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
    return handler.fetch(request, env, ctx);
  }
};
