/**
 * Verifies the incident briefing renders with no API key and no model.
 *
 * One trap worth remembering: do not call response.text() from a puppeteer
 * 'response' handler for a request the page itself is reading. It locks the
 * body stream, the page's own res.json() never resolves, and the feature
 * looks like it is hanging when it is the test that broke it.
 */
import puppeteer from 'puppeteer-core';

const CHROME = String.raw`C:\Program Files\Google\Chrome\Application\chrome.exe`;
const URL = process.argv[2] ?? 'http://localhost:4342/';

const b = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  protocolTimeout: 240000,
  args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-gl=swiftshader'],
});
const page = await b.newPage();
await page.setViewport({ width: 1600, height: 1100 });

const errs = [];
page.on('pageerror', (e) => errs.push(e.message.slice(0, 140)));
page.on('console', (m) => {
  if (m.type() === 'error' && !/websocket|vite/i.test(m.text())) errs.push(m.text().slice(0, 140));
});
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 90000 });
await wait(3500);
await page.evaluate(() => {
  Array.from(document.querySelectorAll('button'))
    .find((b) => /^skip$/i.test((b.textContent || '').trim()))?.click();
});
await wait(800);
await page.evaluate(() => {
  Array.from(document.querySelectorAll('button'))
    .find((b) => /continue as guest/i.test(b.textContent || ''))?.click();
});
await wait(4000);

const read = () =>
  page.evaluate(() => {
    const panel = document.querySelector('#incident-briefing');
    if (!panel) return { found: false };
    const t = panel.innerText;
    return {
      found: true,
      severity: (t.match(/\b(Routine|Watch|Warning|Emergency)\b/i) || [])[1],
      headline: (t.split('\n').find((l) => /^Start with|^No flooding expected/.test(l)) || '')
        .slice(0, 80),
      sections: Array.from(panel.querySelectorAll('section h3')).map((h) => h.textContent.trim()),
      bullets: panel.querySelectorAll('section li').length,
      // The old fallback's invented prose must not come back.
      hasInventedProse: /percolation limits|runoff coefficient exceeding|240%/i.test(t),
      saysComputed: /no language model/i.test(t),
      rewriteButton: Array.from(panel.querySelectorAll('button'))
        .find((x) => /rewrite as prose|writing/i.test(x.textContent || ''))
        ?.textContent?.trim(),
      explainsNoModel: /no language model is configured|rejected the api key/i.test(t),
    };
  });

console.log('briefing:', JSON.stringify(await read(), null, 2));
console.log('gemini anywhere on the page:', await page.evaluate(() => /gemini/i.test(document.body.innerText)));

// The rewrite button with no key must explain itself and leave the briefing alone.
await page.evaluate(() => {
  const panel = document.querySelector('#incident-briefing');
  Array.from(panel.querySelectorAll('button'))
    .find((x) => /rewrite as prose/i.test(x.textContent || ''))?.click();
});
// Poll rather than sleep: the first request to a cold dev server compiles
// the route, and a fixed wait made this read "Writing" at random.
let after = await read();
for (let i = 0; i < 20 && /writing/i.test(after.rewriteButton ?? ''); i++) {
  await wait(700);
  after = await read();
}
console.log(
  `after rewrite: button "${after.rewriteButton}", explains ${after.explainsNoModel}, ` +
    `briefing still has ${after.bullets} bullets`
);

console.log('errors:', [...new Set(errs)].filter((e) => !/websocket/i.test(e)).slice(0, 4));
await page.evaluate(() =>
  document.querySelector('#incident-briefing')?.scrollIntoView({ block: 'center' })
);
await wait(900);
await page.screenshot({ path: '../briefing.png' });
await b.close();
