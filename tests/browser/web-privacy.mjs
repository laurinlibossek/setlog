// The privacy pages next to the web app (privacy.html, datenschutz.html) and
// the Settings link to them. With the service worker running, the pages must
// come from the network, not the cached app shell. 4 checks.
import assert from 'node:assert/strict';
import { devices, launch, WEB as BASE, waitReady } from './env.mjs';
import { CONTACT_EMAIL, SUPPORT_URL } from '../../setlog/js/core/links.js';

const browser = await launch();
let passed = 0;
const ok = (...msg) => { passed++; console.log('PASS', ...msg); };

async function newPage(opts = {}) {
  const ctx = await browser.newContext({ ...devices['iPhone 13'], locale: 'en-US', serviceWorkers: 'block', ...opts });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  return { ctx, page, errors };
}
const settingsLink = async (page, lang) => {
  await page.evaluate((l) => localStorage.setItem('setlog.lang', l), lang);
  await page.goto(BASE);
  await waitReady(page);
  await page.evaluate(async () => { const ui = await import('/js/ui.js'); ui.setTab('profile'); ui.push('settings'); });
  const a = page.locator('#privacy');
  await a.waitFor();
  return { href: await a.getAttribute('href'), target: await a.getAttribute('target'), text: (await a.innerText()).trim() };
};

// 1. the Settings row, in both languages
{
  const { ctx, page, errors } = await newPage();
  await page.goto(BASE);
  assert.deepEqual(await settingsLink(page, 'en'), { href: 'privacy.html', target: '_blank', text: 'Privacy policy' });
  assert.deepEqual(await settingsLink(page, 'de'), { href: 'datenschutz.html', target: '_blank', text: 'Datenschutzerklärung' });
  ok('Settings → Privacy policy links to the page in the app’s language');
  assert.deepEqual(errors, []);
  await ctx.close();
}

// 2. both pages, light and dark, with the contact link
for (const scheme of ['light', 'dark']) {
  const { ctx, page, errors } = await newPage({ colorScheme: scheme });
  for (const [file, title, other] of [['privacy.html', 'Privacy policy', 'Deutsch'], ['datenschutz.html', 'Datenschutzerklärung', 'English']]) {
    await page.goto(BASE + file);
    assert.equal(await page.locator('h1').innerText(), title);
    assert.equal(await page.locator('.lang a').innerText(), other);
    const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    assert.equal(bg, scheme === 'dark' ? 'rgb(11, 13, 17)' : 'rgb(241, 243, 246)', `${file} ${scheme} background`);
    // the page scrolls (the app shell's styles lock the body)
    assert.ok(await page.evaluate(() => document.scrollingElement.scrollHeight > innerHeight + 200));
    await page.evaluate(() => scrollTo(0, 99999));
    assert.ok(await page.evaluate(() => scrollY > 200), `${file} scrolls`);
    // the address comes from core/links.js; while it's the placeholder, the issues page stands in
    const hrefs = await page.locator('a[data-contact]').evaluateAll((as) => as.map((a) => a.href));
    assert.equal(hrefs.length, 2);
    for (const h of hrefs) assert.equal(h, CONTACT_EMAIL.startsWith('[') ? SUPPORT_URL : `mailto:${CONTACT_EMAIL}`);
  }
  ok(`both pages in ${scheme}: title, language switch, colours, scrolling, contact link`);
  assert.deepEqual(errors, []);
  await ctx.close();
}

// 3. with the service worker in charge, the pages are themselves, and the app still opens offline
{
  const { ctx, page, errors } = await newPage({ serviceWorkers: 'allow' });
  await page.goto(BASE);
  await waitReady(page);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await waitReady(page);
  assert.ok(await page.evaluate(() => !!navigator.serviceWorker.controller), 'the service worker controls the page');
  await page.goto(BASE + 'datenschutz.html');
  assert.equal(await page.locator('h1').innerText(), 'Datenschutzerklärung');
  await page.goto(BASE + 'privacy.html#top');
  assert.equal(await page.locator('h1').innerText(), 'Privacy policy');
  await ctx.setOffline(true);
  await page.goto(BASE);
  await waitReady(page);
  ok('with the service worker: both pages load as pages, and the app still opens offline');
  await ctx.setOffline(false);
  assert.deepEqual(errors.filter((e) => !/ERR_INTERNET_DISCONNECTED|Failed to fetch/.test(e)), []);
  await ctx.close();
}

await browser.close();
console.log(`\n${passed} checks passed`);
