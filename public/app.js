const $ = id => document.getElementById(id);
const STORAGE = 'preflight-draft-v1';
let config = { paymentsAvailable: false }, report = null, active = null, busy = false;
const message = (text, error = false) => { $('message').textContent = text; $('message').className = `message${error ? ' error' : ''}`; };
function draft() { return { requirements: $('requirements').value, proposal: $('proposal').value }; }
function browserKey() { return [...crypto.getRandomValues(new Uint8Array(32))].map(x => x.toString(16).padStart(2, '0')).join(''); }
async function api(path, data) {
  const response = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data), signal: AbortSignal.timeout(35000) });
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
    article.append(node('span', finding.status, `tag${finding.status !== 'Terms located' ? ' warning' : ''}`));
    article.append(node('h3', `${finding.id}. ${finding.requirement}`));
    if (finding.missing.length) article.append(node('p', `Terms not in this passage: ${finding.missing.join(', ')}`));
    if (finding.excerpt) article.append(node('blockquote', finding.excerpt));
    article.append(node('p', finding.note, 'small')); $('findings').append(article);
  }
  $('purchase').hidden = full;
  $('downloads').hidden = !full;
  $('checkout').textContent = config.paymentsAvailable ? 'Get full report · $9' : 'Checkout not activated yet';
  $('checkout').disabled = !config.paymentsAvailable || busy;
}
function remember(value) {
  try { sessionStorage.setItem(STORAGE, JSON.stringify(value)); }
  catch { throw new Error('Browser storage is unavailable. Enable session storage before checkout so your report can be recovered.'); }
}
function invalidate() { report = null; active = null; $('results').hidden = true; message(''); }
$('requirements').addEventListener('input', invalidate); $('proposal').addEventListener('input', invalidate);
$('review-form').addEventListener('submit', async event => {
  event.preventDefault(); if (busy) return;
  setBusy(true); message('Checking terminology…');
  try {
    active = { ...draft(), buyerKey: browserKey() }; remember(active);
    const result = await api('/api/preview', active); render(result); message('Preview ready. Inspect the excerpts before deciding whether a complete report is useful.');
  } catch (e) { message(e.message, true); } finally { setBusy(false); $('checkout').disabled = !config.paymentsAvailable; }
});
$('sample').addEventListener('click', () => {
  if ($('requirements').value || $('proposal').value) if (!confirm('Replace the current text with a fictional example?')) return;
  invalidate(); $('requirements').value = 'Provide 24/7 support\nMaintain SOC 2 Type II certification\nDescribe the incident escalation process\nProvide a 30 minute response time';
  $('proposal').value = 'FICTIONAL EXAMPLE — not a real vendor or certification.\nOur team provides 24/7 support.\nWe cannot claim SOC 2 Type II certification.\nThe incident escalation process routes urgent tickets to the duty engineer.\nOur response time is 60 minutes.'; $('consent').checked = true;
});
$('clear').addEventListener('click', () => {
  if (!confirm('Clear the draft and browser checkout data? Download a paid report first.')) return;
  sessionStorage.removeItem(STORAGE); $('review-form').reset(); invalidate(); history.replaceState(null, '', '/'); message('Text and checkout data cleared from this tab.');
});
$('checkout').addEventListener('click', async () => {
  if (!active || busy || !config.paymentsAvailable) return;
  setBusy(true); message('Opening secure Stripe checkout…');
  try { remember(active); const result = await api('/api/checkout', active); location.assign(result.url); }
  catch (e) { message(e.message, true); setBusy(false); }
});
const escapeHTML = text => String(text).replace(/[&<>"']/g, x => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[x]);
const csvCell = text => { let value = String(text); if (/^[\s\u0000-\u001f]*[=+@-]/.test(value)) value = `'${value}`; return `"${value.replaceAll('"', '""')}"`; };
function download(content, type, name) { const url = URL.createObjectURL(new Blob([content], { type })); const a = document.createElement('a'); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
$('download-csv').addEventListener('click', () => {
  if (!report) return;
  const rows = [['Requirement', 'Status', 'Missing terms', 'Evidence excerpt', 'Review note'], ...report.findings.map(x => [x.requirement, x.status, x.missing.join('; '), x.excerpt, x.note]), ['LIMITATION', report.limitation, '', '', '']];
  download('\uFEFF' + rows.map(row => row.map(csvCell).join(',')).join('\r\n'), 'text/csv;charset=utf-8', 'proposal-preflight.csv');
});
$('download-html').addEventListener('click', () => {
  if (!report) return;
  const items = report.findings.map(x => `<article><h2>${x.id}. ${escapeHTML(x.requirement)}</h2><p><strong>${escapeHTML(x.status)}</strong></p><p>Missing terms: ${escapeHTML(x.missing.join(', ') || 'None in this passage')}</p><blockquote>${escapeHTML(x.excerpt || 'No matching passage')}</blockquote><p>${escapeHTML(x.note)}</p></article>`).join('');
  download(`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"><title>Proposal Preflight report</title><style>body{font:16px/1.6 system-ui;max-width:900px;margin:40px auto;padding:20px;color:#172c27}article{border-top:1px solid #ddd;padding:20px 0}h2{font-size:19px}blockquote{white-space:pre-wrap;overflow-wrap:anywhere;background:#f3f5ec;padding:16px;margin:0}</style><h1>Proposal Preflight</h1><p>${escapeHTML(report.limitation)}</p>${items}</html>`, 'text/html;charset=utf-8', 'proposal-preflight.html');
});
async function initialize() {
  try {
    const response = await fetch('/api/config'); if (!response.ok) throw new Error('Configuration unavailable.'); config = await response.json();
    const saved = sessionStorage.getItem(STORAGE);
    if (saved) { active = JSON.parse(saved); $('requirements').value = active.requirements || ''; $('proposal').value = active.proposal || ''; }
    const sessionId = new URLSearchParams(location.search).get('checkout');
    if (sessionId) {
      if (!active?.buyerKey) { message('The original draft is missing from this tab. Use your Stripe receipt to request help or a refund; do not send proposal contents.', true); return; }
      setBusy(true); message('Verifying your payment…');
      const result = await api('/api/report', { ...active, sessionId }); render(result, true); message('Payment verified. Download your report before closing or clearing this tab.');
      $('results').scrollIntoView({ behavior: 'smooth' });
    } else if (new URLSearchParams(location.search).has('cancelled')) message('Checkout cancelled. Your draft is still here.');
  } catch (e) { message(e.message || 'Unable to load. Please refresh.', true); }
  finally { setBusy(false); $('checkout').disabled = !config.paymentsAvailable; }
}
initialize();
