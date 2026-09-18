/** Checks that base tiles actually load and paint, per basemap. */
import puppeteer from 'puppeteer-core';

const CHROME = String.raw`C:\Program Files\Google\Chrome\Application\chrome.exe`;
const b = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  protocolTimeout: 240000,
  args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-gl=swiftshader'],
});
const page = await b.newPage();
await page.setViewport({ width: 1400, height: 900, deviceScaleFactor: 2 });

const failed = [];
page.on('requestfailed', (r) => {
  if (/arcgisonline/.test(r.url())) failed.push(r.url().slice(0, 80));
});
const codes = new Map();
page.on('response', (r) => {
  if (/arcgisonline/.test(r.url())) {
    codes.set(r.status(), (codes.get(r.status()) ?? 0) + 1);
  }
});

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
await wait(1500);

for (const name of ['Command', 'Satellite', 'Elevation', 'Streets']) {
  codes.clear();
  failed.length = 0;
  await page.evaluate((n) => {
    Array.from(document.querySelectorAll('[role="radio"]'))
      .find((b) => (b.textContent || '').trim() === n)
      ?.click();
  }, name);
  await wait(7000);

  const state = await page.evaluate(() => {
    const panes = document.querySelectorAll('.leaflet-tile-pane .leaflet-layer');
    const tiles = Array.from(document.querySelectorAll('.leaflet-tile-pane img.leaflet-tile'));
    const loaded = tiles.filter((t) => t.complete && t.naturalWidth > 0);
    return {
      layers: panes.length,
      tiles: tiles.length,
      loaded: loaded.length,
      sample: tiles[0]?.src?.slice(0, 70) ?? null,
      sampleNatural: tiles[0] ? `${tiles[0].naturalWidth}x${tiles[0].naturalHeight}` : null,
      sampleShown: tiles[0]
        ? `${Math.round(tiles[0].getBoundingClientRect().width)}px op:${
            getComputedStyle(tiles[0]).opacity
          }`
        : null,
      zoom: document.querySelector('.leaflet-container')?.__zoom ?? null,
    };
  });
  console.log(
    name.padEnd(10),
    JSON.stringify(state),
    'http:',
    JSON.stringify(Object.fromEntries(codes)),
    failed.length ? `FAILED ${failed.length}: ${failed[0]}` : ''
  );
}

await b.close();
