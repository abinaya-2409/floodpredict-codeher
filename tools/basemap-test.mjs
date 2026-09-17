import puppeteer from 'puppeteer-core';

const CHROME = String.raw`C:\Program Files\Google\Chrome\Application\chrome.exe`;
const URL = process.argv[2];

const b = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  protocolTimeout: 180000,
  args: ['--no-sandbox'],
});
const page = await b.newPage();
await page.setViewport({ width: 1600, height: 1000 });

const tileLog = [];
page.on('response', (r) => {
  const u = r.url();
  if (/arcgisonline|cartocdn|maptiler/.test(u)) tileLog.push({ status: r.status(), url: u });
});
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));

await page.goto(URL, { waitUntil: 'networkidle2', timeout: 90000 });
await new Promise((r) => setTimeout(r, 4000));

for (const name of ['Command', 'Satellite', 'Elevation', 'Streets']) {
  tileLog.length = 0;

  const clicked = await page.evaluate((n) => {
    const btn = Array.from(document.querySelectorAll('[role="radio"]')).find(
      (b) => b.textContent.trim() === n
    );
    if (!btn) return false;
    btn.click();
    return true;
  }, name);

  await new Promise((r) => setTimeout(r, 5000));

  const dom = await page.evaluate(() => {
    const imgs = Array.from(document.querySelectorAll('.leaflet-tile'));
    const loaded = imgs.filter((i) => i.complete && i.naturalWidth > 0);
    const panes = Array.from(document.querySelectorAll('.leaflet-layer')).map((l) => ({
      op: getComputedStyle(l).opacity,
      z: getComputedStyle(l).zIndex,
    }));
    return {
      tileEls: imgs.length,
      tilesLoaded: loaded.length,
      sample: imgs[0]?.getAttribute('src')?.slice(0, 95) ?? null,
      layers: panes.length,
      layerStyles: panes.slice(0, 4),
      zoom: document.querySelector('.leaflet-container')?.__zoom ?? null,
    };
  });

  const ok = tileLog.filter((t) => t.status === 200).length;
  const bad = tileLog.filter((t) => t.status !== 200);
  console.log(
    `${name.padEnd(10)} clicked=${clicked} netOK=${String(ok).padStart(3)} netBad=${bad.length} domTiles=${dom.tileEls} loaded=${dom.tilesLoaded} layers=${dom.layers}`
  );
  if (bad.length) console.log('    bad:', bad.slice(0, 2).map((x) => `${x.status} ${x.url.slice(0, 80)}`));
  if (dom.sample) console.log('    src:', dom.sample);
  console.log('    layerStyles:', JSON.stringify(dom.layerStyles));

  // Capture the map element itself, not the top of the page.
  const el = await page.$('#leaflet-flood-map-wrapper');
  if (el) {
    await el.evaluate((n) => n.scrollIntoView({ block: 'center' }));
    await new Promise((r) => setTimeout(r, 1200));
    await el.screenshot({ path: `../map-${name.toLowerCase()}.png` });
  }
}

console.log('errors:', [...new Set(errs)].slice(0, 5));
await b.close();
