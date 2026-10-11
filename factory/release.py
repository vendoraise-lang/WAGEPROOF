"""Controlled free-tier pipeline. Existing experiment authorization is not new-product approval."""
import json, os, subprocess, sys, urllib.request
from pathlib import Path

root = Path(__file__).resolve().parents[1]
mode = sys.argv[1] if len(sys.argv) > 1 else 'plan'
if mode not in ['plan', 'operations', 'existing-product', 'candidate']:
    sys.exit('Use plan, operations, existing-product, or candidate.')
registry = json.loads((root / 'factory/registry.json').read_text())
if registry['paymentsEnabled'] or registry['maximumProducts'] > 3:
    sys.exit('Release blocked: this approval covers one free experiment and no live payments.')
if mode == 'plan':
    sys.exit('Operations: scheduled read-only dashboard. Existing product: analytics only. Candidate: withheld without exact-artifact founder approval. No automatic releases.')
if mode == 'candidate':
    subprocess.run(['node', 'factory/build.mjs', '--release'], cwd=root, check=True)
token = os.environ.get('CLOUDFLARE_API_TOKEN')
if not token:
    sys.exit('Secure Cloudflare binding unavailable; no deployment.')
req = urllib.request.Request('https://api.cloudflare.com/client/v4/accounts', headers={'Authorization': 'Bearer ' + token})
with urllib.request.urlopen(req, timeout=30) as r:
    accounts = json.load(r)['result']
if len(accounts) != 1:
    sys.exit('Token must be scoped to one authorized Free account.')
config = 'factory/wrangler.jsonc' if mode == 'operations' else 'wrangler.jsonc'
if mode == 'candidate':
    config = 'factory/artifacts/' + registry['candidates'][0]['id'] + '/wrangler.jsonc'
# Deployment is a deliberate local operation, never cron/automatic Git push. No upgrade or billing API exists here.
env = {**os.environ, 'CLOUDFLARE_ACCOUNT_ID': accounts[0]['id'], 'XDG_CONFIG_HOME': '/tmp/preflight-cf-config', 'WRANGLER_SEND_METRICS': 'false'}
subprocess.run(['node', '--test'], cwd=root, env=env, check=True)
subprocess.run(['npx', '--no-install', 'wrangler', 'deploy', '--config', config], cwd=root, env=env, check=True)
