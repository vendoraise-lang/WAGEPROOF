# Optional browser checks; requires Python Playwright and system Chromium. No real payments.
import subprocess, os, time, urllib.request, atexit
from pathlib import Path
root=Path(__file__).resolve().parents[1]
processes=[]
for entry,port in [('server.js',3100),('tools/smoke-fixture.mjs',3101)]:
    env={**os.environ,'PORT':str(port),'PUBLIC_BASE_URL':f'http://127.0.0.1:{port}','STRIPE_SECRET_KEY':'','STRIPE_PRICE_ID':'','APP_SECRET':''}
    processes.append(subprocess.Popen(['node',entry],cwd=root,env=env,stdout=subprocess.DEVNULL))
def cleanup():
    for proc in processes:
        proc.terminate()
        try: proc.wait(timeout=3)
        except subprocess.TimeoutExpired: proc.kill()
atexit.register(cleanup)
for port in [3100,3101]:
    for attempt in range(50):
        try:
            urllib.request.urlopen(f'http://127.0.0.1:{port}/health',timeout=1).close()
            break
        except Exception: time.sleep(0.1)
    else: raise RuntimeError('Smoke server did not start')
from playwright.sync_api import sync_playwright
from pathlib import Path
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
 page=browser.new_page(viewport={'width':1280,'height':900},accept_downloads=True)
 errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 page.set_default_timeout(8000);page.goto('http://127.0.0.1:3100');page.locator('#sample').click();page.locator('#preview').click();page.locator('.finding').nth(2).wait_for()
 assert page.locator('.finding').count()==3
 assert page.locator('#checkout').is_disabled()
 page.screenshot(path='/tmp/preflight-desktop.png',full_page=True)
 page.set_viewport_size({'width':390,'height':844});page.screenshot(path='/tmp/preflight-mobile.png',full_page=True)
 assert page.evaluate('document.documentElement.scrollWidth <= window.innerWidth')
 assert not errors,errors
 page.close()
 page=browser.new_page(viewport={'width':390,'height':844},accept_downloads=True)
 page.on('pageerror',lambda e:errors.append(str(e)))
 page.route('https://checkout.stripe.com/**',lambda route:route.fulfill(status=302,headers={'Location':'http://127.0.0.1:3101/?checkout=cs_test_browserfixture123456'}))
 page.goto('http://127.0.0.1:3101');page.locator('#sample').click()
 page.locator('#requirements').fill(page.locator('#requirements').input_value()+'\n=HYPERLINK("https://evil.example")\n<script>alert(1)</script>')
 page.locator('#preview').click();page.locator('.finding').nth(2).wait_for();page.locator('#checkout').click()
 page.wait_for_url('**/?checkout=**');page.locator('#downloads').wait_for(state='visible')
 assert page.locator('.finding').count()==6
 assert page.locator('#message').inner_text().startswith('Test payment verified')
 with page.expect_download() as d:page.locator('#download-html').click()
 html=Path(d.value.path()).read_text();assert '&lt;script&gt;' in html;assert '<script>alert' not in html
 with page.expect_download() as d:page.locator('#download-csv').click()
 csv=Path(d.value.path()).read_text();assert "' =HYPERLINK" not in csv;assert "'=HYPERLINK" in csv
 page.reload();page.locator('#downloads').wait_for(state='visible');assert page.locator('.finding').count()==6
 assert page.evaluate('document.documentElement.scrollWidth <= window.innerWidth')
 page.once('dialog',lambda d:d.accept());page.locator('#clear').click();assert page.locator('#proposal').input_value()==''
 assert page.evaluate('sessionStorage.getItem("preflight-draft-v1")') is None
 assert not errors,errors
 print('PASS: desktop/mobile preview, disabled unconfigured checkout, mocked paid browser redirect, full report, HTML/CSV downloads, XSS escaping, CSV formula safety, reload recovery, clear-data action, no overflow or JS errors.')
 browser.close()
