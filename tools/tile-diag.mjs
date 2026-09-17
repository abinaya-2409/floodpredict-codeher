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
await new Promise((r) => setTimeout(r, 5000));

const diag = await page.evaluate(() => {
  const container = document.querySelector('.leaflet-container');
  const pane = document.querySelector('.leaflet-tile-pane');
  const tiles = Array.from(document.querySelectorAll('.leaflet-tile'));
  const t = tiles[0];

  const box = (el) => {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
  };
  const cs = (el, props) => {
    if (!el) return null;
    const s = getComputedStyle(el);
    return Object.fromEntries(props.map((p) => [p, s[p]]));
  };

  const mapPane = document.querySelector('.leaflet-map-pane');

  return {
    containerBox: box(container),
    containerStyle: cs(container, ['background-color', 'overflow', 'position', 'zIndex']),
    mapPaneStyle: cs(mapPane, ['transform', 'position']),
    paneBox: box(pane),
    paneStyle: cs(pane, ['opacity', 'visibility', 'display', 'filter', 'zIndex', 'transform', 'mixBlendMode']),
    tileCount: tiles.length,
    tile0: {
      box: box(t),
      style: cs(t, ['opacity', 'visibility', 'display', 'zIndex', 'transform', 'width', 'height', 'filter']),
      classes: t?.className,
      complete: t?.complete,
      natural: t ? `${t.naturalWidth}x${t.naturalHeight}` : null,
      src: t?.src?.slice(0, 100),
    },
    // Anything painted on top of the map centre?
    topAtCentre: (() => {
      const r = container?.getBoundingClientRect();
      if (!r) return null;
      const el = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      return el ? `${el.tagName}.${String(el.className).slice(0, 60)}` : null;
    })(),
  };
});

console.log(JSON.stringify(diag, null, 2));
await b.close();
