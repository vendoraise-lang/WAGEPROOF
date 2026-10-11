"""Verify the real Worker customer journey. Usage: python tools/worker-smoke.py HTTPS_URL."""
import json
import sys
import urllib.error
import urllib.request
from pathlib import Path
from playwright.sync_api import sync_playwright

base = sys.argv[1].rstrip('/') if len(sys.argv) > 1 else 'http://127.0.0.1:8787'
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
    browser.close()
print('PASS: Worker headers, disabled payments, desktop/mobile analysis, structured findings, full downloads and clear-data journey.')
