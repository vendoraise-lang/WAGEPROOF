import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';

test('Existing template generates a useful unpublished SLA product with working analysis and denied release', async () => {
  execFileSync(process.execPath, ['factory/build.mjs']);
  const artifact = JSON.parse(await readFile('factory/artifacts/sla-preflight/artifact.json', 'utf8'));
  assert.equal(artifact.publication, 'draft');
  const html = await readFile('factory/artifacts/sla-preflight/public/index.html', 'utf8');
  assert.match(html, /name="robots" content="noindex"/);
  assert.match(html, /UNPUBLISHED STAGING DEMO/);
  const registry = JSON.parse(await readFile('factory/registry.json', 'utf8'));
  const { analyze } = await import('../artifacts/sla-preflight/checker.js');
  const report = analyze(registry.candidates[0].demo);
  assert.deepEqual(report.findings.map(f => f.status), ['Numeric requirement mismatch','Numeric requirement mismatch','Numeric requirement mismatch','Coverage found — verify','Missing coverage commitment']);
  const release = spawnSync(process.execPath, ['factory/build.mjs', '--release'], { encoding: 'utf8' });
  assert.notEqual(release.status, 0);
  assert.match(release.stderr, /Publication denied/);
  execFileSync(process.execPath, ['--check', 'factory/artifacts/sla-preflight/public/app.js']);
});
