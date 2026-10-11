"""Verify the real Worker customer journey. Usage: python tools/worker-smoke.py HTTPS_URL."""
import json
import os
import sys
import urllib.error
import urllib.request
from pathlib import Path
from playwright.sync_api import sync_playwright

base = sys.argv[1].rstrip('/') if len(sys.argv) > 1 else 'http://127.0.0.1:8787'
# Cloudflare can reject Python's default agent before forwarding to the Worker.
opener = urllib.request.build_opener()
opener.addheaders = [('User-Agent', 'ProposalPreflightSmoke/1.0')]
urllib.request.install_opener(opener)
with urllib.request.urlopen(base + '/api/config', timeout=60) as response:
    config = json.load(response)
    assert config['freeBeta'] and config['paymentMode'] == 'test'
    assert not config['paymentsAvailable'], 'Public beta must not accept payments'
with urllib.request.urlopen(base, timeout=30) as response:
    assert "frame-ancestors 'none'" in response.headers['Content-Security-Policy']
    assert response.headers['X-Content-Type-Options'] == 'nosniff'
    assert response.headers['Referrer-Policy'] == 'no-referrer'
with sync_playwright() as p:
    browser = p.chromium.launch(executable_path='/usr/bin/chromium', headless=True, args=['--no-sandbox'])
    page = browser.new_page(viewport={'width': 390, 'height': 844}, accept_downloads=True)
    # Optional verified transport for cloud environments whose browser lacks proxy CA trust.
    # Every request still reaches the public host with Python's normal TLS verification.
    if os.getenv('VERIFIED_HTTPS_RELAY') == '1':
        def relay(route):
            request = route.request
            headers = {k: v for k, v in request.headers.items() if k.lower() not in ['host', 'content-length', 'accept-encoding']}
            headers['X-Factory-Test'] = '1'
            req = urllib.request.Request(request.url, data=request.post_data_buffer, headers=headers, method=request.method)
            try:
                response = urllib.request.urlopen(req, timeout=30)
            except urllib.error.HTTPError as error:
                response = error
            with response:
                headers = {k: v for k, v in response.headers.items() if k.lower() not in ['transfer-encoding', 'content-encoding', 'content-length']}
                route.fulfill(status=response.status, headers=headers, body=response.read())
        page.route(base + '/**', relay)
    errors = []
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.set_default_timeout(15000)
    page.goto(base)
    page.locator('#sample').click()
    page.locator('#preview').click()
    page.locator('#downloads').wait_for(state='visible')
    assert page.locator('.finding').count() == 5
    findings = page.locator('#findings').inner_text()
    for term in ['Numeric requirement mismatch', 'Unsupported process claim', 'Missing coverage commitment', 'Next action:']:
        assert term in findings, term
    assert page.locator('#purchase').is_hidden()
    for button in ['download-html', 'download-csv']:
        with page.expect_download() as result:
            page.locator('#' + button).click()
        text = Path(result.value.path()).read_text()
        for expected in ['60 minutes', '99.5%', 'Next action']:
            assert expected in text
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
    page.set_viewport_size({'width': 1280, 'height': 900})
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
    page.screenshot(path='/tmp/proposal-preflight-worker.png', full_page=True)
    page.once('dialog', lambda dialog: dialog.accept())
    page.locator('#clear').click()
    assert not page.locator('#proposal').input_value()
    assert page.evaluate('sessionStorage.getItem("preflight-draft-v1")') is None
    assert not errors, errors
    page.once('dialog', lambda dialog: dialog.accept())
    page.locator('#flag-problem').click()
    page.wait_for_function('() => document.getElementById("message").textContent.includes("Problem signal recorded")')
    browser.close()
print('PASS: Worker headers, disabled payments, desktop/mobile analysis, structured findings, full downloads and clear-data journey.')
