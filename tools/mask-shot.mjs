/** Captures the map zoomed out, to confirm only Tamil Nadu is visible. */
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
await page.setViewport({ width: 1600, height: 1000, deviceScaleFactor: 2 });
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
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
  document.querySelector('#leaflet-flood-map-wrapper')?.scrollIntoView({ block: 'center' })
);
await wait(1500);

// Fullscreen, then zoom all the way out - the case the user reported.
await page.evaluate(() => {
  Array.from(document.querySelectorAll('button'))
    .find((b) => /^expand$/i.test((b.textContent || '').trim()))?.click();
});
await wait(2000);

for (let i = 0; i < 8; i++) {
  await page.evaluate(() => {
    document.querySelector('.leaflet-control-zoom-out')?.click();
  });
  await wait(600);
}
await wait(7000);

const state = await page.evaluate(() => {
  const paths = document.querySelectorAll('.leaflet-pane path');
  const maskPane = document.querySelector('.leaflet-tnMask-pane');
  return {
    maskPaneExists: !!maskPane,
    maskPaths: maskPane ? maskPane.querySelectorAll('path').length : 0,
    labelPane: !!document.querySelector('.leaflet-tnLabels-pane'),
    totalPaths: paths.length,
    tiles: document.querySelectorAll('.leaflet-tile').length,
  };
});
console.log('mask state:', JSON.stringify(state));
await page.screenshot({ path: '../mask-zoomed-out.png' });

// And on satellite, where the mask has to work against bright imagery.
await page.evaluate(() => {
  Array.from(document.querySelectorAll('[role="radio"]'))
    .find((b) => (b.textContent || '').trim() === 'Satellite')?.click();
});
await wait(9000);
await page.screenshot({ path: '../mask-satellite.png' });

console.log('errors:', [...new Set(errs)].slice(0, 5));
await b.close();
