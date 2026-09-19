/** Old per-particle projection vs new per-frame one, on a real Leaflet map. */
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
const wait = ms => new Promise(r=>setTimeout(r,ms));
const leafletJs  = fs.readFileSync('node_modules/leaflet/dist/leaflet-src.js', 'utf8');
const leafletCss = fs.readFileSync('node_modules/leaflet/dist/leaflet.css', 'utf8');

const b = await puppeteer.launch({ executablePath: String.raw`C:\Program Files\Google\Chrome\Application\chrome.exe`,
  headless: true, protocolTimeout: 240000, args: ['--no-sandbox'] });
const page = await b.newPage();
await page.setViewport({ width: 1280, height: 800 });
await page.setContent(`<!doctype html><html><head><style>${leafletCss}
  html,body{margin:0}#m{width:1280px;height:800px}</style></head><body><div id="m"></div></body></html>`);
await page.addScriptTag({ content: leafletJs });
await wait(400);

const out = await page.evaluate(() => {
  const m = L.map('m', { center: [10.9, 78.3], zoom: 7, zoomControl: false, attributionControl: false });
  // Offset the pane the way a dragged map has it.
  L.DomUtil.setPosition(m.getPanes().mapPane, L.point(-137, 92));

  const N = 3600;                   // 1800 particles, two projections each
  const pts = Array.from({ length: N }, () => [8 + Math.random()*6, 76 + Math.random()*5]);
  const REPS = 40;

  const timeIt = (fn) => { fn(); fn(); const t = performance.now();
    for (let r = 0; r < REPS; r++) fn(); return (performance.now() - t) / REPS; };

  let sink = 0;
  const oldMs = timeIt(() => {
    for (const [lat, lon] of pts) { const p = m.latLngToContainerPoint([lat, lon]); sink += p.x + p.y; }
  });

  const newMs = timeIt(() => {
    const c = m.getCenter();
    const a = m.latLngToContainerPoint(c);
    const scale = m.options.crs.scale(m.getZoom());
    const ox = ((c.lng + 180) / 360) * scale - a.x;
    const sC = Math.sin(c.lat * Math.PI / 180);
    const oy = (0.5 - Math.log((1 + sC) / (1 - sC)) / (4 * Math.PI)) * scale - a.y;
    for (const [lat, lon] of pts) {
      const x = ((lon + 180) / 360) * scale - ox;
      const s = Math.sin(lat * Math.PI / 180);
      const y = (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * scale - oy;
      sink += x + y;
    }
  });

  // How far apart are the two, in pixels, on the same points?
  const c = m.getCenter(), a = m.latLngToContainerPoint(c);
  const scale = m.options.crs.scale(m.getZoom());
  const sC = Math.sin(c.lat * Math.PI / 180);
  const ox = ((c.lng + 180) / 360) * scale - a.x;
  const oy = (0.5 - Math.log((1 + sC) / (1 - sC)) / (4 * Math.PI)) * scale - a.y;
  let worst = 0;
  for (const [lat, lon] of pts.slice(0, 600)) {
    const p = m.latLngToContainerPoint([lat, lon]);
    const x = ((lon + 180) / 360) * scale - ox;
    const s = Math.sin(lat * Math.PI / 180);
    const y = (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * scale - oy;
    worst = Math.max(worst, Math.abs(x - p.x), Math.abs(y - p.y));
  }
  return { N, oldMs:+oldMs.toFixed(3), newMs:+newMs.toFixed(3), worstPx:+worst.toFixed(3), sink };
});

console.log(`projections per frame:      ${out.N}`);
console.log(`old, Leaflet per particle:  ${out.oldMs} ms/frame   (${(1000/out.oldMs).toFixed(0)} fps ceiling from this alone)`);
console.log(`new, arithmetic per frame:  ${out.newMs} ms/frame   (${(1000/out.newMs).toFixed(0)} fps ceiling)`);
console.log(`speedup:                    ${(out.oldMs/out.newMs).toFixed(1)}x`);
console.log(`worst disagreement:         ${out.worstPx} px  (Leaflet rounds layer points to whole pixels)`);
await b.close();
