import { createHash, createHmac } from 'node:crypto';

export const LIMITS = Object.freeze({ requirements: 12000, proposal: 180000, rows: 30 });
const STOP = new Set('a an the and or of to for in on by with from is are be being been must shall should will would can could may provide demonstrate describe include includes including explain our your their we you it this that as at any all each ability required requirement requirements supplier vendor contractor'.split(' '));
const words = text => text.toLowerCase().match(/[\p{L}\p{N}]+(?:[.-][\p{L}\p{N}]+)*/gu) || [];
const normalize = token => token.length > 4 && token.endsWith('s') && !token.endsWith('ss') ? token.slice(0, -1) : token;

export function validate(input) {
  if (!input || typeof input.requirements !== 'string' || typeof input.proposal !== 'string') throw new Error('Paste a checklist and proposal text.');
  const requirements = input.requirements.trim();
  const proposal = input.proposal.trim();
  if (!requirements || !proposal) throw new Error('Both fields are required.');
  if (requirements.length > LIMITS.requirements || proposal.length > LIMITS.proposal) throw new Error('Text is too large. Limit the checklist to 12,000 characters and the proposal to 180,000.');
  const rows = requirements.split(/\r?\n/).map(x => x.trim().replace(/^(?:[-*•]|\d+[.)])\s*/, '')).filter(Boolean);
  if (rows.length > LIMITS.rows) throw new Error('Use at most 30 requirements, one per line.');
  if (rows.some(x => x.length > 600)) throw new Error('Keep each requirement under 600 characters.');
  return { requirements: rows.join('\n'), proposal, rows };
}

export function analyze(input) {
  const data = validate(input);
  // Preserve paragraphs; use bounded windows for pasted text without punctuation.
  const chunks = data.proposal.match(/[^\n.!?]+(?:[.!?]+|$)/g) || [data.proposal];
  const passages = chunks.flatMap(x => {
    const result = [];
    for (let i = 0; i < x.length; i += 600) result.push(x.slice(i, i + 700).trim());
    return result;
  }).filter(Boolean);
  const indexed = passages.map(text => ({ text, tokens: new Set(words(text).map(normalize)) }));
  const findings = data.rows.map((requirement, index) => {
    const terms = [...new Set(words(requirement).filter(x => !STOP.has(x)).map(normalize))];
    if (!terms.length) return { id: index + 1, requirement, status: 'Needs a clearer requirement', terms: [], missing: [], excerpt: '', note: 'No specific searchable terms. Rewrite this checklist item.' };
    let best = { text: '', found: [] };
    for (const passage of indexed) {
      const found = terms.filter(x => passage.tokens.has(x));
      if (found.length > best.found.length) best = { text: passage.text, found };
      if (found.length === terms.length) break;
    }
    const missing = terms.filter(x => !best.found.includes(x));
    const negative = best.found.length > 0 && /\b(?:not|never|cannot|unable|without|no)\b/i.test(best.text);
    const status = !best.found.length ? 'Terms not located' : negative ? 'Review possible negation' : missing.length ? 'Partial terminology' : 'Terms located';
    return { id: index + 1, requirement, status, terms, missing, excerpt: best.text.slice(0, 700), note: negative ? 'Negation appears in the matching passage. It may be unrelated; inspect the wording.' : 'Term matching only. Check actual commitments, quantities, meaning and supporting evidence yourself.' };
  });
  return { version: '1.0', total: findings.length, findings, summary: findings.reduce((acc, x) => ({ ...acc, [x.status]: (acc[x.status] || 0) + 1 }), {}), limitation: 'A deterministic terminology screen, not AI judgment, certification, legal advice or a prediction of bid success. Missing terms may be expressed differently; located terms do not prove that a requirement is satisfied.' };
}

export function digest(input, secret) {
  const { requirements, proposal } = validate(input);
  return createHmac('sha256', secret).update(JSON.stringify({ requirements, proposal, version: '1.0' })).digest('hex');
}
export const keyHash = value => createHash('sha256').update(value).digest('hex');
