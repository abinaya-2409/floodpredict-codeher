/** Counts the interactive controls a user actually sees, per region. */
import puppeteer from 'puppeteer-core';
const b = await puppeteer.launch({
  executablePath: String.raw`C:\Program Files\Google\Chrome\Application\chrome.exe`,
  headless: true, protocolTimeout: 240000,
  args: ['--no-sandbox','--enable-unsafe-swiftshader','--use-gl=swiftshader'],
});
const page = await b.newPage();
await page.setViewport({ width: 1600, height: 1000 });
const wait = ms => new Promise(r=>setTimeout(r,ms));
await page.goto(process.argv[2] ?? 'http://localhost:4330/', { waitUntil:'domcontentloaded', timeout:90000 });
await wait(3500);
await page.evaluate(()=>{Array.from(document.querySelectorAll('button')).find(b=>/^skip$/i.test((b.textContent||'').trim()))?.click();});
await wait(800);
await page.evaluate(()=>{Array.from(document.querySelectorAll('button')).find(b=>/continue as guest/i.test(b.textContent||''))?.click();});
await wait(3000);

const audit = await page.evaluate(() => {
  const vis = (el) => {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden';
  };
  const count = (root) => {
    if (!root) return null;
    const ctrls = Array.from(root.querySelectorAll('button,[role="radio"],[role="tab"],select,input[type=range],a[href]')).filter(vis);
    return { total: ctrls.length, labels: ctrls.map(c => (c.textContent||c.getAttribute('aria-label')||'').trim().slice(0,22)).filter(Boolean) };
  };
  const nav = document.querySelector('nav') || document.querySelector('header');
  return {
    wholePage: count(document.body).total,
    navbar: count(nav),
    tabs: Array.from(document.querySelectorAll('[role="tab"]')).filter(vis).map(t=>t.textContent.trim()),
    weatherMap: count(document.querySelector('#tn-weather-map')),
  };
});
console.log('controls on the page at once:', audit.wholePage);
console.log('\nnavbar:', audit.navbar.total, '->', audit.navbar.labels.join(' | '));
console.log('\ntabs:', audit.tabs.length, '->', audit.tabs.join(' | '));
console.log('\nweather map:', audit.weatherMap?.total, '->', audit.weatherMap?.labels.join(' | '));
await b.close();
