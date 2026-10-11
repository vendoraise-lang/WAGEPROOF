import { createHash, createHmac } from 'node:crypto';

export const LIMITS = Object.freeze({ requirements: 6000, proposal: 16000, rows: 30 });
const STOP = new Set('a an the and or of to for in on by with from is are be being been must shall should will would can could may provide demonstrate describe include includes including explain our your their we you it this that as at any all each ability required requirement requirements supplier vendor contractor maintain offer deliver time within least minimum maximum exactly than'.split(' '));
const words = text => text.toLowerCase().match(/[a-z0-9]+(?:[.-][a-z0-9]+)*/g) || [];
const normalize = token => token.length > 4 && token.endsWith('s') && !token.endsWith('ss') ? token.slice(0, -1) : token;

export function validate(input) {
  if (!input || typeof input.requirements !== 'string' || typeof input.proposal !== 'string') throw new Error('Paste a checklist and proposal text.');
  const requirements = input.requirements.trim();
  const proposal = input.proposal.trim();
  if (!requirements || !proposal) throw new Error('Both fields are required.');
  if (requirements.length > LIMITS.requirements || proposal.length > LIMITS.proposal) throw new Error('Text is too large. Limit the checklist to 6,000 characters and the proposal to 16,000.');
  const rows = requirements.split(/\r?\n/).map(x => x.trim().replace(/^(?:[-*•]|\d+[.)])\s*/, '')).filter(Boolean);
  if (rows.length > LIMITS.rows) throw new Error('Use at most 30 requirements, one per line.');
  if (rows.some(x => x.length > 600)) throw new Error('Keep each requirement under 600 characters.');
  return { requirements: rows.join('\n'), proposal, rows };
}

const SYNONYMS = [[/\b(help\s?desk|service desk|technical assistance)\b/gi, 'support'], [/\b(respond(?:s)?|acknowledg(?:e|ement|ment)|first reply)\b/gi, 'response'], [/\bavailability\b/gi, 'uptime'], [/\b(certified|certifications)\b/gi, 'certification']];
function canonical(text) {
  let value = text.toLowerCase();
  for (const [pattern, replacement] of SYNONYMS) value = value.replace(pattern, replacement);
  return value;
}
const TOPICS = {
  response: /\b(?:response|respond|acknowledg\w*|first reply)\b/gi,
  resolution: /\b(?:resolution|resolve\w*)\b/gi,
  rto: /\b(?:rto|recovery time objective)\b/gi,
  rpo: /\b(?:rpo|recovery point objective)\b/gi,
  recovery: /\b(?:recovery(?! (?:time|point) objective)|restore\w*|restoration)\b/gi,
  retention: /\b(?:retention|retain\w*)\b/gi,
  uptime: /\b(?:uptime|availability)\b/gi,
  references: /\b(?:references?)\b/gi,
  experience: /\b(?:experience)\b/gi
};
function measurements(text) {
  if (!/\d+(?:\.\d+)?\s*(?:%|milliseconds?|ms\b|seconds?|secs?\b|minutes?|mins?\b|hours?|hrs?\b|days?|weeks?|years?|references?)/i.test(text)) return [];
  const topics = Object.entries(TOPICS).flatMap(([topic, pattern]) => [...text.matchAll(new RegExp(pattern))].map(m => ({ topic, at: m.index + m[0].length / 2 })));
  return [...text.matchAll(/\b(\d+(?:\.\d+)?)\s*(%|milliseconds?|ms\b|seconds?|secs?\b|minutes?|mins?\b|hours?|hrs?\b|days?|weeks?|years?|references?)/gi)].flatMap(m => {
    const at = m.index + m[0].length / 2;
    let nearest = topics.reduce((a, b) => !a || Math.abs(b.at - at) < Math.abs(a.at - at) ? b : a, null);
    if (!nearest || Math.abs(nearest.at - at) > 100) return [];
    const unit = m[2].toLowerCase();
    const scale = unit === '%' ? 1 : /^ms|millisecond/.test(unit) ? .001 : /^sec/.test(unit) ? 1 : /^min/.test(unit) ? 60 : /^hour|^hr/.test(unit) ? 3600 : /^day/.test(unit) ? 86400 : /^week/.test(unit) ? 604800 : /^year/.test(unit) ? 1 : 1;
    const dimension = unit === '%' ? 'percent' : /^year/.test(unit) ? 'years' : /^reference/.test(unit) ? 'count' : 'seconds';
    return [{ topic: nearest.topic, value: Number(m[1]) * scale, raw: m[0], dimension }];
  });
}
function compareConstraint(required, offered, text) {
  const mode = /\bexactly\b/i.test(text) ? 'exact' : /\b(?:at least|minimum|no less than|not less than)\b|[≥]|>=/i.test(text) ? 'min' : /\b(?:at most|maximum|within|no more than|not exceeding|up to)\b|[≤]|<=/i.test(text) ? 'max' : ['response', 'resolution', 'recovery', 'rto', 'rpo'].includes(required.topic) ? 'max' : 'min';
  const ok = mode === 'max' ? offered.value <= required.value : mode === 'min' ? offered.value >= required.value : offered.value === required.value;
  return { label: `${required.topic} threshold`, required: required.raw, offered: offered.raw, result: ok ? 'within stated threshold' : 'outside stated threshold', assumption: `Interpreted as ${mode === 'max' ? 'an upper bound' : mode === 'min' ? 'a lower bound' : 'an exact value'}; verify the SLA definition and measurement window.`, mismatch: !ok };
}
function hasNegation(text) {
  const clean = text.replace(/\b(?:not only|not less than|no more than|not exceeding|no downtime|without interruption)\b/gi, '');
  return /\b(?:do(?:es)? not (?:offer|provide|support|hold|maintain|meet)|cannot\b|unable to|not currently|not(?:\s+\w+){0,3}\s+(?:certified|available|provided|supported|included))\b/i.test(clean);
}

export function analyze(input) {
  const data = validate(input);
  // Sentence splitting preserves decimal numbers; bounded chunks protect CPU/memory.
  const chunks = data.proposal.split(/\r?\n|;|(?<=[.!?])\s+(?=[A-Z])/).flatMap(text => {
    const values = []; for (let i = 0; i < text.length; i += 600) values.push(text.slice(i, i + 700).trim()); return values;
  }).filter(Boolean);
  const indexed = [...new Set(chunks)].map((text, index) => ({ text, index, tokens: new Set(words(canonical(text)).map(normalize)), measures: measurements(text) }));
  // Inverted index avoids rescanning every proposal passage for every requirement.
  const inverted = new Map();
  indexed.forEach((p, i) => p.tokens.forEach(token => { if (!inverted.has(token)) inverted.set(token, []); inverted.get(token).push(i); }));
  const findings = data.rows.map((requirement, index) => {
    const terms = [...new Set(words(canonical(requirement)).filter(x => !STOP.has(x)).map(normalize))];
    const hits = new Map();
    for (const term of terms) for (const id of inverted.get(term) || []) hits.set(id, (hits.get(id) || 0) + 1);
    const candidates = [...hits].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([id, count]) => ({ ...indexed[id], count }));
    const best = candidates[0];
    const missing = terms.filter(x => !best?.tokens.has(x));
    let status = !terms.length ? 'Needs a clearer requirement' : !best ? 'No relevant answer located' : missing.length ? 'Incomplete response coverage' : 'Coverage found — verify';
    const checks = [], actions = [];
    const constraints = measurements(requirement);
    for (const required of constraints) {
      const relevant = candidates.filter(p => p.tokens.has(required.topic) || p.measures.some(m => m.topic === required.topic));
      const offers = relevant.flatMap(p => p.measures.filter(m => m.topic === required.topic && m.dimension === required.dimension).map(m => ({ m, passage: p })));
      const unique = [...new Map(offers.map(x => [x.m.value, x])).values()];
      if (!unique.length) {
        checks.push({ label: `${required.topic} threshold`, required: required.raw, offered: 'Not stated in a relevant passage', result: 'needs explicit commitment' });
        if (best) status = 'Missing measurable commitment';
        actions.push(`State the ${required.topic} commitment explicitly and cite its SLA or evidence.`);
      } else if (unique.length > 1) {
        checks.push({ label: `${required.topic} threshold`, required: required.raw, offered: unique.map(x => x.m.raw).join(' / '), result: 'multiple values found — scope review required' });
        status = 'Conflicting or scoped commitments';
        actions.push(`Resolve or explain the different ${required.topic} values; they may apply to different service tiers.`);
      } else {
        const check = compareConstraint(required, unique[0].m, requirement); checks.push(check);
        if (!check.mismatch && status === 'Incomplete response coverage' && missing.every(t => /^\d/.test(t) || ['millisecond','second','sec','minute','min','hour','hr','day','week','year'].includes(t))) status = 'Coverage found — verify';
        if (check.mismatch) { status = 'Numeric requirement mismatch'; actions.push(`Reconcile the required ${required.raw} with the offered ${unique[0].m.raw}. Do not change a promise without operational approval.`); }
      }
    }
    if (/24\s*\/\s*7|round.the.clock|around.the.clock/i.test(requirement)) {
      const offered = candidates.some(p => /24\s*\/\s*7|round.the.clock|around.the.clock|24 hours.{0,15}7 days/i.test(p.text));
      checks.push({ label: 'Support coverage', required: 'Continuous coverage', offered: offered ? 'Continuous coverage stated' : 'Continuous coverage not explicitly stated', result: offered ? 'claim located — verify staffing' : 'needs explicit commitment' });
      if (!offered && best) { status = 'Missing coverage commitment'; actions.push('Specify the supported hours, days, time zone and emergency escalation coverage.'); }
    }
    if (/\b(?:describe|explain|document)\b.*\b(?:process|procedure|plan|escalation)\b/i.test(requirement)) {
      const relevant = candidates.filter(p => p.count >= Math.max(1, Math.ceil(terms.length / 2)));
      const concrete = relevant.some(p => /\b(?:triag(?:e|es|ed|ing)|escalat(?:e|es|ed|ing)|assign(?:s|ed)?|log(?:s|ged)?|notif(?:y|ies|ied)|investigat(?:e|es|ed)|restor(?:e|es|ed)|routes?|step|within|then|first)\b/i.test(p.text));
      checks.push({ label: 'Process explanation', required: 'Operational detail', offered: concrete ? 'Action or owner detail located' : 'No operational detail located', result: concrete ? 'detail found — verify completeness' : 'needs a specific explanation' });
      if (!concrete && best) { status = 'Unsupported process claim'; actions.push('Add concrete steps, owners, triggers and escalation timing instead of a generic process statement.'); }
    }
    if (/\b(?:certification|certified|soc\s*2|iso\s*27001|references?|attach|appendix)\b/i.test(requirement)) {
      checks.push({ label: 'Supporting evidence', required: 'Independent evidence or referenced attachment', offered: 'Not inspected by this text-only checker', result: 'human evidence verification required' });
      actions.push('Verify the actual certificate, report, reference or attachment, including entity, scope and validity.');
    }
    const negated = candidates.find(p => p.count >= Math.max(1, Math.ceil(terms.length / 2)) && hasNegation(p.text));
    if (negated) { status = 'Possible contradictory commitment'; actions.push('Read the negated statement in context and reconcile it with this requirement.'); }
    const echoed = best && /\b(?:must|required to)\b/i.test(best.text) && !/\b(?:we|our)\b/i.test(best.text);
    if (echoed && status === 'Coverage found — verify') { status = 'Requirement restated, not answered'; actions.push('Replace copied requirement language with a specific vendor commitment and evidence.'); }
    if (!actions.length) actions.push(best ? 'Review the cited answer for actual meaning, scope and truth; coverage alone is not compliance.' : 'Add a direct answer or point the reviewer to the exact relevant section.');
    const warning = status !== 'Coverage found — verify';
    const evidence = [...new Map([negated, best, ...candidates.filter(p => p.measures.length)].filter(Boolean).map(p => [p.index, p])).values()].slice(0, 3).map(p => ({ passage: p.index + 1, text: p.text }));
    return { id: index + 1, requirement, status, severity: warning ? 'review' : 'info', terms, missing, excerpt: (negated || best)?.text || '', checks, evidence, nextAction: actions.join(' '), note: checks.length ? 'Structured rules evaluate explicit claims and supported numeric thresholds. Findings need human verification.' : 'No supported structured rule applies; this row uses response-coverage matching only. Human review required.' };
  });
  return { version: '2.0', total: findings.length, findings, summary: findings.reduce((acc, x) => ({ ...acc, [x.status]: (acc[x.status] || 0) + 1 }), {}), limitation: 'Rule-based proposal preflight, not AI judgment or compliance certification. Numeric checks cover explicit durations, uptime, retention, references and experience only. Context, measurement windows, unrecognized phrasing and supporting documents require human review.' };
}

export function digest(input, secret) {
  const { requirements, proposal } = validate(input);
  return createHmac('sha256', secret).update(JSON.stringify({ requirements, proposal, version: '2.0' })).digest('hex');
}
export const keyHash = value => createHash('sha256').update(value).digest('hex');
