/** Screenshots the live app at several viewports, both themes. */
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const BASE = process.argv[2] ?? 'https://floodpredict-codeher.vercel.app/';
const OUT  = process.argv[3] ?? path.join(os.tmpdir(), 'floodpredict', 'theme-shots');
fs.mkdirSync(OUT, { recursive: true });

const wait = ms => new Promise(r => setTimeout(r, ms));

const VIEWS = [
  { name: 'phone-360',  width: 360,  height: 740,  dsf: 3, mobile: true },
  { name: 'phone-390',  width: 390,  height: 844,  dsf: 3, mobile: true },
  { name: 'tablet-768', width: 768,  height: 1024, dsf: 2, mobile: true },
  { name: 'laptop-1280',width: 1280, height: 800,  dsf: 1, mobile: false },

];

const browser = await puppeteer.launch({
  executablePath: String.raw`C:\Program Files\Google\Chrome\Application\chrome.exe`,
  headless: true, protocolTimeout: 240000,
  args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-gl=swiftshader'],
});

const THEMES = process.env.SHOT_THEMES ? process.env.SHOT_THEMES.split(',') : ['oled','light'];
for (const theme of THEMES) {
  for (const v of VIEWS) {
    const page = await browser.newPage();
    await page.setViewport({ width: v.width, height: v.height, deviceScaleFactor: v.dsf, isMobile: v.mobile, hasTouch: v.mobile });
    if (v.mobile) await page.setUserAgent('Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140 Mobile Safari/537.36');
    await page.evaluateOnNewDocument((t) => {
      try { localStorage.setItem('floodypredict_theme', t); } catch {}
    }, theme);
    const errors = [];
    page.on('pageerror', e => errors.push(String(e).slice(0, 160)));
    await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await wait(4500);
    // skip splash if it is still up
    await page.evaluate(() => {
      const b = Array.from(document.querySelectorAll('button')).find(b => /^skip$/i.test((b.textContent||'').trim()));
      b?.click();
    });
    await wait(3000);

    const probe = await page.evaluate(() => {
      const de = document.documentElement;
      const overflow = de.scrollWidth - de.clientWidth;
      const offenders = [];
      if (overflow > 0) {
        for (const el of document.querySelectorAll('body *')) {
          const r = el.getBoundingClientRect();
          if (r.width === 0 || r.height === 0) continue;
          if (r.right > de.clientWidth + 1 || r.left < -1) {
            offenders.push({
              tag: el.tagName.toLowerCase(),
              cls: (el.className && String(el.className)).slice(0, 70),
              left: Math.round(r.left), right: Math.round(r.right), w: Math.round(r.width),
            });
          }
        }
      }
      return {
        theme: de.dataset.theme,
        overflow,
        offenders: offenders.slice(0, 12),
        bodyBg: getComputedStyle(document.body).backgroundColor,
        stormBg: (() => { const s = document.querySelector('.storm-background'); return s ? getComputedStyle(s).backgroundColor : null; })(),
        vantaCanvas: !!document.querySelector('.vanta-canvas-host canvas'),
      };
    });
    await page.screenshot({ path: `${OUT}/${theme}-${v.name}.png` });
    console.log(`${theme}/${v.name}  theme=${probe.theme} overflowX=${probe.overflow}px storm=${probe.stormBg} vanta=${probe.vantaCanvas} err=${errors.length}`);
    for (const o of probe.offenders) console.log(`    over: <${o.tag}> ${o.cls} [${o.left}..${o.right}] w=${o.w}`);
    for (const e of errors.slice(0,3)) console.log('    ERR', e);
    await page.close();
  }
}
await browser.close();
console.log('shots in', OUT);
