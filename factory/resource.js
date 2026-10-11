export function resourceContent(resource) { return { id: resource.id, title: resource.title, intro: resource.intro, sections: resource.sections, toolUrl: resource.toolUrl }; }
export async function resourceDigest(resource) {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(resourceContent(resource))));
  return [...new Uint8Array(hash)].map(v => v.toString(16).padStart(2, '0')).join('');
}
const escape = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
export function resourceHTML(resource) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(resource.title)}</title><meta name="description" content="A practical checklist for response time, uptime, recovery objectives and support coverage in IT service agreements."><link rel="stylesheet" href="/style.css"></head><body><main><header><span class="badge">PRACTICAL CHECKLIST</span><h1>${escape(resource.title)}</h1><p>${escape(resource.intro)}</p></header>${resource.sections.map(s => `<article><h2>${escape(s.heading)}</h2><p>${escape(s.text)}</p></article>`).join('')}<section><h2>Compare your written commitments</h2><p>Proposal Preflight compares a short English checklist with an IT proposal or agreement. It shows source passages, explicit numeric mismatches and questions for human review. Free beta; no card or purchase required.</p><a href="${escape(resource.toolUrl)}">Run a free preflight →</a></section><footer>Educational resource, not legal advice, supplier certification or a compliance guarantee. No testimonials or performance claims.</footer></main></body></html>`;
}
