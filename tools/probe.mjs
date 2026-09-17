import puppeteer from 'puppeteer-core';

const URL = process.argv[2] || 'https://floodpredict-codeher.vercel.app/';
const OUT = process.argv[3] || 'shot.png';

const browser = await puppeteer.launch({
  executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  headless: 'new',
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--window-size=1600,1000'],
});

const page = await browser.newPage();
await page.setViewport({ width: 1600, height: 1000, deviceScaleFactor: 1 });

const errors = [];
const tiles = { ok: 0, failed: [] };

page.on('console', (m) => {
  if (m.type() === 'error' || m.type() === 'warning') errors.push(`[${m.type()}] ${m.text()}`);
});
page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`));
page.on('requestfailed', (r) => {
  const u = r.url();
  if (/arcgisonline|cartocdn|tile/.test(u)) tiles.failed.push(`${r.failure()?.errorText} ${u}`);
  else errors.push(`[requestfailed] ${r.failure()?.errorText} ${u}`);
});
page.on('response', (r) => {
  const u = r.url();
  if (/arcgisonline|cartocdn/.test(u)) {
    if (r.status() === 200) tiles.ok++;
    else tiles.failed.push(`HTTP ${r.status()} ${u}`);
  }
});

await page.goto(URL, { waitUntil: 'networkidle2', timeout: 90000 });
await new Promise((r) => setTimeout(r, 6000));

const diag = await page.evaluate(() => {
  const c = document.querySelector('.leaflet-container');
  const imgs = Array.from(document.querySelectorAll('.leaflet-tile'));
  const loaded = imgs.filter((i) => i.complete && i.naturalWidth > 0);
  const pane = document.querySelector('.leaflet-tile-pane');
  return {
    mapPresent: !!c,
    mapSize: c ? `${c.clientWidth}x${c.clientHeight}` : null,
    tileImgs: imgs.length,
    tilesLoaded: loaded.length,
    firstTileSrc: imgs[0]?.getAttribute('src')?.slice(0, 120) ?? null,
    tilePaneFilter: pane ? getComputedStyle(pane).filter : null,
    tilePaneOpacity: pane ? getComputedStyle(pane).opacity : null,
    polygons: document.querySelectorAll('.leaflet-interactive').length,
    canvasLayers: document.querySelectorAll('.leaflet-canvas-container, canvas.leaflet-zoom-animated').length,
  };
});

console.log('--- DIAGNOSTICS ---');
console.log(JSON.stringify(diag, null, 2));
console.log('--- TILE REQUESTS ---');
console.log('ok:', tiles.ok, 'failed:', tiles.failed.length);
tiles.failed.slice(0, 6).forEach((f) => console.log('  ', f));
console.log('--- CONSOLE ---');
[...new Set(errors)].slice(0, 12).forEach((e) => console.log('  ', e.slice(0, 220)));

await page.screenshot({ path: OUT, fullPage: false });
console.log('screenshot ->', OUT);
await browser.close();
