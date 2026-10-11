"""Deploy the existing Worker; needs only a scoped Cloudflare token. Never logs secrets."""
import json
import os
import secrets
import subprocess
import sys
import urllib.error
import urllib.request
from pathlib import Path

token = os.environ.get('CLOUDFLARE_API_TOKEN')
if not token:
    sys.exit('Missing Cloudflare account connection: add CLOUDFLARE_API_TOKEN securely. No deployment performed.')

def api(path, payload=None, allow_missing=False):
    req = urllib.request.Request('https://api.cloudflare.com/client/v4/' + path,
        data=json.dumps(payload).encode() if payload is not None else None,
        headers={'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json'},
        method='PUT' if payload is not None else 'GET')
    try:
        with urllib.request.urlopen(req, timeout=30) as response:
            data = json.load(response)
    except urllib.error.HTTPError as error:
        if allow_missing and error.code == 404:
            return {}
        sys.exit(f'Cloudflare operation failed ({error.code}); check account access/token permissions. No credential values were logged.')
    if not data.get('success'):
        sys.exit('Cloudflare rejected the operation. Check account permissions; no paid services will be enabled.')
    return data['result']

accounts = api('accounts')
account_id = os.environ.get('CLOUDFLARE_ACCOUNT_ID')
if not account_id:
    if len(accounts) != 1:
        sys.exit('Scope the token to one Free-plan Cloudflare account, or set its nonsecret CLOUDFLARE_ACCOUNT_ID.')
    account_id = accounts[0]['id']
if account_id not in [a['id'] for a in accounts]:
    sys.exit('Configured account is not accessible to this token.')

# The new free Workers account may not have a workers.dev namespace yet.
domain = api(f'accounts/{account_id}/workers/subdomain', allow_missing=True)
if not domain.get('subdomain'):
    domain = api(f'accounts/{account_id}/workers/subdomain', {'subdomain': 'preflight-' + secrets.token_hex(5)})

env = {**os.environ, 'CLOUDFLARE_ACCOUNT_ID': account_id, 'WRANGLER_SEND_METRICS': 'false'}
env.setdefault('XDG_CONFIG_HOME', '/tmp/preflight-cf-config')
root = Path(__file__).resolve().parents[1]
subprocess.run(['npm', 'run', 'deploy'], cwd=root, env=env, check=True)
print('Deployment URL: https://proposal-preflight.' + domain['subdomain'] + '.workers.dev')
print('Live payments remain disabled. Verify the deployed HTTPS journey before announcing a launch.')
