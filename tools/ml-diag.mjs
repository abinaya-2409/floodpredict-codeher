import puppeteer from 'puppeteer-core';
const b = await puppeteer.launch({ executablePath: process.env.CHROME, headless: true, protocolTimeout: 240000,
  args:['--no-sandbox','--enable-unsafe-swiftshader','--use-gl=swiftshader'] });
const page = await b.newPage();
await page.setViewport({ width: 1600, height: 1000 });
const errs=[]; page.on('pageerror', e=>errs.push('PAGE '+e.message));
page.on('console', m=>{ if(m.type()==='error') errs.push('CON '+m.text()); if(m.type()==='warning') errs.push('WARN '+m.text()); });
await page.goto(process.argv[2], { waitUntil:'domcontentloaded', timeout:90000 });
await new Promise(r=>setTimeout(r,3000));
for (let i=0;i<3;i++){ const c=await page.evaluate(()=>{const b=Array.from(document.querySelectorAll('button')).find(x=>/continue as guest/i.test(x.textContent||'')); if(b){b.click();return true} return false}); await new Promise(r=>setTimeout(r,1200)); if(c)break; }
await page.evaluate(()=>{const t=Array.from(document.querySelectorAll('[role="tab"]')).find(x=>/national/i.test(x.textContent||'')); t?.click();});
await new Promise(r=>setTimeout(r,20000));
const out = await page.evaluate(()=>{
  const overlay = !!Array.from(document.querySelectorAll('#national-grid-map *')).find(e=>/Loading 641/.test(e.textContent||'') && e.children.length===0);
  return { loadingOverlayVisible: overlay,
           listCount: document.querySelectorAll('#national-grid-map ol li button').length };
});
console.log(JSON.stringify(out,null,2));
console.log('errors/warnings:'); [...new Set(errs)].slice(0,8).forEach(e=>console.log('  ', e.slice(0,190)));
await b.close();
