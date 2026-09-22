/**
 * Measures alignment, rather than looking at it.
 *
 * "Looks off" is hard to argue with and hard to fix twice. These are the
 * numbers behind it: whether a box's padding is symmetrical, whether its
 * contents are actually centred on its middle, and whether the fixed corner
 * elements sit the same distance from each edge they claim to hug.
 */
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';

const BASE = process.argv[2] ?? 'http://localhost:3300/';
const OUT = process.argv[3];
if (OUT) fs.mkdirSync(OUT, { recursive: true });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const VIEWS = [
  { name: 'phone-390', width: 390, height: 844, dsf: 2, mobile: true },
  { name: 'laptop-1280', width: 1280, height: 800, dsf: 1, mobile: false },
];

const browser = await puppeteer.launch({
  executablePath: String.raw`C:\Program Files\Google\Chrome\Application\chrome.exe`,
  headless: true,
  protocolTimeout: 240000,
  args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-gl=swiftshader'],
});

let failures = 0;
const check = (view, label, ok, detail = '') => {
  if (!ok) failures++;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${view} :: ${label}${detail ? ' -- ' + detail : ''}`);
};

/** Padding and the offset of the content box inside the border box. */
const boxOf = (sel) => (s) => {
  const el = document.querySelector(s);
  if (!el) return null;
  const cs = getComputedStyle(el);
  const r = el.getBoundingClientRect();
  const num = (v) => Math.round(parseFloat(v) * 100) / 100;
  return {
    pt: num(cs.paddingTop),
    pb: num(cs.paddingBottom),
    pl: num(cs.paddingLeft),
    pr: num(cs.paddingRight),
    w: Math.round(r.width),
    h: Math.round(r.height),
    top: Math.round(r.top),
    left: Math.round(r.left),
    right: Math.round(r.right),
    bottom: Math.round(r.bottom),
  };
};

for (const v of VIEWS) {
  console.log(`\n=== ${v.name} (${v.width}x${v.height}) ===`);
  try {
    const page = await browser.newPage();
    await page.setViewport({
      width: v.width,
      height: v.height,
      deviceScaleFactor: v.dsf,
      isMobile: v.mobile,
      hasTouch: v.mobile,
    });
    await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await wait(4500);
    await page.evaluate(() => {
      const b = Array.from(document.querySelectorAll('button')).find((x) =>
        /^skip$/i.test((x.textContent || '').trim())
      );
      b?.click();
    });
    await wait(2500);

    // The button.
    const fab = await page.evaluate(boxOf('[data-testid="assistant-fab"]'), '[data-testid="assistant-fab"]');
    check(v.name, 'button padding is symmetrical top/bottom', fab && fab.pt === fab.pb, fab ? `${fab.pt} / ${fab.pb}` : 'missing');
    check(v.name, 'button padding is symmetrical left/right', fab && fab.pl === fab.pr, fab ? `${fab.pl} / ${fab.pr}` : 'missing');

    // Equal distance from the two edges it hugs.
    const gapRight = v.width - fab.right;
    const gapBottom = v.height - fab.bottom;
    check(v.name, 'button sits equidistant from right and bottom', Math.abs(gapRight - gapBottom) <= 1, `right ${gapRight}px, bottom ${gapBottom}px`);

    // Icon and label centred on the button's own middle.
    const centring = await page.evaluate(() => {
      const btn = document.querySelector('[data-testid="assistant-fab"]');
      if (!btn) return null;
      const b = btn.getBoundingClientRect();
      const mid = b.top + b.height / 2;
      // Skip children that are not rendered. The label is `hidden sm:inline`,
      // so on a phone it has no box and measuring it says nothing about
      // alignment - it just reports the distance to the top of the document.
      return Array.from(btn.children)
        .filter((c) => {
          const r = c.getBoundingClientRect();
          return r.width > 0 && r.height > 0;
        })
        .map((c) => {
          const r = c.getBoundingClientRect();
          return { tag: c.tagName.toLowerCase(), off: Math.round((r.top + r.height / 2 - mid) * 10) / 10 };
        });
    });
    const worst = centring ? Math.max(...centring.map((k) => Math.abs(k.off))) : 99;
    check(v.name, 'button contents vertically centred', worst <= 1, centring ? centring.map((k) => `${k.tag}${k.off >= 0 ? '+' : ''}${k.off}`).join(' ') : 'missing');

    // The footer, which had the same bug.
    const footer = await page.evaluate(boxOf('footer'), 'footer');
    check(v.name, 'footer padding is symmetrical top/bottom', footer && footer.pt === footer.pb, footer ? `${footer.pt} / ${footer.pb}` : 'missing');

    // The open panel.
    await page.click('[data-testid="assistant-fab"]');
    await wait(900);
    const panel = await page.evaluate(boxOf('[data-testid="assistant-panel"]'), '[data-testid="assistant-panel"]');
    check(v.name, 'panel padding is even on all four sides', panel && panel.pt === panel.pb && panel.pl === panel.pr && panel.pt === panel.pl, panel ? `${panel.pt}/${panel.pr}/${panel.pb}/${panel.pl}` : 'missing');

    // The panel must not hang off either side.
    check(v.name, 'panel is fully on screen', panel && panel.left >= 0 && panel.right <= v.width && panel.top >= 0, panel ? `l${panel.left} r${panel.right}/${v.width} t${panel.top}` : 'missing');

    // On wide screens the panel's right edge should line up with the button's.
    if (!v.mobile) {
      check(v.name, 'panel right edge aligns with the button', Math.abs(panel.right - fab.right) <= 1, `panel ${panel.right}, button ${fab.right}`);
    }

    if (OUT) await page.screenshot({ path: `${OUT}/align-${v.name}.png` });
    await page.close();
  } catch (err) {
    check(v.name, 'ran without the browser falling over', false, String(err).slice(0, 120));
  }
}

await browser.close();
console.log(`\n${failures === 0 ? 'ALL ALIGNMENT CHECKS PASSED' : failures + ' ALIGNMENT CHECK(S) FAILED'}`);
process.exit(failures === 0 ? 0 : 1);
