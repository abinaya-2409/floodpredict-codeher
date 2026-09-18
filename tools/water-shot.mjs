/** Captures the predicted water at depth, on each basemap, for visual review. */
import puppeteer from 'puppeteer-core';

const CHROME = String.raw`C:\Program Files\Google\Chrome\Application\chrome.exe`;
const b = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  protocolTimeout: 240000,
  args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-gl=swiftshader'],
});
const page = await b.newPage();
// deviceScaleFactor 2 so detectRetina is actually exercised.
await page.setViewport({ width: 1680, height: 1050, deviceScaleFactor: 2 });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

await page.goto('http://localhost:4317/', { waitUntil: 'domcontentloaded', timeout: 90000 });
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
  document.querySelector('#leaflet-flood-map-wrapper')?.scrollIntoView({ block: 'center' })
);
await wait(1200);

// Fullscreen first so the map is the whole frame.
await page.evaluate(() => {
  Array.from(document.querySelectorAll('button'))
    .find((b) => /^expand$/i.test((b.textContent || '').trim()))?.click();
});
await wait(2000);

// Zoom to a city block so the imagery is at a zoom worth judging.
await page.evaluate(() => {
  const el = document.querySelector('.leaflet-container');
  const r = el.getBoundingClientRect();
  return { x: r.x, y: r.y, w: r.width, h: r.height };
});
const box = await page.evaluate(() => {
  const r = document.querySelector('.leaflet-container').getBoundingClientRect();
  return { x: r.x, y: r.y, w: r.width, h: r.height };
});

// Click a point away from the ward polygons.
await page.mouse.click(Math.round(box.x + box.w * 0.3), Math.round(box.y + box.h * 0.35));
for (let i = 0; i < 30; i++) {
  await wait(700);
  if (await page.evaluate(() => /standing water at/i.test(document.body.innerText))) break;
}

// Crank the storm so there is real water to look at.
await page.evaluate(() => {
  const r = document.querySelector('#whatif-intensity');
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  setter.call(r, '200');
  r.dispatchEvent(new Event('input', { bubbles: true }));
  const d = document.querySelector('#whatif-duration');
  setter.call(d, '12');
  d.dispatchEvent(new Event('input', { bubbles: true }));
});
await wait(1200);

// Park the scrubber on the peak.
await page.evaluate(() => {
  const peak = (document.body.innerText.match(/peak depth[\s\S]*?at \+(\d+)h/i) || [])[1];
  const r = Array.from(document.querySelectorAll('input[type=range]')).find((i) =>
    /hour of the simulation/i.test(i.getAttribute('aria-label') || '')
  );
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  setter.call(r, peak ?? '8');
  r.dispatchEvent(new Event('input', { bubbles: true }));
});
await wait(1200);

console.log(
  'state:',
  await page.evaluate(() => {
    const t = document.body.innerText;
    return {
      hour: (t.match(/standing water at \+(\d+)h/i) || [])[1],
      depth: (t.match(/standing water at[\s\S]*?\n(\d+)\ncm/i) || [])[1],
      peak: (t.match(/peak depth\s*\n\s*([^\n]+)/i) || [])[1],
      rings: document.querySelectorAll('.flood-water').length,
    };
  })
);

for (const name of ['Command', 'Satellite', 'Streets']) {
  await page.evaluate((n) => {
    Array.from(document.querySelectorAll('[role="radio"]'))
      .find((b) => (b.textContent || '').trim() === n)
      ?.click();
  }, name);
  await wait(9000);
  const st = await page.evaluate(() => {
    const m = document.querySelector('.leaflet-container');
    const tiles = Array.from(document.querySelectorAll('.leaflet-tile-pane img.leaflet-tile'));
    const loaded = tiles.filter((t) => t.complete && t.naturalWidth > 0);
    const vis = tiles.filter((t) => {
      const r = t.getBoundingClientRect();
      return r.width > 0 && r.right > 0 && r.left < window.innerWidth && r.bottom > 0 && r.top < window.innerHeight;
    });
    return {
      tiles: tiles.length,
      loaded: loaded.length,
      onScreen: vis.length,
      onScreenLoaded: vis.filter((t) => t.complete && t.naturalWidth > 0).length,
      paneTransform: getComputedStyle(document.querySelector('.leaflet-tile-pane')).transform,
      containerCls: m?.className?.slice(0, 90),
      sampleSrc: tiles[0]?.src?.slice(-28),
    };
  });
  await page.screenshot({ path: `../water-${name.toLowerCase()}.png` });
  console.log('shot', name, JSON.stringify(st));
}

await b.close();
