import puppeteer from 'puppeteer-core';

const CHROME = String.raw`C:\Program Files\Google\Chrome\Application\chrome.exe`;

const b = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  protocolTimeout: 180000,
  args: ['--no-sandbox'],
});
const page = await b.newPage();
await page.setViewport({ width: 1600, height: 1000, deviceScaleFactor: 1 });

const libs = new Set();
page.on('response', (r) => {
  const u = r.url();
  if (/\.(js|css)(\?|$)/.test(u) || /tile|maps|mapbox|leaflet|arcgis|carto|openstreet/i.test(u)) {
    libs.add(`${r.status()} ${u.slice(0, 130)}`);
  }
});
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));

await page.goto(process.argv[2], { waitUntil: 'networkidle2', timeout: 90000 });
await new Promise((r) => setTimeout(r, 7000));

const info = await page.evaluate(() => {
  const txt = document.body.innerText.replace(/\s+/g, ' ').trim();
  const has = (sel) => document.querySelectorAll(sel).length;
  return {
    title: document.title,
    textSample: txt.slice(0, 900),
    // Which mapping library is in play?
    leafletContainers: has('.leaflet-container'),
    leafletTiles: has('.leaflet-tile'),
    mapboxCanvas: has('.mapboxgl-canvas'),
    maplibreCanvas: has('.maplibregl-canvas'),
    googleMaps: has('.gm-style'),
    svgCount: has('svg'),
    canvasCount: has('canvas'),
    paths: has('path'),
    // Interactive affordances
    buttons: has('button'),
    selects: has('select'),
    inputs: has('input'),
    clickableSvgPaths: Array.from(document.querySelectorAll('path'))
      .filter((p) => p.getAttribute('fill') && p.getAttribute('fill') !== 'none')
      .length,
    globals: ['L', 'mapboxgl', 'maplibregl', 'google', 'd3', 'Plotly', 'echarts', 'THREE']
      .filter((g) => g in window),
    headings: Array.from(document.querySelectorAll('h1,h2,h3'))
      .map((h) => h.textContent.trim())
      .filter(Boolean)
      .slice(0, 14),
    buttonLabels: Array.from(document.querySelectorAll('button'))
      .map((x) => x.textContent.trim())
      .filter(Boolean)
      .slice(0, 28),
  };
});

console.log(JSON.stringify(info, null, 2));
console.log('--- notable network ---');
[...libs].filter((l) => /tile|map|leaflet|arcgis|carto|openstreet|geo/i.test(l)).slice(0, 14).forEach((l) => console.log('  ', l));
console.log('--- errors ---', [...new Set(errs)].slice(0, 4));

await page.screenshot({ path: '../ref-full.png', fullPage: false });
await b.close();
