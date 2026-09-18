import puppeteer from 'puppeteer-core';
const b = await puppeteer.launch({ executablePath: process.env.CHROME, headless: true, protocolTimeout: 120000, args:['--no-sandbox'] });
const page = await b.newPage();
await page.setViewport({ width: 1600, height: 1000 });
const errs=[]; page.on('pageerror', e=>errs.push(e.message));
await page.goto(process.argv[2], { waitUntil:'networkidle2', timeout:90000 });
await new Promise(r=>setTimeout(r,3000));
await page.evaluate(()=>document.querySelector('[aria-label*="Change language"]')?.click());
await new Promise(r=>setTimeout(r,700));
const opts = await page.evaluate(()=>Array.from(document.querySelectorAll('[role="option"]')).map(o=>o.innerText.replace(/\n/g,' / ')));
console.log('languages offered:', opts.length);
opts.forEach(o=>console.log('  ', o));
// pick Bengali
await page.evaluate(()=>{
  const b=Array.from(document.querySelectorAll('[role="option"] button')).find(x=>x.innerText.includes('Bengali'));
  b?.click();
});
await new Promise(r=>setTimeout(r,1200));
const after = await page.evaluate(()=>({
  htmlLang: document.documentElement.lang,
  tabs: Array.from(document.querySelectorAll('[role="tab"]')).slice(0,4).map(t=>t.innerText.trim()),
}));
console.log('after switch:', JSON.stringify(after));
console.log('errors:', [...new Set(errs)].slice(0,3));
await b.close();
