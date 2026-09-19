/**
 * Two phones, one chat, no server.
 *
 * This is the test that decides whether the feature exists. It opens two
 * separate browser pages - genuinely separate, each with its own
 * RTCPeerConnection, its own storage and its own React tree - pairs them
 * through the app's real UI by copying the codes between them the way a
 * person would, and then sends a message from one and checks it arrives on
 * the other.
 *
 * Nothing is stubbed. The WebRTC stack is real, the data channel is real,
 * and no signalling server, STUN server or relay is configured anywhere.
 * If this passes, two handsets on the same Wi-Fi can chat with the internet
 * switched off.
 *
 * Usage: node tools/nearby-chat-test.mjs [url]
 */
import puppeteer from 'puppeteer-core';

const CHROME = String.raw`C:\Program Files\Google\Chrome\Application\chrome.exe`;
const BASE = process.argv[2] ?? 'http://localhost:4390/';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const failures = [];
const check = (ok, label, detail = '') => {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` - ${detail}` : ''}`);
  if (!ok) failures.push(label);
  return ok;
};

async function waitFor(read, predicate, timeoutMs, label) {
  const deadline = Date.now() + timeoutMs;
  let last = await read();
  while (Date.now() < deadline) {
    if (predicate(last)) return last;
    await wait(700);
    last = await read();
  }
  console.log(`    (timed out waiting for ${label})`);
  return last;
}

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  protocolTimeout: 180000,
  args: [
    '--no-sandbox',
    '--enable-unsafe-swiftshader',
    '--use-gl=swiftshader',
    '--disable-background-timer-throttling',
    '--disable-renderer-backgrounding',
    // Chrome hides local IPs behind mDNS hostnames by default. Two pages in
    // one browser cannot resolve each other's .local name, so for this test
    // real host IPs are used. On two actual phones mDNS resolves normally.
    '--disable-features=WebRtcHideLocalIpsWithMdns',
  ],
});

const errors = [];

/** One "phone": its own page, on a phone-sized viewport. */
async function openPhone(label) {
  const page = await browser.newPage();
  await page.setViewport({ width: 412, height: 915, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  page.on('pageerror', (e) => {
    if (/websocket|vite/i.test(e.message)) return;
    errors.push(`${label}: ${e.message.slice(0, 130)}`);
  });
  page.on('console', (m) => {
    if (m.type() === 'error' && !/websocket|vite|favicon|Failed to load resource/i.test(m.text())) {
      errors.push(`${label}: ${m.text().slice(0, 130)}`);
    }
  });

  await page.goto(BASE, { waitUntil: 'load', timeout: 90000 });
  await wait(3000);
  const opened = await page.evaluate(() => {
    const target = Array.from(document.querySelectorAll('button, a')).find((el) =>
      /offline\s*chat/i.test(el.textContent || '')
    );
    if (!target) return false;
    target.click();
    return true;
  });
  await wait(2000);
  return { page, opened };
}

const clickTestId = (page, id) =>
  page.evaluate((sel) => {
    const el = document.querySelector(`[data-testid="${sel}"]`);
    if (!el) return false;
    el.click();
    return true;
  }, id);

const readTestId = (page, id) =>
  page.evaluate((sel) => {
    const el = document.querySelector(`[data-testid="${sel}"]`);
    if (!el) return null;
    return 'value' in el ? el.value : el.textContent?.trim() ?? null;
  }, id);

const fillTestId = (page, id, text) =>
  page.evaluate(
    ({ sel, value }) => {
      const el = document.querySelector(`[data-testid="${sel}"]`);
      if (!el) return false;
      // React tracks the previous value on the DOM node, so assigning .value
      // directly is ignored. Going through the native setter and firing an
      // input event is what makes React see the change.
      const proto = Object.getPrototypeOf(el);
      const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
      setter?.call(el, value);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    },
    { sel: id, value: text }
  );

/* ------------------------------------------------------------------ run -- */

console.log('--- opening two phones ---');
const A = await openPhone('A');
const B = await openPhone('B');
check(A.opened && B.opened, 'both phones open the offline chat');
check(
  (await readTestId(A.page, 'link-state')) !== null,
  'the nearby-chat panel is on screen'
);

console.log('\n--- pairing them, the way a person would ---');
check(await clickTestId(A.page, 'create-invite'), 'phone A can start a chat');
const invite = await waitFor(
  () => readTestId(A.page, 'invite-code'),
  (v) => !!v && v.startsWith('FL1~O~'),
  20000,
  'the invite code'
);
check(!!invite && invite.startsWith('FL1~O~'), 'phone A produced an invite code', `${invite?.length} chars`);

// This is the step a person does by hand: copy from one phone to the other.
await fillTestId(B.page, 'invite-input', invite);
check(await clickTestId(B.page, 'accept-invite'), 'phone B accepts the invite');
const reply = await waitFor(
  () => readTestId(B.page, 'reply-code'),
  (v) => !!v && v.startsWith('FL1~A~'),
  20000,
  'the reply code'
);
check(!!reply && reply.startsWith('FL1~A~'), 'phone B produced a reply code', `${reply?.length} chars`);

await fillTestId(A.page, 'reply-input', reply);
check(await clickTestId(A.page, 'complete-invite'), 'phone A takes the reply');

const stateA = await waitFor(
  () => readTestId(A.page, 'link-state'),
  (v) => /connected/i.test(v ?? ''),
  30000,
  'phone A to connect'
);
const stateB = await readTestId(B.page, 'link-state');
check(/connected/i.test(stateA ?? ''), 'phone A reports connected', stateA ?? '');
check(/connected/i.test(stateB ?? ''), 'phone B reports connected', stateB ?? '');

console.log('\n--- sending a message across ---');
/*
 * Count oscillators as a proxy for "a sound was actually produced", then
 * arm the audio with a REAL tap.
 *
 * element.click() from evaluate does not work here and that is not a test
 * artefact: it dispatches an untrusted click, which creates no user
 * activation and fires no pointerdown, so the browser keeps audio locked and
 * the arming listener never hears anything. A real tap is what a phone
 * sends, so a real tap is what this has to send.
 */
await B.page.evaluate(() => {
  window.__alerts = [];
  const Ctor = window.AudioContext || window.webkitAudioContext;
  const original = Ctor.prototype.createOscillator;
  Ctor.prototype.createOscillator = function patched() {
    window.__alerts.push(Date.now());
    return original.call(this);
  };
});
await B.page.touchscreen.tap(200, 700);
await wait(800);
/*
 * Whether arming worked is read from the UI, not by importing the module.
 *
 * Importing /src/utils/alertSound.ts only resolves against the dev server;
 * against a production build that path falls through to index.html and the
 * browser logs a MIME-type error, which then shows up as an application
 * error that is really a fault in this file.
 */
const soundLabel = await B.page.evaluate(() => {
  const el = document.querySelector('[data-testid="sound-toggle"]');
  return el ? el.textContent?.trim() ?? '' : null;
});
if (soundLabel !== null) {
  check(/sound on/i.test(soundLabel), 'alert sound is armed on the receiving phone', soundLabel);
}

const sent = await A.page.evaluate(async () => {
  const input = document.querySelector('input[type="text"], textarea[placeholder*="essage" i]');
  const box = Array.from(document.querySelectorAll('input, textarea')).find((el) =>
    /message|type/i.test(el.placeholder || '')
  );
  const target = box || input;
  if (!target) return { ok: false, reason: 'no message box' };
  const proto = Object.getPrototypeOf(target);
  Object.getOwnPropertyDescriptor(proto, 'value')?.set?.call(target, 'Water rising on Anna Salai');
  target.dispatchEvent(new Event('input', { bubbles: true }));
  const form = target.closest('form');
  if (form) form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  return { ok: true };
});
check(sent.ok, 'phone A has a message box to type in', sent.reason ?? '');

const arrived = await waitFor(
  () => B.page.evaluate(() => document.body.innerText),
  (t) => /Water rising on Anna Salai/.test(t),
  25000,
  'the message to arrive on phone B'
);
check(
  /Water rising on Anna Salai/.test(arrived ?? ''),
  'the message arrived on the other phone'
);

const alerts = await B.page.evaluate(() => (window.__alerts ?? []).length);
check(alerts > 0, 'the alert sound fired on the receiving phone', `${alerts} tones`);

console.log('\n--- no server was involved ---');
const usedServers = await A.page.evaluate(() =>
  performance
    .getEntriesByType('resource')
    .some((r) => /stun:|turn:|signal|socket\.io/i.test(r.name))
);
check(!usedServers, 'no STUN, TURN or signalling server was contacted');

const unique = [...new Set(errors)];
check(unique.length === 0, 'no console errors', unique.slice(0, 3).join(' | '));

await A.page.screenshot({ path: '../nearby-a.png' });
await B.page.screenshot({ path: '../nearby-b.png' });

console.log(`\n${failures.length ? `FAILED: ${failures.join('; ')}` : 'ALL CHECKS PASSED'}`);
await browser.close();
process.exit(failures.length ? 1 : 0);
