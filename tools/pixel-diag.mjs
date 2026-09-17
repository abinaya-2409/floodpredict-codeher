import puppeteer from 'puppeteer-core';

const CHROME = String.raw`C:\Program Files\Google\Chrome\Application\chrome.exe`;

const b = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  protocolTimeout: 180000,
  args: ['--no-sandbox'],
});
const page = await b.newPage();
await page.setViewport({ width: 1600, height: 1000 });
await page.goto(process.argv[2], { waitUntil: 'networkidle2', timeout: 90000 });
await new Promise((r) => setTimeout(r, 4000));

// switch to satellite, which should be unmistakably not-black over land
await page.evaluate(() => {
  const btn = Array.from(document.querySelectorAll('[role="radio"]')).find(
    (b) => b.textContent.trim() === 'Satellite'
  );
  btn?.click();
});
await new Promise((r) => setTimeout(r, 6000));

const out = await page.evaluate(() => {
  const tiles = Array.from(document.querySelectorAll('.leaflet-tile'));
  const container = document.querySelector('.leaflet-container');
  if (!container) {
    return {
      error: 'no .leaflet-container',
      leafletTiles: document.querySelectorAll('.leaflet-tile').length,
      mapWrapper: !!document.querySelector('#leaflet-flood-map-wrapper'),
      radios: Array.from(document.querySelectorAll('[role="radio"]')).map((b) => ({
        t: b.textContent.trim(),
        checked: b.getAttribute('aria-checked'),
      })),
      bodyHasSchematic: document.body.innerText.includes('Architectural Schematic'),
    };
  }
  const cRect = container.getBoundingClientRect();

  // Which tiles actually intersect the visible map rectangle?
  const inView = tiles.filter((t) => {
    const r = t.getBoundingClientRect();
    return (
      r.right > cRect.left && r.left < cRect.right && r.bottom > cRect.top && r.top < cRect.bottom
    );
  });

  // Read the middle pixel of the first in-view tile.
  let pixel = null;
  let pixelErr = null;
  const t = inView[0] ?? tiles[0];
  if (t) {
    try {
      const c = document.createElement('canvas');
      c.width = t.naturalWidth;
      c.height = t.naturalHeight;
      const ctx = c.getContext('2d');
      ctx.drawImage(t, 0, 0);
      const d = ctx.getImageData(Math.floor(c.width / 2), Math.floor(c.height / 2), 1, 1).data;
      pixel = `rgb(${d[0]},${d[1]},${d[2]}) a=${d[3]}`;
    } catch (e) {
      pixelErr = String(e).slice(0, 120);
    }
  }

  const tileRects = inView.slice(0, 3).map((x) => {
    const r = x.getBoundingClientRect();
    return { x: Math.round(r.x - cRect.x), y: Math.round(r.y - cRect.y), w: Math.round(r.width) };
  });

  return {
    containerRect: { w: Math.round(cRect.width), h: Math.round(cRect.height) },
    totalTiles: tiles.length,
    tilesIntersectingView: inView.length,
    firstTilesRelative: tileRects,
    samplePixel: pixel,
    pixelError: pixelErr,
    sampleSrc: t?.src,
    tileContainerTransform: getComputedStyle(
      document.querySelector('.leaflet-tile-container')
    ).transform,
  };
});

console.log(JSON.stringify(out, null, 2));
await b.close();
