/**
 * Verifies that the offline chat detects real nearby devices, in a loop.
 *
 * Chrome is given an emulated Bluetooth adapter through the CDP
 * BluetoothEmulation domain, and three peripherals are put "in range". Those
 * three are the ground truth: the app must show those and nothing else. The
 * old build showed "Disaster Recon Unit 4", "Velachery Community Shelter" and
 * "Citizen Water-Rescue 09" whatever was actually nearby, so the check that
 * matters most is the negative one.
 *
 * The browser chooser is driven with the DeviceAccess domain, which is how
 * Chrome exposes its own device picker to automation. Without it
 * requestDevice() sits open forever in headless.
 *
 * Two traps found the hard way, both worth keeping in mind:
 *
 *   - DeviceAccess.deviceRequestPrompted fires again every time the chooser's
 *     list grows, and selecting against a stale prompt id throws "Cannot find
 *     request with id". Select once, after the list settles.
 *   - BluetoothEmulation.simulateAdvertisement never resolves in this Chrome
 *     build, so advertisement delivery is not exercised here. Presence and
 *     pruning are covered by src/__tests__/deviceDiscovery.test.ts instead.
 *
 * Usage: node tools/bluetooth-test.mjs [url] [rounds]
 */
import puppeteer from 'puppeteer-core';

const CHROME = String.raw`C:\Program Files\Google\Chrome\Application\chrome.exe`;
const URL = process.argv[2] ?? 'http://localhost:4342/';
const ROUNDS = Number(process.argv[3] ?? 3);

/** The devices that are actually in range. Nothing else may appear. */
const IN_RANGE = [
  { address: '09:09:09:09:09:09', name: 'Pixel 7 of Andri' },
  { address: '0A:0A:0A:0A:0A:0A', name: 'Redmi Note 12' },
  { address: '0B:0B:0B:0B:0B:0B', name: 'OnePlus Nord CE' },
];

/** Names the previous build invented. If any of these show up, it regressed. */
const INVENTED = [
  'Disaster Recon Unit 4',
  'Velachery Community Shelter',
  'Citizen Water-Rescue 09',
  'FloodUser-7192',
  'FloodUser-3841',
  'FloodUser-9024',
];

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Polls until a condition holds.
 *
 * Fixed sleeps were wrong here and cost most of a debugging session. Under
 * software WebGL this page runs its timers at roughly a fifth of normal speed,
 * so a 2.5s wait read a list that was correct three seconds later, and every
 * device check failed against a UI that had simply not caught up.
 */
async function waitFor(read, predicate, timeoutMs = 45000, label = '') {
  const deadline = Date.now() + timeoutMs;
  let last = await read();
  while (Date.now() < deadline) {
    if (predicate(last)) return last;
    await wait(1200);
    last = await read();
  }
  if (label) console.log(`    (timed out waiting for ${label} after ${timeoutMs}ms)`);
  return last;
}
const failures = [];
const check = (ok, label, detail = '') => {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` - ${detail}` : ''}`);
  if (!ok) failures.push(label);
  return ok;
};

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  protocolTimeout: 240000,
  args: [
    '--no-sandbox',
    '--enable-unsafe-swiftshader',
    '--use-gl=swiftshader',
    '--enable-features=WebBluetooth,WebBluetoothNewPermissionsBackend',
    '--enable-experimental-web-platform-features',
    // Without these, headless Chrome throttles this page's timers to roughly
    // one tick per five seconds. The presence sweep and React's own scheduler
    // both run on timers, so the UI lagged the data by seconds and the test
    // read a list that had already been updated. That cost an hour.
    '--disable-background-timer-throttling',
    '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding',
  ],
});

const browserSession = await browser.target().createCDPSession();
await browserSession.send('BluetoothEmulation.enable', { state: 'powered-on', leSupported: true });
for (const { address, name } of IN_RANGE) {
  await browserSession.send('BluetoothEmulation.simulatePreconnectedPeripheral', {
    address,
    name,
    manufacturerData: [],
    knownServiceUuids: [],
  });
}
console.log(`adapter emulated, ${IN_RANGE.length} peripherals in range\n`);

const errors = [];
let chooserSeen = null;
let pending = null;
let page;
let pageSession;

/**
 * A fresh tab per round.
 *
 * Reusing one tab across rounds meant that when a reload landed while an
 * evaluate was in flight, the frame detached and every later call - including
 * page.goto - threw "Attempted to use detached Frame", killing the run rather
 * than the round. A new tab cannot inherit that state. The Bluetooth grants
 * being tested survive anyway: they belong to the origin, not the tab.
 */
async function freshPage() {
  if (page) {
    try {
      await page.close();
    } catch {
      // Already gone, which is exactly the case this guards against.
    }
  }
  page = await browser.newPage();
  await page.setViewport({ width: 1500, height: 1050 });

  // A renderer crash otherwise surfaces only as an opaque "Target closed"
  // from whatever call happened to be in flight.
  page.on('error', (e) => errors.push(`PAGE CRASHED: ${String(e).slice(0, 120)}`));
  page.on('pageerror', (e) => {
    if (/websocket|vite/i.test(e.message)) return; // Vite's dev HMR socket, not the app.
    errors.push(e.message.slice(0, 160));
  });
  page.on('console', (m) => {
    if (m.type() === 'error' && !/websocket|vite|favicon/i.test(m.text())) {
      errors.push(m.text().slice(0, 160));
    }
  });

  // DeviceAccess is how Chrome exposes its own device picker to automation.
  pageSession = await page.target().createCDPSession();
  await pageSession.send('DeviceAccess.enable');
  pageSession.on('DeviceAccess.deviceRequestPrompted', (event) => {
    if (!event.devices.length) return;
    chooserSeen = event.devices;
    pending = event;
  });
}
const settleAndPick = async () => {
  await wait(1500); // Let the chooser finish filling before selecting.
  if (!pending) return false;
  try {
    await pageSession.send('DeviceAccess.selectPrompt', {
      id: pending.id,
      deviceId: pending.devices[0].id,
    });
    return true;
  } catch (e) {
    console.log('    (chooser select failed:', e.message.slice(0, 70), ')');
    return false;
  }
};

async function openOfflineChat() {
  // The tab is reused between rounds, which is both more stable here and
  // closer to what a user does. A new tab is opened only when the old one is
  // unusable - a reload landing mid-evaluate detaches the frame, and every
  // later call then throws about the frame rather than about the app.
  if (!page) await freshPage();
  try {
    await page.goto(URL, { waitUntil: 'load', timeout: 90000 });
  } catch (err) {
    console.log(`    (tab unusable, opening a new one: ${String(err).slice(0, 60)})`);
    await freshPage();
    await page.goto(URL, { waitUntil: 'load', timeout: 90000 });
  }
  await wait(3500);
  // The splash and any guest gate, if this build still has them.
  for (const pattern of [/^skip$/i, /continue as guest/i]) {
    await page.evaluate((src) => {
      const re = new RegExp(src.slice(1, src.lastIndexOf('/')), src.slice(src.lastIndexOf('/') + 1));
      Array.from(document.querySelectorAll('button'))
        .find((b) => re.test((b.textContent || '').trim()))
        ?.click();
    }, String(pattern));
    await wait(500);
  }
  const opened = await page.evaluate(() => {
    const target = Array.from(document.querySelectorAll('button, a')).find((el) =>
      /offline\s*chat/i.test(el.textContent || '')
    );
    if (!target) return false;
    target.click();
    return true;
  });
  await wait(2000);
  return opened;
}

/**
 * Everything the page is currently saying about nearby devices.
 *
 * Scoped to the one panel on purpose. Reading document.body.innerText every
 * 750ms forces a full-document layout, and against this page under software
 * WebGL that was enough to crash the renderer partway through a run - three
 * times, always mid-poll. Reading one subtree is both cheaper and the thing
 * actually being tested.
 */
const readPanel = () =>
  page.evaluate(() => {
    const panel = document.querySelector('[data-testid="nearby-panel"]');
    if (!panel) return { bodyText: '', countBadge: null, sweepText: null, deviceRows: [], hasAddDevice: false };
    const rows = Array.from(panel.querySelectorAll('[class*="rounded-card"]'));
    const text = panel.innerText;
    const countEl = panel.querySelector('[data-testid="device-count"]');
    const sweepEl = panel.querySelector('[data-testid="sweep-status"]');
    // Device rows carry a source badge; that is what distinguishes them.
    // Matched lower-case on purpose: innerText returns text after CSS
    // text-transform and these badges render uppercase, so "You picked it"
    // arrives as "YOU PICKED IT" and a case-sensitive match found no rows at
    // all while the rows were plainly on screen.
    const badges = ['phone radio', 'live scan', 'allowed before', 'you picked it', 'demo - not real'];
    const deviceRows = rows
      .filter((el) => badges.some((b) => (el.innerText || '').toLowerCase().includes(b)))
      .map((el) => (el.innerText || '').split('\n').slice(0, 4).join(' | '));
    return {
      bodyText: text,
      countBadge: countEl?.textContent?.trim() ?? null,
      sweepText: sweepEl?.textContent?.trim() ?? null,
      deviceRows,
      scanButton: Array.from(panel.querySelectorAll('button'))
        .map((b) => (b.textContent || '').trim())
        .find((t) => /scan/i.test(t)),
      hasAddDevice: Array.from(panel.querySelectorAll('button')).some((b) =>
        /add device/i.test(b.textContent || '')
      ),
    };
  });

const clickByText = (re) =>
  page.evaluate((src) => {
    const m = src.match(/^\/(.*)\/([a-z]*)$/);
    const rx = new RegExp(m[1], m[2]);
    const b = Array.from(document.querySelectorAll('button')).find((x) => rx.test(x.textContent || ''));
    if (b) b.click();
    return !!b;
  }, String(re));

/* ------------------------------------------------------------------ run -- */

for (let round = 1; round <= ROUNDS; round++) {
  console.log(`--- round ${round} of ${ROUNDS} ---`);
  try {

  const opened = await openOfflineChat();
  check(opened, 'offline chat opens');

  let panel = await readPanel();
  check(
    !INVENTED.some((n) => panel.bodyText.includes(n)),
    'no invented devices before scanning',
    INVENTED.filter((n) => panel.bodyText.includes(n)).join(', ')
  );

  // Start the scan, then wait for the presence loop to prove it is running
  // rather than assuming it has by now.
  await clickByText(/scan for devices/i);
  panel = await waitFor(readPanel, (p) => !!p.sweepText, 45000, 'the presence loop to report');

  check(
    !INVENTED.some((n) => panel.bodyText.includes(n)),
    'no invented devices after scanning',
    INVENTED.filter((n) => panel.bodyText.includes(n)).join(', ')
  );
  check(!!panel.sweepText, 'presence loop is reporting', panel.sweepText ?? 'no sweep status');
  check(panel.hasAddDevice, 'chooser is offered when passive scan is unavailable');

  // Round 1 grants a device through Chrome's real chooser. Later rounds must
  // find it again with no interaction at all, which is the whole claim.
  if (round === 1) {
    chooserSeen = null;
    pending = null;
    const clicked = await clickByText(/add device/i);
    check(clicked, 'add device button is clickable');
    const picked = await settleAndPick();
    check(picked, 'browser chooser opened and a device was chosen');
    check(
      !!chooserSeen && chooserSeen.length === IN_RANGE.length,
      'chooser listed exactly the devices in range',
      `saw ${chooserSeen?.length ?? 0}, expected ${IN_RANGE.length}`
    );
  }

  panel = await waitFor(
    readPanel,
    (p) => IN_RANGE.some((d) => p.bodyText.includes(d.name)),
    45000,
    'the chosen device to appear'
  );
  const shownNames = IN_RANGE.filter((d) => panel.bodyText.includes(d.name)).map((d) => d.name);
  check(
    shownNames.length > 0,
    round === 1 ? 'a real device appears after being chosen' : 'the granted device is found again with no interaction',
    shownNames.join(', ') || 'none shown'
  );
  check(
    panel.deviceRows.length > 0 && panel.deviceRows.every((r) => !INVENTED.some((n) => r.includes(n))),
    'every listed row is a real device',
    panel.deviceRows.join(' // ') || 'no rows'
  );
  check(
    /allowed before|you picked it|live scan|phone radio/i.test(panel.bodyText),
    'devices are labelled with where they came from'
  );
  console.log(`  count badge: ${panel.countBadge}`);
  console.log(`  rows: ${panel.deviceRows.join('  //  ') || '(none)'}`);

    await clickByText(/stop scan/i);
    await wait(600);
  } catch (err) {
    check(false, `round ${round} completed`, String(err).slice(0, 110));
  }
  console.log('');
}

/*
 * Chrome itself sometimes dies partway through, taking the run with it.
 *
 * It is a crash of the emulated Bluetooth stack, not of the application -
 * always inside a chooser or an advertisement watch against a simulated
 * adapter, never reproducible against a real one. Saying so explicitly
 * matters, because an unexplained "Target closed" reads like the feature
 * broke.
 */
if (!browser.connected) {
  console.log(
    '\nChrome crashed under Bluetooth emulation before the remaining checks could run.\n' +
      'That is a fault in the emulated adapter, not in the application: every check that\n' +
      'did run is reported above.'
  );
  console.log(`\n${failures.length ? `FAILED: ${failures.join('; ')}` : 'ALL CHECKS THAT RAN PASSED'}`);
  process.exit(failures.length ? 1 : 0);
}

/* Demo peers must be opt-in and clearly marked. */
console.log('--- walkthrough peers stay marked and opt-in ---');
await openOfflineChat();
let panel = await readPanel();
check(!panel.bodyText.includes('Demo peer'), 'no demo peers until the walkthrough is switched on');
await clickByText(/sim mode/i);
panel = await waitFor(readPanel, (p) => p.bodyText.includes('Demo peer'), 20000, 'demo peers');
check(panel.bodyText.includes('not a real device'), 'demo peers are labelled as not real');
check(
  /\+ \d+ demo/.test(panel.countBadge ?? ''),
  'demo peers are counted separately from real ones',
  panel.countBadge ?? ''
);
await clickByText(/sim mode/i);
panel = await waitFor(readPanel, (p) => !p.bodyText.includes('Demo peer'), 20000, 'demo peers to clear');
check(!panel.bodyText.includes('Demo peer'), 'switching the walkthrough off removes only the demo peers');

console.log('');
const uniqueErrors = [...new Set(errors)];
check(uniqueErrors.length === 0, 'no console errors', uniqueErrors.slice(0, 3).join(' | '));

await page.evaluate(() => window.scrollTo(0, 0));
await wait(500);
await page.screenshot({ path: '../bluetooth.png' });
await browser.close();

console.log(`\n${failures.length ? `FAILED: ${failures.join('; ')}` : 'ALL CHECKS PASSED'}`);
process.exit(failures.length ? 1 : 0);
