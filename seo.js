// Only existing products and exact approved resources may be discoverable.
export const FACTORY_ORIGIN = 'https://business-factory.preflight-f1224675ed.workers.dev';
export const PRODUCT_ORIGIN = 'https://proposal-preflight.preflight-f1224675ed.workers.dev';
export const RESOURCE_URL = FACTORY_ORIGIN + '/resources/sla-checklist';
const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&apos;' })[c]);
export function sitemap(urls) {
  if (urls.some(url => { const u = new URL(url); return u.protocol !== 'https:' || u.search || u.hash || u.username || u.password; })) throw new Error('Only public canonical HTTPS URLs are eligible.');
  return '<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' + urls.map(url => `<url><loc>${escape(url)}</loc></url>`).join('') + '</urlset>';
}
export const productSitemap = origin => origin.startsWith('https://') ? sitemap([origin + '/']) : sitemap([]);
export const robots = origin => `User-agent: *\nDisallow: /api/\nDisallow: /health\nDisallow: /legal\nDisallow: /*?checkout=\nSitemap: ${origin}/sitemap.xml\n`;
export async function auditSEO(urls, fetcher = fetch) {
  const pages = [];
  for (const url of urls) {
    if (![PRODUCT_ORIGIN + '/', RESOURCE_URL].includes(url)) throw new Error('Unapproved audit target.');
    try {
      const options = { headers: { 'User-Agent':'BusinessFactorySEO/1.0', 'X-Factory-Test':'1' }, signal: AbortSignal.timeout(10000), redirect: 'manual' };
      const r = await fetcher(url, options), text = await r.text(), origin = new URL(url).origin;
      const robot = await fetcher(origin + '/robots.txt', options), map = await fetcher(origin + '/sitemap.xml', options);
      const robotText = await robot.text(), mapText = await map.text();
      const checks = { https: url.startsWith('https://'), status: r.status === 200, title: /<title>[^<]+<\/title>/.test(text), description: /name="description"/.test(text), canonical: text.includes(`rel="canonical" href="${url}"`), indexable: !/noindex/i.test(r.headers.get('X-Robots-Tag') || '') && !/<meta[^>]+(?:name="robots"[^>]+content="[^"]*noindex|content="[^"]*noindex[^>]+name="robots")/i.test(text), robots: robot.ok && robotText.includes(origin + '/sitemap.xml'), sitemap: map.ok && mapText.includes(`<loc>${url}</loc>`), internalLink: url === RESOURCE_URL ? text.includes(PRODUCT_ORIGIN + '/?source=sla-checklist') : text.includes(RESOURCE_URL) };
      pages.push({ url, ok: Object.values(checks).every(Boolean), checks });
    } catch (error) { pages.push({ url, ok: false, error: 'Technical audit request failed; no indexing claim.', diagnostic: String(error.message).slice(0, 160) }); }
  }
  return { checkedAt: new Date().toISOString(), pages, ok: pages.length > 0 && pages.every(p => p.ok), indexingVerified: false, limitation: 'Technical eligibility only. Search engines independently decide crawling, indexing and ranking.' };
}
// Authenticated Google submission requires an explicit founder-approved exact task and site ownership.
// robots.txt sitemap discovery works without credentials; anonymous sitemap ping is obsolete.
export async function submitSitemap(task, token, fetcher = fetch, now = Date.now()) {
  if (task?.approval?.actor !== 'founder' || task.approval?.url !== task.url || !task.approval?.approvedAt || ![PRODUCT_ORIGIN + '/sitemap.xml', FACTORY_ORIGIN + '/sitemap.xml'].includes(task.url)) return { submitted: false, reason: 'Founder approval required for exact external submission.' };
  if (!token || task.ownershipVerified !== true || (task.notBefore && Date.parse(task.notBefore) > now)) return { submitted: false, reason: 'Verified Search Console ownership and authenticated account connection required.' };
  const site = new URL(task.url).origin + '/';
  const response = await fetcher(`https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(site)}/sitemaps/${encodeURIComponent(task.url)}`, { method: 'PUT', headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(10000) });
  return { submitted: response.ok, status: response.status, submittedAt: new Date(now).toISOString(), indexingVerified: false };
}
