/**
 * Drives the click-to-predict flow in a real browser.
 *
 * Typecheck and curl have both cleared defects in this map before that only a
 * rendered page exposed, so the acceptance test is what the pixels do.
 *
 * Two traps this script exists to remember:
 *  - the map sits well below the fold, so every coordinate is meaningless
 *    until it has been scrolled into view;
 *  - innerText reflects text-transform, so labels styled `uppercase` come
 *    back uppercase and every match here is case-insensitive.
 */
import puppeteer from 'puppeteer-core';

const CHROME = String.raw`C:\Program Files\Google\Chrome\Application\chrome.exe`;
const URL = process.argv[2] ?? 'http://localhost:4317/';

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
const scrollToMap = () =>
  page.evaluate(() =>
    document.querySelector('#leaflet-flood-map-wrapper')?.scrollIntoView({ block: 'center' })
  );

await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 90000 });
await wait(3500);

await page.evaluate(() => {
  Array.from(document.querySelectorAll('button'))
    .find((b) => /^skip$/i.test((b.textContent || '').trim()))
    ?.click();
});
await wait(800);
for (let i = 0; i < 3; i++) {
  const clicked = await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('button')).find((b) =>
      /continue as guest/i.test(b.textContent || '')
    );
    if (btn) { btn.click(); return true; }
    return false;
  });
  await wait(1200);
  if (clicked) break;
}

await page.evaluate(() => {
  const tab = Array.from(document.querySelectorAll('[role="tab"], button')).find((t) =>
    /^\s*map|flood map/i.test(t.textContent || '')
  );
  tab?.click();
});
await wait(2500);
await scrollToMap();
await wait(1500);

// --- map size -------------------------------------------------------------
const size = await page.evaluate(() => {
  const el = document.querySelector('.leaflet-container');
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return {
    w: Math.round(r.width),
    h: Math.round(r.height),
    tiles: document.querySelectorAll('.leaflet-tile').length,
  };
});
console.log('map container:', JSON.stringify(size));

const hint = await page.evaluate(() =>
  /click anywhere to predict flooding there/i.test(document.body.innerText)
);
console.log('click hint visible:', hint);

// --- click the map --------------------------------------------------------
const box = await page.evaluate(() => {
  const r = document.querySelector('.leaflet-container').getBoundingClientRect();
  return { x: r.x, y: r.y, w: r.width, h: r.height };
});
await page.mouse.click(Math.round(box.x + box.w * 0.22), Math.round(box.y + box.h * 0.2));

let ready = false;
for (let i = 0; i < 40; i++) {
  await wait(700);
  ready = await page.evaluate(() => /standing water at/i.test(document.body.innerText));
  if (ready) break;
}
console.log('prediction rendered:', ready);

const read = () =>
  page.evaluate(() => {
    const txt = document.body.innerText;
    const grab = (re) => (txt.match(re) || [])[1]?.trim() ?? null;
    return {
      label: grab(/point prediction\s*\n\s*([^\n]+)/i),
      hour: grab(/standing water at \+(\d+)h/i),
      peak: grab(/peak depth\s*\n\s*([^\n]+)/i),
      ttf: grab(/time to flood\s*\n\s*([^\n]+)/i),
      drains: grab(/drains away\s*\n\s*([^\n]+)/i),
      threshold: grab(/floods above\s*\n\s*([^\n]+)/i),
      drivers: document.querySelectorAll('[role="meter"][aria-label*="contribution"]').length,
      rings: document.querySelectorAll('.flood-water').length,
      pinLabel: document.querySelector('.predict-pin-label')?.textContent ?? null,
      curveBars: document.querySelectorAll('.flood-water').length
        ? document.querySelectorAll('#leaflet-flood-map-wrapper svg[role="img"] rect').length
        : 0,
      mode: Array.from(document.querySelectorAll('[role="radio"][aria-checked="true"]'))
        .map((e) => e.textContent)
        .find((t) => /forecast|what-if/i.test(t || '')),
    };
  });

console.log('panel:', JSON.stringify(await read(), null, 2));

// --- scrub the timeline ---------------------------------------------------
const before = await read();
await page.evaluate(() => {
  const r = Array.from(document.querySelectorAll('input[type=range]')).find((i) =>
    /hour of the simulation/i.test(i.getAttribute('aria-label') || '')
  );
  if (!r) throw new Error('no hour slider');
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  setter.call(r, '0');
  r.dispatchEvent(new Event('input', { bubbles: true }));
  r.dispatchEvent(new Event('change', { bubbles: true }));
});
await wait(900);
const after = await read();
console.log(
  `scrub hour ${before.hour} -> ${after.hour} : pin ${before.pinLabel} -> ${after.pinLabel}, rings ${before.rings} -> ${after.rings}`
);

// --- play -----------------------------------------------------------------
const playBox = await page.evaluate(() => {
  const b = Array.from(document.querySelectorAll('button')).find((b) =>
    /play simulation/i.test(b.getAttribute('aria-label') || '')
  );
  if (!b) return null;
  const r = b.getBoundingClientRect();
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
});
const playFrom = (await read()).hour;
if (playBox) await page.mouse.click(playBox.x, playBox.y);
const ticks = [];
for (let i = 0; i < 9; i++) {
  await wait(300);
  ticks.push(await page.evaluate(
    () => (document.body.innerText.match(/standing water at \+(\d+)h/i) || [])[1]
  ));
}
console.log('  tick trace:', ticks.join(','));
const playedTo = (await read()).hour;
const stillPlaying = await page.evaluate(() =>
  Array.from(document.querySelectorAll('button')).some((b) =>
    /pause simulation/i.test(b.getAttribute('aria-label') || '')
  )
);
console.log(`play: hour ${playFrom} -> ${playedTo} (still running: ${stillPlaying})`);

// --- the rainfall slider drives the prediction ----------------------------
const rainBefore = await read();
await page.evaluate(() => {
  const r = Array.from(document.querySelectorAll('input[type=range]')).find((i) =>
    /rainfall|scenario/i.test(i.getAttribute('aria-label') || '') ||
    i.classList.contains('fluid-slider') && i.max === '200'
  );
  if (!r) throw new Error('no rainfall slider');
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  setter.call(r, '180');
  r.dispatchEvent(new Event('input', { bubbles: true }));
  r.dispatchEvent(new Event('change', { bubbles: true }));
});
await wait(1200);
const rainAfter = await read();
console.log(
  `rainfall 38 -> 180 mm/hr : peak ${rainBefore.peak} -> ${rainAfter.peak}, ttf ${rainBefore.ttf} -> ${rainAfter.ttf}`
);

// --- live / what-if toggle ------------------------------------------------
await page.evaluate(() => {
  Array.from(document.querySelectorAll('[role="radio"]'))
    .find((b) => /live forecast/i.test(b.textContent || ''))
    ?.click();
});
await wait(1500);
const live = await read();
const quiet = await page.evaluate(() =>
  /no standing water expected here/i.test(document.body.innerText)
);
console.log(`live mode: peak ${live.peak}, mode "${live.mode}", quiet notice ${quiet}`);

// --- fullscreen -----------------------------------------------------------
await page.evaluate(() => {
  Array.from(document.querySelectorAll('button'))
    .find((b) => /^expand$/i.test((b.textContent || '').trim()))
    ?.click();
});
await wait(1800);
const full = await page.evaluate(() => {
  const r = document.querySelector('.leaflet-container').getBoundingClientRect();
  return { w: Math.round(r.width), h: Math.round(r.height), vh: window.innerHeight };
});
console.log('fullscreen:', JSON.stringify(full));
await page.screenshot({ path: '../predict-full.png' });

await page.keyboard.press('Escape');
await wait(1400);
const restored = await page.evaluate(() =>
  Math.round(document.querySelector('.leaflet-container').getBoundingClientRect().height)
);
console.log('after Escape height:', restored);

await scrollToMap();
await wait(1400);
await page.screenshot({ path: '../predict-map.png' });

console.log('errors:', [...new Set(errs)].slice(0, 6));
await b.close();
