import puppeteer from 'puppeteer-core';

/**
 * Walks every city against every tab and reports what actually renders.
 * The question this answers: does the app work outside Chennai?
 */

const URL = process.argv[2] || 'http://localhost:3000/';
const TABS = [
  'Inundation Map',
  'Street Vulnerability',
  'What-If Sandbox',
  'Early Warning',
  'Resource Dispatch',
  'Data Streams',
  '72h Timeline',
  'Citizen Portal',
];

const browser = await puppeteer.launch({
  executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  headless: 'new',
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1600, height: 1000 });

const errors = [];
page.on('pageerror', (e) => errors.push(`PAGEERROR ${e.message}`));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(`CONSOLE ${m.text()}`);
});

await page.goto(URL, { waitUntil: 'networkidle2', timeout: 90000 });
await new Promise((r) => setTimeout(r, 3000));

// Discover the city selector options.
const cities = await page.evaluate(() => {
  const sel = document.querySelector('select');
  return sel ? Array.from(sel.options).map((o) => o.textContent.trim()) : [];
});
console.log('cities found:', cities.length ? cities : '(no <select> - checking buttons)');

async function pickCity(name) {
  return page.evaluate((n) => {
    const sel = document.querySelector('select');
    if (!sel) return false;
    const opt = Array.from(sel.options).find((o) => o.textContent.includes(n));
    if (!opt) return false;
    sel.value = opt.value;
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }, name);
}

async function openTab(label) {
  return page.evaluate((l) => {
    const btn = Array.from(document.querySelectorAll('[role="tab"]')).find((b) =>
      b.textContent.trim().includes(l)
    );
    if (!btn) return false;
    btn.click();
    return true;
  }, label);
}

const results = [];
for (const city of cities.length ? cities : ['(default)']) {
  if (cities.length) {
    const ok = await pickCity(city);
    if (!ok) { results.push([city, '-', 'CITY SWITCH FAILED', 0]); continue; }
    await new Promise((r) => setTimeout(r, 1200));
  }

  for (const tab of TABS) {
    const before = errors.length;
    const opened = await openTab(tab);
    await new Promise((r) => setTimeout(r, 900));

    const stats = await page.evaluate(() => {
      const main = document.querySelector('#main-content');
      const text = (main?.innerText || '').trim();
      return {
        chars: text.length,
        polygons: document.querySelectorAll('.leaflet-interactive').length,
        tiles: document.querySelectorAll('.leaflet-tile').length,
        empty: text.length < 120,
      };
    });

    const newErrors = errors.length - before;
    results.push([
      city,
      tab,
      !opened ? 'TAB NOT FOUND' : stats.empty ? 'EMPTY' : 'ok',
      stats.chars,
      stats.polygons,
      newErrors,
    ]);
  }
}

console.log('\ncity                 | tab                  | state         | chars | polys | errs');
console.log('-'.repeat(88));
for (const [c, t, s, ch, p, e] of results) {
  const flag = s !== 'ok' || e > 0 ? ' <<<' : '';
  console.log(
    `${String(c).padEnd(20)} | ${String(t).padEnd(20)} | ${String(s).padEnd(13)} | ${String(ch).padStart(5)} | ${String(p ?? '').padStart(5)} | ${String(e).padStart(4)}${flag}`
  );
}

console.log('\n--- unique errors ---');
[...new Set(errors)].slice(0, 15).forEach((e) => console.log('  ', e.slice(0, 200)));

await browser.close();
