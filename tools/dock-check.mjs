/**
 * Drives the assistant dock in a real browser: opens it, presses Report, then
 * asks a question and waits for an answer to arrive. Verification, not a
 * screenshot - "it renders" is not the same as "it works".
 */
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';

const BASE = process.argv[2] ?? 'http://localhost:3260/';
const OUT = process.argv[3];
// Create it rather than assume it. A missing screenshot directory threw
// inside the per-view try and was reported as the browser falling over,
// which is a confusing way to say "mkdir".
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

for (const v of VIEWS) {
  console.log(`\n=== ${v.name} (${v.width}x${v.height}) ===`);
  // One viewport falling over must not take the rest of the run with it: a
  // software-rendered browser driving a three.js background is not a stable
  // thing, and a crash here is a fact about the harness, not the app.
  try {
  const page = await browser.newPage();
  await page.setViewport({
    width: v.width,
    height: v.height,
    deviceScaleFactor: v.dsf,
    isMobile: v.mobile,
    hasTouch: v.mobile,
  });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e).slice(0, 200)));

  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await wait(4500);
  // Skip the splash if it is still up.
  await page.evaluate(() => {
    const b = Array.from(document.querySelectorAll('button')).find((x) =>
      /^skip$/i.test((x.textContent || '').trim())
    );
    b?.click();
  });
  await wait(2500);

  // 1. The button is there, and actually in the bottom-right corner.
  const fab = await page.$('[data-testid="assistant-fab"]');
  check(v.name, 'dock button present', !!fab);
  if (!fab) {
    await page.close();
    continue;
  }

  const box = await fab.boundingBox();
  const inCorner =
    box && box.x + box.width > v.width - 140 && box.y + box.height > v.height - 140;
  check(
    v.name,
    'sits bottom-right',
    inCorner,
    box ? `right edge ${Math.round(box.x + box.width)}/${v.width}, bottom ${Math.round(box.y + box.height)}/${v.height}` : 'no box'
  );

  // 2. Nothing is pushed off-screen by it.
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth
  );
  check(v.name, 'no horizontal overflow', overflow <= 0, `overflow ${overflow}px`);

  // 3. It opens.
  await fab.click();
  await wait(900);
  const isOpen = () =>
    page.$eval('[data-testid="assistant-panel"]', (el) => el.getAttribute('data-open') === '1')
      .catch(() => false);
  const panel = (await isOpen()) ? await page.$('[data-testid="assistant-panel"]') : null;
  check(v.name, 'panel opens on click', !!panel);
  if (!panel) {
    await page.close();
    continue;
  }

  // 4. Report works with no model involved at all.
  //
  // Counted off the message elements rather than the log's text. Slicing the
  // log by length looked fine and was not: the empty-state prompt vanishes
  // when the first message lands, so the text does not simply grow, and a
  // phone run "passed" on the placeholder it was supposed to have replaced.
  const msgs = async () =>
    page.$$eval('[data-testid="assistant-msg"]', (els) =>
      els.map((e) => ({
        role: e.getAttribute('data-role'),
        checked: e.getAttribute('data-checked'),
        text: e.innerText,
      }))
    );

  await page.click('[data-testid="assistant-report"]');
  await wait(900);
  const afterReport = await msgs();
  const report = afterReport.filter((m) => m.role === 'assistant').pop();
  check(
    v.name,
    'Report answers locally',
    !!report && report.text.length > 200 && /VRI|ward|people/i.test(report.text),
    report ? `${report.text.length} chars` : 'no assistant message'
  );

  // 5. A real question reaches the model and comes back.
  // Set the value through React's own setter and fire one input event.
  // page.type() is a CDP round trip per keystroke, which is both slow and a
  // long window for a swiftshader renderer to fall over in.
  await page.evaluate((text) => {
    const el = document.querySelector('[data-testid="assistant-input"]');
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLTextAreaElement.prototype,
      'value'
    ).set;
    setter.call(el, text);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }, 'Which ward should I move on first?');
  await wait(300);
  await page.click('[data-testid="assistant-send"]');

  let reply = null;
  for (let i = 0; i < 45; i++) {
    await wait(1000);
    const now = await msgs();
    if (now.length > afterReport.length + 1) {
      reply = now.filter((m) => m.role === 'assistant').pop();
      break;
    }
  }
  check(
    v.name,
    'model answers in the dock',
    !!reply && reply.text.length > 80,
    reply ? `${reply.text.length} chars` : 'no reply arrived'
  );
  check(
    v.name,
    'answer carries the checked mark',
    !!reply && (reply.checked === 'verified' || reply.checked === 'corrected'),
    reply ? reply.checked || 'none' : 'no reply'
  );

  // 6. Escape closes it.
  await page.keyboard.press('Escape');
  await wait(600);
  check(v.name, 'Escape closes it', !(await isOpen()));

  // 7. Reopening keeps what was already said.
  await fab.click();
  await wait(700);
  const kept = await msgs();
  check(
    v.name,
    'reopening keeps the conversation',
    kept.length >= 4,
    `${kept.length} messages still there`
  );

  check(v.name, 'no page errors', errors.length === 0, errors.join(' | '));

  if (OUT) await page.screenshot({ path: `${OUT}/dock-${v.name}.png` });
  await page.close();
  } catch (err) {
    check(v.name, 'ran without the browser falling over', false, String(err).slice(0, 120));
  }
}

await browser.close();
console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : failures + ' CHECK(S) FAILED'}`);
process.exit(failures === 0 ? 0 : 1);
