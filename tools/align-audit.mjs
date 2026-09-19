/** Measures gutter alignment, clipped rows and tap targets across viewports. */
import puppeteer from 'puppeteer-core';
const BASE = process.argv[2] ?? 'https://floodpredict-codeher.vercel.app/';
const wait = ms => new Promise(r => setTimeout(r, ms));
const VIEWS = [
  { name: 'phone-360',   width: 360,  height: 740,  mobile: true },
  { name: 'phone-414',   width: 414,  height: 896,  mobile: true },
  { name: 'tablet-768',  width: 768,  height: 1024, mobile: true },
  { name: 'laptop-1280', width: 1280, height: 800,  mobile: false },
  { name: 'desk-1920',   width: 1920, height: 1080, mobile: false },
];
const browser = await puppeteer.launch({
  executablePath: String.raw`C:\Program Files\Google\Chrome\Application\chrome.exe`,
  headless: true, protocolTimeout: 240000,
  args: ['--no-sandbox', '--ignore-gpu-blocklist'],
});
for (const v of VIEWS) {
  const page = await browser.newPage();
  await page.setViewport({ width: v.width, height: v.height, isMobile: v.mobile, hasTouch: v.mobile });
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await wait(4000);
  await page.evaluate(() => Array.from(document.querySelectorAll('button')).find(b => /^skip$/i.test((b.textContent||'').trim()))?.click());
  await wait(2500);
  const r = await page.evaluate(() => {
    const box = (sel) => { const e = document.querySelector(sel); if (!e) return null;
      const b = e.getBoundingClientRect(); return { l: Math.round(b.left), r: Math.round(b.right), w: Math.round(b.width) }; };
    const clipped = [];
    for (const el of document.querySelectorAll('*')) {
      const over = el.scrollWidth - el.clientWidth;
      if (over > 2 && el.clientWidth > 0) {
        const st = getComputedStyle(el);
        clipped.push({ tag: el.tagName.toLowerCase(), cls: String(el.className||'').slice(0,58), over, ox: st.overflowX });
      }
    }
    const small = [];
    for (const el of document.querySelectorAll('button,a[href],select,[role="button"],[role="tab"],input')) {
      const b = el.getBoundingClientRect();
      if (b.width === 0 || b.height === 0) continue;
      if (b.height < 44 || b.width < 24) small.push({ t: (el.textContent||el.getAttribute('aria-label')||el.tagName).trim().slice(0,22), h: Math.round(b.height), w: Math.round(b.width) });
    }
    return {
      headerShell: box('header .shell'),
      mainShell: box('main.shell'),
      footerShell: box('footer.shell'),
      firstCard: (() => { const m = document.querySelector('#main-content'); const c = m?.firstElementChild;
        if (!c) return null; const b = c.getBoundingClientRect(); return { l: Math.round(b.left), r: Math.round(b.right), w: Math.round(b.width) }; })(),
      clipped: clipped.slice(0, 10),
      smallCount: small.length, small: small.slice(0, 8),
    };
  });
  console.log(`\n### ${v.name} (${v.width}px)`);
  for (const k of ['headerShell','mainShell','footerShell','firstCard']) {
    const b = r[k]; console.log(`  ${k.padEnd(12)} ${b ? `l=${String(b.l).padStart(4)} r=${String(b.r).padStart(5)} w=${b.w}` : '(missing)'}`);
  }
  if (r.clipped.length) { console.log('  clipped (scrollWidth > clientWidth):');
    for (const c of r.clipped) console.log(`    <${c.tag}> +${c.over}px overflow-x:${c.ox}  ${c.cls}`); }
  console.log(`  under-size tap targets: ${r.smallCount}`);
  for (const s of r.small) console.log(`    ${s.w}x${s.h}  "${s.t}"`);
  await page.close();
}
await browser.close();
