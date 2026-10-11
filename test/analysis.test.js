import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyze } from '../checker.js';
const check = (requirements, proposal) => analyze({ requirements, proposal }).findings[0];

test('Converts durations rather than flagging equivalent phrasing as a numeric gap', () => {
  const f = check('Response within 30 minutes', 'Our response is within 0.5 hours.');
  assert.equal(f.status, 'Coverage found — verify');
  assert.equal(f.checks[0].mismatch, false);
  assert.equal(f.checks[0].offered, '0.5 hours');
});
test('Preserves decimal uptime and lower-bound comparison', () => {
  assert.equal(check('Uptime at least 99.9%', 'Our availability commitment is 99.5%.').status, 'Numeric requirement mismatch');
  assert.equal(check('Uptime at least 99.9%', 'Our uptime commitment is 99.95%.').checks[0].mismatch, false);
});
test('Flags multiple values as a scope question, not a definite violation', () => {
  const f = check('Response within 30 minutes', 'Premium response is 15 minutes. Standard response is 60 minutes.');
  assert.equal(f.status, 'Conflicting or scoped commitments');
  assert.equal(f.evidence.length, 2);
  assert.match(f.nextAction, /service tiers/);
});
test('Does not confuse RPO, RTO, or response with resolution', () => {
  const f = check('RTO within 30 minutes', 'Our RPO is 10 minutes. Our RTO is 60 minutes.');
  assert.equal(f.status, 'Numeric requirement mismatch'); assert.equal(f.checks[0].offered, '60 minutes');
  const r = check('Response within 30 minutes', 'Our response is 15 minutes. Our resolution is 4 hours.');
  assert.equal(r.checks[0].mismatch, false); assert.equal(r.checks[0].offered, '15 minutes');
});
test('Distinguishes generic process claims from concrete operational details', () => {
  const req = 'Describe the incident escalation process';
  assert.equal(check(req, 'Our incident escalation process is excellent.').status, 'Unsupported process claim');
  assert.equal(check(req, 'Our incident escalation process routes urgent tickets to the duty engineer.').checks[0].result, 'detail found — verify completeness');
});
test('Requires explicit coverage and independently checked evidence', () => {
  assert.equal(check('Provide 24/7 support', 'Our support is available during business hours.').status, 'Missing coverage commitment');
  const f = check('SOC 2 Type II certification', 'We hold SOC 2 Type II certification.');
  assert.match(f.nextAction, /actual certificate/);
  assert.equal(f.checks[0].result, 'human evidence verification required');
});
test('Counts and missing numeric commitments produce actionable findings', () => {
  assert.equal(check('At least 3 references', 'We provide 2 references.').status, 'Numeric requirement mismatch');
  assert.equal(check('Response within 30 minutes', 'Our response is fast.').status, 'Missing measurable commitment');
});
test('Does not label copied requirements or unrelated negation as a fulfilled commitment', () => {
  assert.equal(check('Provide 24/7 support', 'Vendor must provide 24/7 support.').status, 'Requirement restated, not answered');
  assert.notEqual(check('Provide 24/7 support', 'Our 24/7 support operates without interruption.').status, 'Possible contradictory commitment');
});
