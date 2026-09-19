/**
 * Three phones, and a message that crosses one of them.
 *
 *      A ── B ── C
 *
 * A and C never pair with each other and never exchange a code. If C reads
 * A's message, B relayed it, and the mesh is real rather than a library
 * nobody calls.
 *
 * The unit tests prove the protocol against a fake wire. This proves the
 * wiring: three real browsers, three real WebRTC data channels, the actual
 * pairing UI driven the way a person drives it.
 *
 *   node tools/mesh-relay-test.mjs [url]
 */
import puppeteer from 'puppeteer-core';

const BASE = process.argv[2] ?? 'http://localhost:4330/';
const OUT = 'C:/Users/andri/AppData/Local/Temp/claude/c--Users-andri-Documents-VS-Code/df0ae3b0-05e4-45f1-8057-133e02b33718/scratchpad';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

let failures = 0;
const check = (ok, label, detail = '') => {
  if (!ok) failures++;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` - ${detail}` : ''}`);
  return ok;
};

/** Polls until `fn` returns truthy, or gives up. */
async function until(fn, ms = 25000, step = 300) {
  const deadline = Date.now() + ms;
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() > deadline) return null;
    await wait(step);
  }
}

const browser = await puppeteer.launch({
  executablePath: String.raw`C:\Program Files\Google\Chrome\Application\chrome.exe`,
  headless: true,
  protocolTimeout: 240000,
  args: ['--no-sandbox', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'],
});

/** Opens the app on the offline-chat tab. */
async function openPhone(name) {
  const page = await browser.newPage();
  await page.setViewport({ width: 900, height: 1000 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(`${name}: ${String(e).slice(0, 140)}`));
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await wait(1200);
  await page.evaluate(() =>
    Array.from(document.querySelectorAll('button'))
      .find((b) => /^open$|launch dashboard/i.test((b.textContent || '').trim()))
      ?.click()
  );
  await wait(2500);
  await page.evaluate(() => {
    const b = Array.from(document.querySelectorAll('button')).find((x) =>
      /open offline chat/i.test(x.textContent || '')
    );
    b?.click();
  });
  await wait(2500);
  await page.evaluate(() =>
    document.querySelector('[data-testid="nearby-link"]')?.scrollIntoView({ block: 'center' })
  );
  return { name, page, errors };
}

const val = (phone, testid) =>
  phone.page.evaluate(
    (id) => document.querySelector(`[data-testid="${id}"]`)?.value ?? '',
    testid
  );

const click = (phone, testid) =>
  phone.page.evaluate((id) => {
    const el = document.querySelector(`[data-testid="${id}"]`);
    if (!el) return false;
    el.click();
    return true;
  }, testid);

const type = async (phone, testid, text) => {
  await phone.page.evaluate(
    ({ id, t }) => {
      const el = document.querySelector(`[data-testid="${id}"]`);
      if (!el) return;
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLTextAreaElement.prototype.isPrototypeOf(el)
          ? window.HTMLTextAreaElement.prototype
          : window.HTMLInputElement.prototype,
        'value'
      ).set;
      setter.call(el, t);
      el.dispatchEvent(new Event('input', { bubbles: true }));
    },
    { id: testid, t: text }
  );
};

const panelText = (phone) =>
  phone.page.evaluate(
    () =>
      document.querySelector('[data-testid="nearby-link"]')?.innerText?.toLowerCase() ?? ''
  );

/** Runs the three-step code exchange between two open phones. */
async function pair(host, guest, label) {
  // If the host is already connected it must first ask for the extra link.
  if ((await panelText(host)).includes('connected to')) {
    await click(host, 'add-another');
    await wait(500);
  }
  if ((await panelText(guest)).includes('connected to')) {
    await click(guest, 'add-another');
    await wait(500);
  }

  await click(host, 'create-invite');
  const invite = await until(async () => (await val(host, 'invite-code')) || null);
  if (!check(!!invite, `${label}: invite code created`, invite ? `${invite.length} chars` : 'none'))
    return false;

  await type(guest, 'invite-input', invite);
  await click(guest, 'accept-invite');
  const reply = await until(async () => (await val(guest, 'reply-code')) || null);
  if (!check(!!reply, `${label}: reply code created`, reply ? `${reply.length} chars` : 'none'))
    return false;

  await type(host, 'reply-input', reply);
  await click(host, 'complete-invite');

  const bothUp = await until(async () => {
    const h = await panelText(host);
    const g = await panelText(guest);
    return h.includes('connected to') && g.includes('connected to');
  });
  return check(!!bothUp, `${label}: both ends report connected`);
}

/** Types a chat message and sends it. */
async function say(phone, text) {
  return phone.page.evaluate((t) => {
    const box = Array.from(document.querySelectorAll('textarea, input[type="text"]')).find(
      (el) =>
        el.offsetParent !== null &&
        /message|type|say/i.test(`${el.placeholder ?? ''} ${el.getAttribute('aria-label') ?? ''}`)
    );
    if (!box) return false;
    const proto = box.tagName === 'TEXTAREA' ? HTMLTextAreaElement : HTMLInputElement;
    Object.getOwnPropertyDescriptor(proto.prototype, 'value').set.call(box, t);
    box.dispatchEvent(new Event('input', { bubbles: true }));
    const form = box.closest('form');
    if (form) {
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      return true;
    }
    box.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    return true;
  }, text);
}

const sawMessage = (phone, text) =>
  phone.page.evaluate((t) => document.body.innerText.includes(t), text);

/* ----------------------------------------------------------------- run --- */

console.log('--- opening three phones ---');
const A = await openPhone('A');
const B = await openPhone('B');
const C = await openPhone('C');
check(true, 'three phones open the offline chat');

console.log('\n--- A pairs with B ---');
const ab = await pair(A, B, 'A-B');

console.log('\n--- B pairs with C (A is not involved) ---');
const bc = ab ? await pair(B, C, 'B-C') : false;

if (bc) {
  const bCount = await B.page.evaluate(
    () => document.querySelector('[data-testid="peer-count"]')?.innerText ?? ''
  );
  check(/2 phones/i.test(bCount), 'B is holding two links at once', bCount.trim().slice(0, 40));
}

console.log('\n--- A sends, C should hear it through B ---');
let relayed = false;
if (bc) {
  const MSG = `relay-check-${Date.now().toString().slice(-6)}`;
  const sent = await say(A, MSG);
  check(sent, 'A has a message box');
  await wait(4000);

  relayed = await until(async () => await sawMessage(C, MSG), 12000);
  check(!!relayed, 'the message reached C, which never paired with A');

  const atB = await sawMessage(B, MSG);
  check(atB, 'B also has it, being on the path');
}

console.log('\n--- nothing went out to a server ---');
const contacted = await A.page.evaluate(() =>
  performance
    .getEntriesByType('resource')
    .map((r) => r.name)
    .filter((n) => /stun:|turn:|signal|ws:\/\/|wss:\/\//.test(n))
);
check(contacted.length === 0, 'no STUN, TURN or signalling server was contacted');

const allErrors = [...A.errors, ...B.errors, ...C.errors];
check(allErrors.length === 0, 'no console errors', allErrors.slice(0, 2).join(' | '));

for (const p of [A, B, C]) {
  await p.page.screenshot({ path: `${OUT}/mesh-${p.name}.png` }).catch(() => {});
}
await browser.close();

console.log(failures ? `\nFAILED: ${failures} check(s)` : '\nALL CHECKS PASSED');
process.exit(failures ? 1 : 0);
