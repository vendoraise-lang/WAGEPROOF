import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { publicationAllowed, resourceDraft, rankOpportunity } from './core.js';
const root = fileURLToPath(new URL('../', import.meta.url));
const registry = JSON.parse(await readFile(root + 'factory/registry.json', 'utf8'));
const candidate = registry.candidates[0];
if (candidate.template !== 'requirements-review-v1' || !/^[a-z0-9-]{1,40}$/.test(candidate.id) || !/^[A-Za-z0-9 _-]{1,60}$/.test(candidate.name)) throw new Error('Unsupported template');
// Copy tested, working product code. No dependencies, fabricated testimonials or autonomous AI generation.
const files = {};
for (const file of ['payments/lemon.js', 'seo.js', 'checker.js', 'server.js', 'worker.js', 'telemetry.js', 'public/index.html', 'public/app.js', 'public/style.css', 'public/legal.html']) {
  let text = await readFile(root + file, 'utf8');
  if (file.startsWith('public/')) text = text.replaceAll('Proposal Preflight', candidate.name).replaceAll('Proposal preflight', candidate.name);
  if (file === 'worker.js') text = text.replaceAll("'proposal-preflight'", JSON.stringify(candidate.id));
  // Telemetry binding is optional and configured only after separately approved publication.
  files[file] = text;
}
files['public/index.html'] = files['public/index.html'].replace('<title>', '<meta name="robots" content="noindex"><title>');
// Candidate-specific demonstration input; the tested review engine is unchanged.
if (candidate.demo) {
  for (const key of ['requirements', 'proposal']) {
    if (typeof candidate.demo[key] !== 'string') throw new Error('Invalid staging example');
    const pattern = new RegExp("(\\$\\('" + key + "'\\)\\.value = )'[^']*'");
    if (!pattern.test(files['public/app.js'])) throw new Error('Template sample marker unavailable');
    files['public/app.js'] = files['public/app.js'].replace(pattern, (_, prefix) => prefix + JSON.stringify(candidate.demo[key]));
  }
}
files['public/index.html'] = files['public/index.html'].replace('<body>', '<body><p class="wrap notice">UNPUBLISHED STAGING DEMO · fictional examples · no real payments</p>');

files['wrangler.jsonc'] = JSON.stringify({ name: candidate.id, main: 'worker.js', compatibility_date: '2026-10-01', compatibility_flags: ['nodejs_compat'], workers_dev: true, services: [{ binding: 'FACTORY', service: 'business-factory', entrypoint: 'Analytics' }], assets: { directory: './public', binding: 'ASSETS', run_worker_first: true }, vars: { FREE_BETA: 'true', PAYMENT_MODE: 'test', LIVE_PAYMENTS_APPROVED: 'false', BUSINESS_JURISDICTION: 'Morocco', TARGET_MARKET: 'US' } }, null, 2);
files['RESOURCE.txt'] = JSON.stringify(resourceDraft(rankOpportunity([])), null, 2);
const digest = createHash('sha256').update(JSON.stringify(files)).digest('hex');
const out = root + 'factory/artifacts/' + candidate.id;
for (const [path, contents] of Object.entries(files)) { const target = out + '/' + path; await mkdir(target.slice(0, target.lastIndexOf('/')), { recursive: true }); await writeFile(target, contents); }
await writeFile(out + '/artifact.json', JSON.stringify({ id: candidate.id, template: candidate.template, digest, publication: 'draft', files: Object.keys(files) }, null, 2));
console.log(`Prepared working template: ${candidate.id}\nArtifact SHA256: ${digest}\nPublication: withheld. Preview with FREE_BETA=true PUBLIC_BASE_URL=http://127.0.0.1:3001 PORT=3001 node factory/artifacts/${candidate.id}/server.js.`);
if (process.argv.includes('--release')) {
  if (!publicationAllowed(candidate, digest)) throw new Error('Publication denied: exact artifact lacks founder approval.');
  if (registry.products.filter(p => p.id !== candidate.id).length >= registry.maximumProducts) throw new Error('Portfolio product cap reached; founder must approve an increase.');
  console.log('Exact-artifact approval validated. Release pipeline may deploy this artifact; builder does not publish.');
}
