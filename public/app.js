const $ = id => document.getElementById(id);
const STORAGE = 'preflight-draft-v1';
let config = { paymentsAvailable: false }, report = null, active = null, busy = false;
const requestedSource = new URLSearchParams(location.search).get('source');
let searchReferral = false;
try { searchReferral = /^(www\.)?(google\.com|bing\.com|duckduckgo\.com|search\.yahoo\.com)$/.test(new URL(document.referrer).hostname); } catch {}
const source = ['sla-checklist','shared-link','organic-search','directory-listing'].includes(requestedSource) ? requestedSource : searchReferral ? 'organic-search' : null;
let sampleMode = false, intentRecorded = false;
const message = (text, error = false) => { $('message').textContent = text; $('message').className = `message${error ? ' error' : ''}`; };
function draft() { return { requirements: $('requirements').value, proposal: $('proposal').value }; }
function browserKey() { return [...crypto.getRandomValues(new Uint8Array(32))].map(x => x.toString(16).padStart(2, '0')).join(''); }
async function api(path, data) {
  const url = source ? `${path}?source=${source}` : path;
  const sample = sampleMode || active?.proposal?.startsWith('FICTIONAL EXAMPLE');
  const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(sample ? { 'X-Factory-Test': '1' } : {}) }, body: JSON.stringify(data), signal: AbortSignal.timeout(35000) });
  const value = await response.json();
  if (!response.ok) throw new Error(value.error || 'Request failed. Please try again.');
  return value;
}
function setBusy(value) { busy = value; for (const id of ['preview', 'checkout', 'sample', 'clear']) $(id).disabled = value; }
function node(tag, text, className) { const el = document.createElement(tag); el.textContent = text; if (className) el.className = className; return el; }
function render(value, full = false) {
  report = full ? value : null;
  $('results').hidden = false; $('findings').replaceChildren();
  $('result-title').textContent = full ? 'Your complete preflight' : 'Your free preview';
  $('result-count').textContent = `${value.findings.length} of ${value.total} requirements`;
  for (const finding of value.findings) {
    const article = document.createElement('article'); article.className = 'finding';
    article.append(node('span', finding.status, `tag${finding.severity !== 'info' ? ' warning' : ''}`));
    article.append(node('h3', `${finding.id}. ${finding.requirement}`));
    if (finding.missing.length) article.append(node('p', `Terms not in this passage: ${finding.missing.join(', ')}`));
    for (const evidence of finding.evidence || [{ passage: '', text: finding.excerpt }]) if (evidence.text) article.append(node('blockquote', `Passage ${evidence.passage}: ${evidence.text}`));
    for (const check of finding.checks || []) article.append(node('p', `${check.label}: required ${check.required}; found ${check.offered}. ${check.result}. ${check.assumption || ''}`));
    if (finding.nextAction) article.append(node('p', `Next action: ${finding.nextAction}`, 'action-note'));
    article.append(node('p', finding.note, 'small')); $('findings').append(article);
  }
  $('purchase').hidden = full;
  $('downloads').hidden = !full;
  // Keep the existing journey working if an edge briefly serves the prior HTML during release.
  if ($('price-interest')) {
    $('price-interest').hidden = config.livePaymentsEnabled === true;
    $('price-interest').disabled = intentRecorded;
  }
  $('checkout').textContent = config.paymentsAvailable ? (config.paymentMode === 'test' ? 'Try test checkout · no charge' : 'Get full report · $9') : 'Checkout not activated yet';
  $('checkout').disabled = !config.paymentsAvailable || busy;
}
function remember(value) {
  try { sessionStorage.setItem(STORAGE, JSON.stringify(value)); }
  catch { throw new Error('Browser storage is unavailable. Enable session storage before checkout so your report can be recovered.'); }
}
function invalidate() { report = null; active = null; sampleMode = false; $('results').hidden = true; message(''); }
$('requirements').addEventListener('input', invalidate); $('proposal').addEventListener('input', invalidate);
$('review-form').addEventListener('submit', async event => {
  event.preventDefault(); if (busy) return;
  setBusy(true); message('Checking terminology…');
  try {
    active = { ...draft(), buyerKey: browserKey() }; remember(active);
    const result = await api('/api/preview', active); render(result, !!result.freeBeta); message(result.freeBeta ? 'Free beta report ready. Review the findings and download your report; no payment is taken.' : 'Preview ready. Inspect the findings before deciding whether a complete report is useful.');
  } catch (e) { message(e.message, true); } finally { setBusy(false); $('checkout').disabled = !config.paymentsAvailable; }
});
$('sample').addEventListener('click', () => {
  if ($('requirements').value || $('proposal').value) if (!confirm('Replace the current text with a fictional example?')) return;
  invalidate(); sampleMode = true; $('requirements').value = 'Provide a response within 30 minutes\nMaintain uptime of at least 99.9%\nDescribe the incident escalation process\nMaintain SOC 2 Type II certification\nProvide 24/7 support';
  $('proposal').value = 'FICTIONAL EXAMPLE — not a real vendor or certification.\nOur response time is 60 minutes.\nOur uptime commitment is 99.5%.\nOur incident escalation process is excellent.\nWe cannot claim SOC 2 Type II certification.\nOur team provides business-hours support.'; $('consent').checked = true;
});
$('clear').addEventListener('click', () => {
  if (!confirm('Clear the draft and browser checkout data? Download a paid report first.')) return;
  sessionStorage.removeItem(STORAGE); $('review-form').reset(); invalidate(); history.replaceState(null, '', '/'); message('Text and checkout data cleared from this tab.');
});
$('checkout').addEventListener('click', async () => {
  if (!active || busy || !config.paymentsAvailable) return;
  setBusy(true); message('Opening secure test checkout…');
  try { remember(active); const result = await api('/api/checkout', active); location.assign(result.url); }
  catch (e) { message(e.message, true); setBusy(false); }
});
const escapeHTML = text => String(text).replace(/[&<>"']/g, x => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[x]);
const csvCell = text => { let value = String(text); if (/^[\s\u0000-\u001f]*[=+@-]/.test(value)) value = `'${value}`; return `"${value.replaceAll('"', '""')}"`; };
function download(content, type, name) { const url = URL.createObjectURL(new Blob([content], { type })); const a = document.createElement('a'); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
// Anonymous aggregate download event only; never send report or document contents.
function trackDownload() { api('/api/events', { event: 'download' }).catch(() => {}); }
$('price-interest')?.addEventListener('click', async () => {
  if (!active || intentRecorded) return;
  $('price-interest').disabled = true;
  try { await api('/api/events', { event: 'intent' }); intentRecorded = true; message('Anonymous price-interest signal recorded. This is not an order or commitment; no payment or contact details were collected.'); }
  catch (e) { $('price-interest').disabled = false; message(e.message, true); }
});
$('flag-problem').addEventListener('click', async () => {
  if (!confirm('Send an anonymous problem signal? No document text or contact details are sent, so we cannot reply individually.')) return;
  try { await api('/api/events', { event: 'support' }); message('Problem signal recorded. No document text or contact details were sent; individual replies are unavailable.'); }
  catch (e) { message(e.message, true); }
});
$('download-csv').addEventListener('click', () => {
  if (!report) return;
  const rows = [['Requirement', 'Status', 'Missing terms', 'Evidence excerpt', 'Review note', 'Checks', 'Next action'], ...report.findings.map(x => [x.requirement, x.status, x.missing.join('; '), (x.evidence || [{text: x.excerpt}]).map(e => `Passage ${e.passage || ''}: ${e.text}`).join('\n'), x.note, (x.checks || []).map(c => `${c.label}: ${c.required} / ${c.offered}; ${c.result}`).join(' | '), x.nextAction || '']), ['LIMITATION', report.limitation, '', '', '', '', '']];
  download('\uFEFF' + rows.map(row => row.map(csvCell).join(',')).join('\r\n'), 'text/csv;charset=utf-8', 'proposal-preflight.csv');
  trackDownload();
});
$('download-html').addEventListener('click', () => {
  if (!report) return;
  const items = report.findings.map(x => `<article><h2>${x.id}. ${escapeHTML(x.requirement)}</h2><p><strong>${escapeHTML(x.status)}</strong></p><p>Missing terms: ${escapeHTML(x.missing.join(', ') || 'None in this passage')}</p>${(x.evidence || [{ text: x.excerpt || 'No matching passage' }]).map(e => `<blockquote>Passage ${e.passage || ''}: ${escapeHTML(e.text)}</blockquote>`).join('')}${(x.checks || []).map(c => `<p>${escapeHTML(`${c.label}: required ${c.required}; found ${c.offered}. ${c.result}. ${c.assumption || ''}`)}</p>`).join('')}<p><strong>Next action:</strong> ${escapeHTML(x.nextAction || '')}</p><p>${escapeHTML(x.note)}</p></article>`).join('');
  download(`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"><title>Proposal Preflight report</title><style>body{font:16px/1.6 system-ui;max-width:900px;margin:40px auto;padding:20px;color:#172c27}article{border-top:1px solid #ddd;padding:20px 0}h2{font-size:19px}blockquote{white-space:pre-wrap;overflow-wrap:anywhere;background:#f3f5ec;padding:16px;margin:0}</style><h1>Proposal Preflight</h1><p>${escapeHTML(report.limitation)}</p>${items}</html>`, 'text/html;charset=utf-8', 'proposal-preflight.html');
  trackDownload();
});
$('share-tool')?.addEventListener('click', async () => {
  try { await navigator.clipboard.writeText(`${location.origin}/?source=shared-link`); message('Tool link copied. Share only where useful and welcome.'); } catch { message('Unable to copy. The tool URL is ' + location.origin); }
});
async function recoverCheckout(sessionId) {
  setBusy(true); message('Verifying test payment…');
  try {
    const result = await api('/api/report', { ...active, sessionId }); render(result, true);
    message('Test payment verified. No revenue recorded. Download your report before closing or clearing this tab.');
    if (result.receiptUrl) { const a = node('a', 'View test receipt'); a.href = result.receiptUrl; a.target = '_blank'; a.rel = 'noopener noreferrer'; $('message').append(document.createTextNode(' '), a); }
    $('results').scrollIntoView({ behavior: 'smooth' });
  } catch (e) {
    message(e.message, true); const retry = node('button', 'Retry verification'); retry.type = 'button'; retry.addEventListener('click', () => recoverCheckout(sessionId)); $('message').append(retry);
  } finally { setBusy(false); $('checkout').disabled = !config.paymentsAvailable; }
}
async function initialize() {
  try {
    const response = await fetch('/api/config'); if (!response.ok) throw new Error('Configuration unavailable.'); config = await response.json();
    $('payment-status').hidden = !(config.freeBeta || (config.paymentsAvailable && config.paymentMode === 'test'));
    if (config.freeBeta) { $('payment-status').textContent = 'Free beta: complete analysis and downloads are available. Live payments are disabled.'; $('hero-price').textContent = 'Free beta · complete reports · no card required'; $('preview').textContent = 'Run free preflight'; }
    const saved = sessionStorage.getItem(STORAGE);
    if (saved) { active = JSON.parse(saved); $('requirements').value = active.requirements || ''; $('proposal').value = active.proposal || ''; }
    const sessionId = new URLSearchParams(location.search).get('checkout');
    if (sessionId) {
      if (!active?.buyerKey) { message('The original draft is missing from this tab. Use your payment-provider receipt to request help or a refund; do not send proposal contents.', true); return; }
      await recoverCheckout(sessionId);
    } else if (new URLSearchParams(location.search).has('cancelled')) message('Checkout cancelled. Your draft is still here.');
  } catch (e) { message(e.message || 'Unable to load. Please refresh.', true); }
  finally { setBusy(false); $('checkout').disabled = !config.paymentsAvailable; }
}
initialize();
