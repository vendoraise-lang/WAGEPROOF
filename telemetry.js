// Fixed aggregate vocabulary. No document contents, identities or arbitrary URLs.
export const EVENTS = ['pageviews', 'reviews', 'downloads', 'errors', 'supportClicks', 'resourceViews', 'purchaseIntent', 'checkouts'];
export const CHANNELS = ['direct','sla-checklist','organic-search','shared-link'];
export function traffic(request) {
  const test = request.headers.get('X-Factory-Test') === '1';
  const agent = request.headers.get('User-Agent') || '';
  if (!test && (!agent || /bot|crawl|spider|headless|uptime|BusinessFactory|Smoke|python|curl|wget/i.test(agent))) return null;
  const source = new URL(request.url).searchParams.get('source');
  let channel = CHANNELS.includes(source) ? source : 'direct';
  if (channel === 'direct') try { if (/^(www\.)?(google\.com|bing\.com|duckduckgo\.com|search\.yahoo\.com)$/.test(new URL(request.headers.get('Referer')).hostname)) channel = 'organic-search'; } catch {}
  return { test, channel };
}
export function productEvent(request, response, value) {
  const path = new URL(request.url).pathname;
  if (request.method === 'GET' && path === '/' && response.ok) return 'pageviews';
  if (request.method !== 'POST') return null;
  if (!response.ok) return 'errors';
  if (['/api/preview', '/api/report'].includes(path)) return 'reviews';
  if (path === '/api/checkout') return 'checkouts';
  if (path === '/api/events') return ({ download: 'downloads', support: 'supportClicks', intent: 'purchaseIntent' })[value?.event] || null;
  return null;
}
export function experimentDecision(experiment, funnel, now = Date.now()) {
  const ageDays = Math.max(0, (now - Date.parse(experiment.startedAt)) / 86400000);
  if (ageDays >= experiment.days && funnel.pageviews < experiment.minimumReferrals) return { action: 'stop-channel-investment', reason: '30-day checklist referral threshold missed. Do not create more pages or spend.' };
  if (funnel.pageviews >= experiment.minimumReferrals && funnel.reviews >= experiment.minimumReviews && funnel.purchaseIntent >= experiment.minimumIntent) return { action: 'review-payment-readiness', reason: 'Attributed usage and nonbinding price-interest events justify reviewing an eligible provider. No automatic activation or revenue claim.' };
  if (ageDays >= experiment.days) return { action: 'stop-scaling', reason: 'Distribution alone has not met attributed usage and price-interest thresholds.' };
  return { action: 'observe', reason: 'Zero-cost search experiment open; indexing and genuine buyers remain unverified.' };
}
