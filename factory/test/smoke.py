"""Real public factory verification; no simulated commercial data or disabled TLS checks."""
import json
import urllib.request
import urllib.error
from playwright.sync_api import sync_playwright, expect

base = 'https://business-factory.preflight-f1224675ed.workers.dev'
opener = urllib.request.build_opener()
opener.addheaders = [('User-Agent', 'BusinessFactorySmoke/1.0')]
urllib.request.install_opener(opener)
with urllib.request.urlopen(base + '/api/portfolio', timeout=30) as r:
    data = json.load(r)
    assert data['economics']['verifiedRevenueCents'] == 0
    assert data['economics']['profitCents'] is None
    assert not data['economics']['livePaymentsEnabled']
    assert 'body' not in data['distributionDraft']
    assert data['candidates'][0]['publication'] == 'draft'
    assert data['products'][0]['testCounts']['reviews'] >= 1
    assert data['products'][0]['testCounts']['downloads'] >= 2
for path, method, expected in [('/products/sla-preflight', 'GET', 404), ('/resources/sla-checklist', 'GET', 404), ('/api/events', 'POST', 405), ('/api/payments/stripe-test', 'POST', 503)]:
    try:
        urllib.request.urlopen(urllib.request.Request(base + path, method=method), timeout=30)
        raise AssertionError('Unapproved route should be blocked')
    except urllib.error.HTTPError as e:
        assert e.code == expected
with sync_playwright() as p:
    browser = p.chromium.launch(executable_path='/usr/bin/chromium', headless=True, args=['--no-sandbox'])
    page = browser.new_page(viewport={'width': 390, 'height': 844})
    errors = []
    page.on('pageerror', lambda e: errors.append(str(e)))
    def relay(route):
        req = route.request
        headers = {k: v for k, v in req.headers.items() if k.lower() not in ['host', 'content-length', 'accept-encoding']}
        with urllib.request.urlopen(urllib.request.Request(req.url, headers=headers), timeout=30) as r:
            headers = {k: v for k, v in r.headers.items() if k.lower() not in ['transfer-encoding', 'content-encoding', 'content-length']}
            route.fulfill(status=r.status, headers=headers, body=r.read())
    # Temporary verified TLS transport: does not change Chromium's permanent certificate trust.
    page.route(base + '/**', relay)
    page.goto(base)
    page.locator('#products article').wait_for()
    assert 'Proposal Preflight' in page.locator('#products').inner_text()
    assert 'Unverified' in page.locator('#summary').inner_text()
    assert 'content is withheld' in page.locator('#approvals').inner_text()
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
    page.set_viewport_size({'width': 1280, 'height': 900})
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
    page.locator('#refresh').click()
    expect(page.locator('#refresh')).to_be_enabled()
    page.screenshot(path='/tmp/business-factory.png', full_page=True)
    assert not errors, errors
    browser.close()
print('PASS: public factory desktop/mobile dashboard, persisted test-event pipeline, revenue honesty, approval gates and read-only interface.')
