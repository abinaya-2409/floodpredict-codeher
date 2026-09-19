/** Finds what actually sets the minimum width of the dashboard at 360px. */
import puppeteer from 'puppeteer-core';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const b = await puppeteer.launch({
  executablePath: String.raw`C:\Program Files\Google\Chrome\Application\chrome.exe`,
  headless: true,
  protocolTimeout: 240000,
  args: ['--no-sandbox', '--ignore-gpu-blocklist'],
});
const page = await b.newPage();
await page.setViewport({ width: 360, height: 740, isMobile: true, hasTouch: true });
await page.goto('http://localhost:4330/', { waitUntil: 'domcontentloaded', timeout: 90000 });
await wait(1500);
await page.evaluate(() =>
  Array.from(document.querySelectorAll('button'))
    .find((x) => /launch dashboard/i.test(x.textContent || ''))
    ?.click()
);
await wait(4000);

const report = await page.evaluate(() => {
  // An element's own irreducible width, measured rather than inferred: clone
  // it into a shrink-to-fit box and see what it settles at. Reading
  // scrollWidth off the live tree only ever reports the width its parent
  // already forced on it, which is why every element in a blown-out column
  // reports the same number.
  const probe = document.createElement('div');
  probe.style.cssText =
    'position:absolute;left:-99999px;top:0;width:min-content;visibility:hidden;contain:layout';
  document.body.appendChild(probe);

  const minContent = (el) => {
    const c = el.cloneNode(true);
    probe.replaceChildren(c);
    const w = probe.getBoundingClientRect().width;
    probe.replaceChildren();
    return w;
  };

  const out = [];
  const main = document.querySelector('main.shell');
  const budget = main.clientWidth;

  for (const el of main.querySelectorAll('*')) {
    if (el.children.length > 2) continue; // leaves and near-leaves only
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    let w = 0;
    try {
      w = minContent(el);
    } catch {
      continue;
    }
    if (w > budget - 40) {
      out.push({
        w: Math.round(w),
        tag: el.tagName.toLowerCase(),
        cls: String(el.className || '').slice(0, 54),
        text: (el.textContent || '').trim().slice(0, 40),
      });
    }
  }
  probe.remove();
  out.sort((a, b) => b.w - a.w);
  return { budget, out: out.slice(0, 12) };
});

console.log(`main content budget at 360px: ${report.budget}px\n`);
for (const o of report.out) {
  console.log(`min-content ${String(o.w).padStart(4)}px  <${o.tag}> ${o.cls}\n              :: ${o.text}`);
}
if (!report.out.length) console.log('nothing with an irreducible width over budget');
await b.close();
