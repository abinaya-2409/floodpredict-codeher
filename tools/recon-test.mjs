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

const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
page.on('console', (m) => {
  if (m.type() === 'error') errs.push(m.text());
});

await page.goto(process.argv[2], { waitUntil: 'networkidle2', timeout: 90000 });
await new Promise((r) => setTimeout(r, 2500));

const sel = 'input[aria-label*="Search any district"]';
await page.click(sel);
await page.type(sel, 'Kozhikode', { delay: 60 });
await new Promise((r) => setTimeout(r, 4000));

const opts = await page.$$('[role="option"] button');
console.log('search results:', opts.length);
if (opts.length) await opts[0].click();
await new Promise((r) => setTimeout(r, 10000));

const out = await page.evaluate(() => {
  const p = document.querySelector('[aria-labelledby="recon-heading"]');
  return {
    panelPresent: !!p,
    heading: p?.querySelector('#recon-heading')?.textContent?.trim(),
    text: p ? p.innerText.replace(/\s+/g, ' ').slice(0, 380) : null,
    vectorPaths: document.querySelectorAll('path').length,
  };
});
console.log(JSON.stringify(out, null, 2));
console.log('errors:', [...new Set(errs)].slice(0, 5));

await page.screenshot({ path: '../recon.png' });
await b.close();
