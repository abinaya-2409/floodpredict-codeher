import puppeteer from 'puppeteer-core';

const CHROME = String.raw`C:\Program Files\Google\Chrome\Application\chrome.exe`;

const b = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  protocolTimeout: 240000,
  args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-gl=swiftshader'],
});
const page = await b.newPage();
await page.setViewport({ width: 1600, height: 1000 });

const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
page.on('console', (m) => {
  if (m.type() === 'error') errs.push(m.text());
});

await page.goto(process.argv[2], { waitUntil: 'domcontentloaded', timeout: 90000 });
await new Promise((r) => setTimeout(r, 3000));

// Dismiss any login modal so the tabs are reachable.
for (let i = 0; i < 3; i++) {
  const clicked = await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('button')).find((b) =>
      /continue as guest/i.test(b.textContent || '')
    );
    if (btn) { btn.click(); return true; }
    return false;
  });
  await new Promise((r) => setTimeout(r, 1500));
  if (clicked) break;
}

const opened = await page.evaluate(() => {
  const tab = Array.from(document.querySelectorAll('[role="tab"]')).find((t) =>
    /national/i.test(t.textContent || '')
  );
  if (!tab) return false;
  tab.click();
  return true;
});
console.log('national tab found:', opened);

await new Promise((r) => setTimeout(r, 22000));

const state = await page.evaluate(() => {
  const canvas = document.querySelector('.maplibregl-canvas');
  const items = document.querySelectorAll('#national-grid-map ol li button');
  const heading = document.querySelector('#national-grid-map h3')?.textContent?.trim();
  const counts = document.querySelector('#national-grid-map .font-mono')?.textContent?.trim();
  return {
    canvasPresent: !!canvas,
    canvasSize: canvas ? `${canvas.width}x${canvas.height}` : null,
    heading,
    districtCount: counts,
    listItems: items.length,
    firstThree: Array.from(items)
      .slice(0, 3)
      .map((b) => b.innerText.replace(/\n/g, ' | ')),
    severityButtons: document.querySelectorAll('#national-grid-map [aria-pressed]').length,
    styleRadios: document.querySelectorAll('#national-grid-map [role="radio"]').length,
  };
});
console.log(JSON.stringify(state, null, 2));

// Change severity to Level 4 and confirm the footprint grows.
const before = state.listItems;
await page.evaluate(() => {
  const btn = Array.from(document.querySelectorAll('#national-grid-map button')).find((b) =>
    /Level 4/.test(b.textContent || '')
  );
  btn?.click();
});
await new Promise((r) => setTimeout(r, 2000));
const after = await page.evaluate(
  () => document.querySelectorAll('#national-grid-map ol li button').length
);
console.log(`severity 3 -> 4 : ${before} districts -> ${after}`);

console.log('errors:', [...new Set(errs)].slice(0, 5));
await page.evaluate(() =>
  document.querySelector('#national-grid-map')?.scrollIntoView({ block: 'center' })
);
await new Promise((r) => setTimeout(r, 1500));
await page.screenshot({ path: '../national.png' });
await b.close();
