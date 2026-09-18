import puppeteer from 'puppeteer-core';
const b = await puppeteer.launch({ executablePath: process.env.CHROME, headless: true, protocolTimeout: 120000, args:['--no-sandbox'] });
const page = await b.newPage();
await page.setViewport({ width: 1100, height: 900, deviceScaleFactor: 2 });
const errs=[]; page.on('pageerror', e=>errs.push(e.message));
await page.goto(process.argv[2], { waitUntil:'networkidle2', timeout:90000 });
await new Promise(r=>setTimeout(r,3500));

const read = () => page.evaluate(() => {
  const label = Array.from(document.querySelectorAll('span')).find(s=>s.textContent.trim()==='LIVE HYDRO-TELEMETRY');
  const track = document.querySelector('.telemetry-track');
  const tick  = document.querySelector('.telemetry-ticker');
  return {
    labelX: label ? Math.round(label.getBoundingClientRect().x) : null,
    trackX: track ? Math.round(track.getBoundingClientRect().x) : null,
    anim: track ? getComputedStyle(track).animationName : null,
    copies: track ? track.children.length : 0,
    overflowHidden: tick ? getComputedStyle(tick).overflow : null,
    stripScrollW: (()=>{const s=document.querySelector('.telemetry-ticker')?.parentElement; return s? s.scrollWidth - s.clientWidth : null;})(),
  };
});

const a = await read();
await new Promise(r=>setTimeout(r,2500));
const c = await read();

console.log('label static :', a.labelX === c.labelX, `(x=${a.labelX} -> ${c.labelX})`);
console.log('track moving :', a.trackX !== c.trackX, `(x=${a.trackX} -> ${c.trackX})`);
console.log('animation    :', a.anim, '| copies:', a.copies, '| ticker overflow:', a.overflowHidden);
console.log('strip overflow px (should be 0):', a.stripScrollW);
console.log('errors:', [...new Set(errs)].slice(0,3));
await page.screenshot({ path: '../ticker.png', clip: { x: 0, y: 0, width: 1100, height: 190 } });
await b.close();
