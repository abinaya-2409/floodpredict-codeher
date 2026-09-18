/**
 * Drives the Windy-style weather map in a real browser.
 *
 * The things worth checking here are all invisible to a typecheck: that the
 * grid actually loaded, that each field paints something onto the canvas,
 * that scrubbing the timeline changes what is drawn, and that the wind
 * particles move.
 */
import puppeteer from 'puppeteer-core';

const CHROME = String.raw`C:\Program Files\Google\Chrome\Application\chrome.exe`;
const URL = process.argv[2] ?? 'http://localhost:4320/';

const b = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  protocolTimeout: 240000,
  args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-gl=swiftshader'],
});
const page = await b.newPage();
await page.setViewport({ width: 1680, height: 1050, deviceScaleFactor: 2 });

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
await page.evaluate(() =>
  document.querySelector('#tn-weather-map')?.scrollIntoView({ block: 'center' })
);

// The grid is two forecast requests for 720 cells; give it room.
let loaded = false;
for (let i = 0; i < 50; i++) {
  await wait(1000);
  loaded = await page.evaluate(
    () => !/Fetching forecast|Loading grid/i.test(document.body.innerText)
  );
  if (loaded) break;
}
console.log('grid loaded:', loaded);

/** Fraction of canvas pixels that are not fully transparent. */
const coverage = (selector) =>
  page.evaluate((sel) => {
    const c = document.querySelector(sel);
    if (!c) return null;
    const ctx = c.getContext('2d');
    if (!ctx || !c.width || !c.height) return null;
    const { data } = ctx.getImageData(0, 0, c.width, c.height);
    let painted = 0;
    for (let i = 3; i < data.length; i += 4 * 17) if (data[i] > 8) painted++;
    return Number((painted / (data.length / (4 * 17))).toFixed(3));
  }, selector);

const FIELD = '#tn-weather-map .leaflet-wxField-pane canvas';
const PARTICLES = '#tn-weather-map .leaflet-wxParticles-pane canvas';

console.log('canvases:', await page.evaluate((f, p) => ({
  field: !!document.querySelector(f),
  particles: !!document.querySelector(p),
}), FIELD, PARTICLES));

// --- each field paints ------------------------------------------------------
for (const label of ['Flood depth', 'Rainfall', 'Wind', 'Temperature']) {
  await page.evaluate((l) => {
    Array.from(document.querySelectorAll('#tn-weather-map [role="radio"]'))
      .find((b) => (b.textContent || '').trim() === l)
      ?.click();
  }, label);
  await wait(1400);
  const cov = await coverage(FIELD);
  const legend = await page.evaluate(() => {
    const m = document.body.innerText.match(/([A-Za-z ]+)\n(mm\/hr|cm|km\/h|°C)/);
    return m ? `${m[1].trim()} (${m[2]})` : null;
  });
  console.log(`  ${label.padEnd(12)} coverage ${String(cov).padStart(5)}  legend ${legend}`);
}

// --- the storm scenario makes the flood field appear ------------------------
await page.evaluate(() => {
  Array.from(document.querySelectorAll('#tn-weather-map [role="radio"]'))
    .find((b) => (b.textContent || '').trim() === 'Flood depth')
    ?.click();
});
await wait(1200);
const floodLive = await coverage(FIELD);
const emptyNotice = await page.evaluate(() =>
  /no standing water anywhere in tamil nadu/i.test(document.body.innerText)
);
await page.evaluate(() => {
  Array.from(document.querySelectorAll('#tn-weather-map [role="radio"]'))
    .find((b) => (b.textContent || '').trim() === '×8')
    ?.click();
});
await wait(2000);
const floodScenario = await coverage(FIELD);
const scenarioBadge = await page.evaluate(() =>
  /scenario: forecast rainfall/i.test(document.body.innerText)
);
console.log(
  `flood: live coverage ${floodLive} (empty notice ${emptyNotice}) -> x8 coverage ${floodScenario} (badge ${scenarioBadge})`
);

// --- the timeline changes the field ----------------------------------------
await page.evaluate(() => {
  Array.from(document.querySelectorAll('#tn-weather-map [role="radio"]'))
    .find((b) => (b.textContent || '').trim() === 'Rainfall')
    ?.click();
});
await wait(1200);

const setHour = (h) =>
  page.evaluate((hh) => {
    const r = Array.from(document.querySelectorAll('input[type=range]')).find((i) =>
      /forecast hour/i.test(i.getAttribute('aria-label') || '')
    );
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(r, String(hh));
    r.dispatchEvent(new Event('input', { bubbles: true }));
    r.dispatchEvent(new Event('change', { bubbles: true }));
  }, h);

const sig = () =>
  page.evaluate((sel) => {
    const c = document.querySelector(sel);
    const ctx = c.getContext('2d');
    const { data } = ctx.getImageData(0, 0, c.width, c.height);
    let sum = 0;
    for (let i = 0; i < data.length; i += 4 * 97) sum += data[i] + data[i + 1] * 2 + data[i + 3] * 3;
    return sum;
  }, FIELD);

await setHour(0);
await wait(1100);
const a = await sig();
await setHour(30);
await wait(1100);
const c = await sig();
const stamp = await page.evaluate(
  () => (document.body.innerText.match(/\+(\d+)h/g) || []).slice(-1)[0]
);
console.log(`timeline: hour 0 sig ${a} -> hour 30 sig ${c} (changed: ${a !== c}, label ${stamp})`);

// --- wind particles animate -------------------------------------------------
await page.evaluate(() => {
  Array.from(document.querySelectorAll('#tn-weather-map [role="radio"]'))
    .find((b) => (b.textContent || '').trim() === 'Wind')
    ?.click();
});
await wait(3000);
const p1 = await coverage(PARTICLES);
await wait(1500);
const p2 = await coverage(PARTICLES);
console.log(`particles: coverage ${p1} -> ${p2} (drawing: ${(p1 ?? 0) > 0})`);

// --- click for a point forecast --------------------------------------------
const box = await page.evaluate(() => {
  const r = document.querySelector('#tn-weather-map .leaflet-container').getBoundingClientRect();
  return { x: r.x, y: r.y, w: r.width, h: r.height };
});
await page.mouse.click(Math.round(box.x + box.w * 0.62), Math.round(box.y + box.h * 0.3));
let gotPoint = false;
for (let i = 0; i < 30; i++) {
  await wait(700);
  gotPoint = await page.evaluate(() => /standing water at/i.test(document.body.innerText));
  if (gotPoint) break;
}
console.log('point forecast on click:', gotPoint);

await page.evaluate(() => {
  Array.from(document.querySelectorAll('#tn-weather-map button'))
    .find((b) => /^expand$/i.test((b.textContent || '').trim()))?.click();
});
await wait(3000);
await page.screenshot({ path: '../weather-map.png' });

console.log('errors:', [...new Set(errs)].slice(0, 6));
await b.close();
