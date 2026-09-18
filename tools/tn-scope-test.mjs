/**
 * Verifies the Tamil Nadu scoping and the disaster record, in a browser.
 *
 * The three claims worth checking are ones a typecheck cannot see: that the
 * district grid filtered 641 polygons down to one state, that a clicked point
 * surfaces the real events recorded for that district, and that the panel
 * which used to show fabricated "ground-truth training" figures now shows
 * sourced ones.
 */
import puppeteer from 'puppeteer-core';

const CHROME = String.raw`C:\Program Files\Google\Chrome\Application\chrome.exe`;
const URL = process.argv[2] ?? 'http://localhost:4318/';

const b = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  protocolTimeout: 240000,
  args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-gl=swiftshader'],
});
const page = await b.newPage();
await page.setViewport({ width: 1680, height: 1050 });

const errs = [];
page.on('pageerror', (e) => errs.push(`PAGEERROR ${e.message}`));
page.on('console', (m) => {
  if (m.type() === 'error') errs.push(m.text());
});
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 90000 });
await wait(3500);
await page.evaluate(() => {
  Array.from(document.querySelectorAll('button'))
    .find((b) => /^skip$/i.test((b.textContent || '').trim()))?.click();
});
await wait(800);
await page.evaluate(() => {
  Array.from(document.querySelectorAll('button'))
    .find((b) => /continue as guest/i.test(b.textContent || ''))?.click();
});
await wait(2500);

// --- city selector is scoped ----------------------------------------------
const cities = await page.evaluate(() => {
  const sel = document.querySelector('select');
  return sel ? Array.from(sel.options).map((o) => o.textContent.trim()) : null;
});
console.log('cities offered:', JSON.stringify(cities));

// --- district grid --------------------------------------------------------
await page.evaluate(() => {
  const tab = Array.from(document.querySelectorAll('[role="tab"], button')).find((t) =>
    /tamil nadu grid|district grid/i.test(t.textContent || '')
  );
  tab?.click();
});
await wait(20000);

const grid = await page.evaluate(() => {
  const counts = document.querySelector('#national-grid-map .font-mono')?.textContent?.trim();
  return {
    canvas: !!document.querySelector('.maplibregl-canvas'),
    districtCount: counts,
    heading: document.querySelector('#national-grid-map h3')?.textContent?.trim(),
    listed: document.querySelectorAll('#national-grid-map ol li button').length,
  };
});
console.log('district grid:', JSON.stringify(grid));

// --- historical record tab -------------------------------------------------
await page.evaluate(() => {
  const tab = Array.from(document.querySelectorAll('[role="tab"], button')).find((t) =>
    /data streams/i.test(t.textContent || '')
  );
  tab?.click();
});
await wait(2500);
await page.evaluate(() => {
  Array.from(document.querySelectorAll('button'))
    .find((b) => /historical/i.test(b.textContent || ''))?.click();
});
await wait(1800);

const record = await page.evaluate(() => {
  const txt = document.body.innerText;
  return {
    honestNote: /this is a record, not a training set/i.test(txt),
    oldFalseClaim: /machine learning ground-truth training/i.test(txt),
    fabricatedCause: /chembarambakkam reservoir release into adyar/i.test(txt),
    sourceLinks: document.querySelectorAll('a[href*="sansad.in"], a[href*="pib.gov.in"], a[href*="mha.gov.in"]').length,
    events: document.querySelectorAll('ul li').length,
    sourcesDiffer: /sources differ/i.test(txt),
    fengalRain: /500 mm/.test(txt),
  };
});
console.log('disaster record:', JSON.stringify(record, null, 2));

// --- precedent inside the prediction --------------------------------------
await page.evaluate(() => {
  const tab = Array.from(document.querySelectorAll('[role="tab"], button')).find((t) =>
    /inundation map/i.test(t.textContent || '')
  );
  tab?.click();
});
await wait(2500);
await page.evaluate(() =>
  document.querySelector('#leaflet-flood-map-wrapper')?.scrollIntoView({ block: 'center' })
);
await wait(1500);

const box = await page.evaluate(() => {
  const el = document.querySelector('.leaflet-container');
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { x: r.x, y: r.y, w: r.width, h: r.height };
});
if (!box) {
  console.log('precedent: SKIPPED - map tab did not open');
  console.log('errors:', [...new Set(errs)].slice(0, 6));
  await b.close();
  process.exit(0);
}
await page.mouse.click(Math.round(box.x + box.w * 0.55), Math.round(box.y + box.h * 0.45));
for (let i = 0; i < 40; i++) {
  await wait(700);
  if (await page.evaluate(() => /standing water at/i.test(document.body.innerText))) break;
}

const precedent = await page.evaluate(() => {
  const txt = document.body.innerText;
  const m = txt.match(/recorded here before\s*\n\s*nearest:\s*([^\n]+)\n([\s\S]{0,260})/i);
  return {
    present: /recorded here before/i.test(txt),
    district: m ? m[1].trim() : null,
    body: m ? m[2].replace(/\n/g, ' | ').slice(0, 200) : null,
    disclaimer: /past events, not a model input/i.test(txt),
  };
});
console.log('precedent:', JSON.stringify(precedent, null, 2));

console.log('errors:', [...new Set(errs)].slice(0, 6));
await page.screenshot({ path: '../tn-scope.png' });
await b.close();
