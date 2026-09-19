/**
 * Renders the app icon to the PNGs an installed app needs.
 *
 * Android reads them from the manifest, iOS only ever reads
 * <link rel="apple-touch-icon">, and neither accepts the SVG we already have:
 * Chrome wants raster for the launcher and home screen, and iOS ignores SVG
 * touch icons entirely. So the same source SVG is rasterised here rather than
 * a second, drifting copy of the artwork being drawn by hand.
 *
 * Headless Chrome does the rasterising because it is already a dependency and
 * it anti-aliases properly; hand-plotting the curve with pngjs looked exactly
 * as bad as that sounds.
 *
 * Two shapes are produced, and the difference matters:
 *   - "any": the icon as drawn, rounded corners included.
 *   - "maskable": Android crops this to whatever shape the launcher uses -
 *     circle, squircle, teardrop. Anything outside the middle 80% can be cut,
 *     so the artwork is inset and the background bleeds to the edge. Shipping
 *     the plain icon as maskable is why so many installed apps show a logo
 *     with its corners sliced off.
 *
 * Usage: node tools/build-icons.mjs
 */
import fs from 'node:fs/promises';
import puppeteer from 'puppeteer-core';

const CHROME = String.raw`C:\Program Files\Google\Chrome\Application\chrome.exe`;
const OUT = 'public/icons';

/** The artwork, inlined so this script has one source of truth for it. */
const GLYPH = `
  <g stroke="#eaf1fa" stroke-width="42" stroke-linecap="round" fill="none">
    <path d="M192 54v404"/>
    <path d="M192 128h128M192 202h75M192 277h128M192 351h75"/>
  </g>
  <path d="M43 387c39 0 39-32 79-32s39 32 79 32 39-32 79-32 39 32 79 32 39-32 79-32"
        stroke="#4f9cf9" stroke-width="36" stroke-linecap="round" fill="none"/>`;

const BG = '#080f1c';

/**
 * @param {boolean} maskable inset the artwork and square off the background
 */
const svg = (maskable) => {
  // 80% safe zone: the launcher may crop everything outside it.
  const scale = maskable ? 0.72 : 1;
  const offset = (512 - 512 * scale) / 2;
  const corner = maskable ? 0 : 112;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
    <rect width="512" height="512" rx="${corner}" fill="${BG}"/>
    <g transform="translate(${offset} ${offset}) scale(${scale})">${GLYPH}</g>
  </svg>`;
};

const TARGETS = [
  { file: 'icon-192.png', size: 192, maskable: false },
  { file: 'icon-512.png', size: 512, maskable: false },
  { file: 'icon-maskable-192.png', size: 192, maskable: true },
  { file: 'icon-maskable-512.png', size: 512, maskable: true },
  // iOS home screen. 180 is the largest iOS asks for, and it does not apply
  // a mask, but it does composite onto black - so no transparency anywhere.
  { file: 'apple-touch-icon.png', size: 180, maskable: false },
];

await fs.mkdir(OUT, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ['--no-sandbox', '--force-device-scale-factor=1'],
});
const page = await browser.newPage();

for (const { file, size, maskable } of TARGETS) {
  await page.setViewport({ width: size, height: size, deviceScaleFactor: 1 });
  const markup = svg(maskable).replace(/width="512" height="512"/, `width="${size}" height="${size}"`);
  await page.setContent(
    `<!doctype html><style>html,body{margin:0;padding:0;background:${BG}}</style>${markup}`,
    { waitUntil: 'load' }
  );
  await page.screenshot({ path: `${OUT}/${file}`, omitBackground: false });
  const { size: bytes } = await fs.stat(`${OUT}/${file}`);
  console.log(`${file.padEnd(26)} ${size}x${size}  ${bytes} bytes`);
}

await browser.close();
