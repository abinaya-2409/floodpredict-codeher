/**
 * Verifies the app installs on a phone and still works with the network off.
 *
 * Run against a PRODUCTION build (`npm run build && npm start`), not the dev
 * server: the service worker only registers in prod, and Vite's dev module
 * URLs are not what ships.
 *
 * The offline check is the one that matters. It loads the app once with the
 * network up so the caches fill, then sets Network.emulateNetworkConditions
 * offline - which makes every request fail exactly as it would in a flood
 * with the towers down - and reloads. If the app still renders, it works
 * offline. Anything less than that is a guess.
 *
 * Usage: node tools/pwa-test.mjs [url]
 */
import puppeteer from 'puppeteer-core';

const CHROME = String.raw`C:\Program Files\Google\Chrome\Application\chrome.exe`;
const BASE = process.argv[2] ?? 'http://localhost:4380/';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const failures = [];
const check = (ok, label, detail = '') => {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` - ${detail}` : ''}`);
  if (!ok) failures.push(label);
  return ok;
};

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  protocolTimeout: 180000,
  args: [
    '--no-sandbox',
    '--enable-unsafe-swiftshader',
    '--use-gl=swiftshader',
    '--disable-background-timer-throttling',
    '--disable-renderer-backgrounding',
  ],
});

const page = await browser.newPage();
// A mid-range Android in portrait: the device most likely to open this.
await page.emulate({
  name: 'Pixel 7',
  userAgent:
    'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Mobile Safari/537.36',
  viewport: { width: 412, height: 915, deviceScaleFactor: 2.6, isMobile: true, hasTouch: true },
});

const errors = [];
page.on('pageerror', (e) => {
  if (/websocket|vite/i.test(e.message)) return;
  errors.push(e.message.slice(0, 150));
});
page.on('console', (m) => {
  if (m.type() === 'error' && !/websocket|vite|favicon|Failed to load resource/i.test(m.text())) {
    errors.push(m.text().slice(0, 150));
  }
});

/*
 * The manifest and icons are fetched from inside the page rather than by
 * navigating to them.
 *
 * Navigating the page to a .webmanifest and two PNGs and then back left the
 * tab in a state where navigator.serviceWorker.ready never resolved, so the
 * run hung with no error at all - the registration was fine, the promise
 * simply never settled. Fetching keeps the document on the app throughout.
 */
console.log(`--- manifest and icons ---`);
await page.goto(BASE, { waitUntil: 'load', timeout: 90000 });

const assets = await page.evaluate(async () => {
  const read = async (path) => {
    const res = await fetch(path, { cache: 'no-store' });
    const type = res.headers.get('content-type') ?? '';
    return { ok: res.ok, status: res.status, type, body: type.includes('json') ? await res.json() : null };
  };
  return {
    manifest: await read('/manifest.webmanifest'),
    icon512: await read('/icons/icon-512.png'),
    appleIcon: await read('/icons/apple-touch-icon.png'),
  };
});

check(assets.manifest.ok, 'manifest is served', `HTTP ${assets.manifest.status}`);
const manifest = assets.manifest.body;
check(!!manifest, 'manifest parses as JSON');
if (manifest) {
  check(manifest.display === 'standalone', 'display is standalone', manifest.display);
  check(!!manifest.start_url, 'has a start_url', manifest.start_url);
  check(manifest.icons?.some((i) => i.sizes === '512x512' && i.purpose === 'any'), 'has a 512px icon');
  check(
    manifest.icons?.some((i) => i.purpose === 'maskable'),
    'has a maskable icon (Android crops the plain one)'
  );
}
check(
  assets.icon512.ok && assets.icon512.type.includes('png'),
  '/icons/icon-512.png is a real PNG',
  assets.icon512.type
);
check(
  assets.appleIcon.ok && assets.appleIcon.type.includes('png'),
  '/icons/apple-touch-icon.png is a real PNG',
  assets.appleIcon.type
);

console.log(`\n--- install metadata in the page ---`);
await page.goto(BASE, { waitUntil: 'load', timeout: 90000 });
const head = await page.evaluate(() => ({
  manifestHref: document.querySelector('link[rel="manifest"]')?.getAttribute('href') ?? null,
  appleIcon: document.querySelector('link[rel="apple-touch-icon"]')?.getAttribute('href') ?? null,
  appleCapable: document
    .querySelector('meta[name="apple-mobile-web-app-capable"]')
    ?.getAttribute('content'),
  appleTitle: document
    .querySelector('meta[name="apple-mobile-web-app-title"]')
    ?.getAttribute('content'),
  themeColor: document.querySelector('meta[name="theme-color"]')?.getAttribute('content'),
}));
check(head.manifestHref === '/manifest.webmanifest', 'page links the manifest', head.manifestHref);
// iPhone reads none of the manifest; these tags are the entire iOS story.
check(
  head.appleIcon?.endsWith('.png') === true,
  'apple-touch-icon is a PNG (iOS ignores SVG)',
  head.appleIcon
);
check(head.appleCapable === 'yes', 'apple-mobile-web-app-capable is set');
check(!!head.appleTitle, 'iOS home screen title is set', head.appleTitle);
check(!!head.themeColor, 'theme-color is set', head.themeColor);

console.log(`\n--- service worker ---`);
await wait(4000);
const sw = await page.evaluate(async () => {
  if (!('serviceWorker' in navigator)) return { supported: false };
  const reg = await navigator.serviceWorker.getRegistration();
  return {
    supported: true,
    registered: !!reg,
    scope: reg?.scope ?? null,
    active: !!reg?.active,
  };
});
check(sw.registered === true, 'service worker registered', sw.scope ?? 'none');

// Wait for it to control the page and for the caches to actually fill.
// Returning a boolean rather than the registration on purpose: puppeteer has
// to serialise whatever evaluate resolves to, and a ServiceWorkerRegistration
// is not serialisable, so returning it hangs the call until protocolTimeout.
const readyState = await page
  .evaluate(
    async () =>
      await Promise.race([
        navigator.serviceWorker.ready.then(() => 'ready'),
        new Promise((resolve) => setTimeout(() => resolve('timeout'), 20000)),
      ])
  )
  .catch((e) => `error: ${String(e).slice(0, 60)}`);
check(readyState === 'ready', 'service worker took control of the page', String(readyState));
await wait(6000);

const cacheState = await page.evaluate(async () => {
  const names = await caches.keys();
  const counts = {};
  for (const n of names) counts[n] = (await (await caches.open(n)).keys()).length;
  return counts;
});
console.log('  caches:', JSON.stringify(cacheState));
check(Object.keys(cacheState).length > 0, 'caches created');
check(
  Object.values(cacheState).reduce((a, b) => a + b, 0) > 3,
  'something was actually cached',
  `${Object.values(cacheState).reduce((a, b) => a + b, 0)} entries`
);

console.log(`\n--- with the network off ---`);
const cdp = await page.target().createCDPSession();
await cdp.send('Network.enable');
await cdp.send('Network.emulateNetworkConditions', {
  offline: true,
  latency: 0,
  downloadThroughput: 0,
  uploadThroughput: 0,
});

let offlineErr = null;
try {
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 45000 });
} catch (e) {
  offlineErr = String(e).slice(0, 90);
}
await wait(5000);

const offline = await page.evaluate(() => {
  const root = document.getElementById('root');
  const text = document.body.innerText || '';
  return {
    onLine: navigator.onLine,
    rootChildren: root?.children.length ?? 0,
    chars: text.length,
    // Chrome's own offline page, which would mean the cache did not save us.
    isChromeErrorPage: /ERR_INTERNET_DISCONNECTED|No internet|try again/i.test(text),
    hasAppText: /flood|ward|risk|chennai/i.test(text),
  };
});
check(!offlineErr, 'page reloads with no network', offlineErr ?? '');
check(offline.onLine === false, 'browser really is offline', String(offline.onLine));
check(!offline.isChromeErrorPage, 'not the browser error page');
check(offline.rootChildren > 0, 'app rendered from cache', `${offline.rootChildren} root children`);
check(offline.hasAppText, 'app content is present offline', `${offline.chars} chars of text`);

await page.screenshot({ path: '../pwa-offline.png' });

console.log(`\n--- back online ---`);
await cdp.send('Network.emulateNetworkConditions', {
  offline: false,
  latency: 0,
  downloadThroughput: -1,
  uploadThroughput: -1,
});
await page.reload({ waitUntil: 'load', timeout: 60000 });
await wait(3000);
check(
  await page.evaluate(() => (document.getElementById('root')?.children.length ?? 0) > 0),
  'still fine with the network back'
);

const unique = [...new Set(errors)];
check(unique.length === 0, 'no console errors', unique.slice(0, 3).join(' | '));

console.log(`\n${failures.length ? `FAILED: ${failures.join('; ')}` : 'ALL CHECKS PASSED'}`);
await browser.close();
process.exit(failures.length ? 1 : 0);
