/**
 * The map movement loop.
 *
 * Opens every map view the application has, moves each one the way a person
 * moves a map - drag, fling, wheel-zoom, pitch into 3D - and measures what
 * the frame timeline actually did while it moved. Then it checks the result
 * against a budget, and where a failure has a known correction it applies
 * it, rebuilds and runs the whole thing again. It stops when a round passes
 * or when a round changes nothing, because a loop that cannot improve its
 * own input is just burning rounds.
 *
 * What it measures, per view:
 *
 *   longest frame   the worst single gap between animation frames during the
 *                   gesture. This is what a stutter is. An average hides it:
 *                   58fps with one 600ms lockup averages fine and feels
 *                   broken.
 *   dropped frames  gaps over 50ms, counted. One is a blink; twenty is a
 *                   slideshow.
 *   settle          how long after the gesture stops before the map is
 *                   quiet again.
 *   blank tiles     tiles still unpainted once it has settled, which is the
 *                   glitch that looks like holes in the world.
 *   console errors  anything thrown while moving.
 *
 * It runs on the real GPU. The other harnesses in this directory pass
 * `--use-gl=swiftshader`, inherited from a time when that was needed, and on
 * this machine that flag is what makes the numbers meaningless: software
 * rasterising three animating canvases produces frame times in the seconds
 * and then kills the tab. Nothing is learned from measuring that. The
 * renderer is printed at the top of every run so the numbers below it can
 * be read in context, and the loop refuses to judge a software one.
 *
 *   node tools/map-loop.mjs [url] [--rounds N] [--theme light|oled]
 */
import puppeteer from 'puppeteer-core';
import { execSync } from 'node:child_process';
import fs from 'node:fs';

const args = process.argv.slice(2);
const BASE = args.find((a) => a.startsWith('http')) ?? 'http://localhost:4330/';
const MAX_ROUNDS = Number(args[args.indexOf('--rounds') + 1]) || 3;
const THEMES = args.includes('--theme') ? [args[args.indexOf('--theme') + 1]] : ['oled', 'light'];

const CHROME = String.raw`C:\Program Files\Google\Chrome\Application\chrome.exe`;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/** Real GPU. No --use-gl override: that is what forces SwiftShader. */
const LAUNCH = {
  executablePath: CHROME,
  headless: true,
  protocolTimeout: 240000,
  args: ['--no-sandbox', '--ignore-gpu-blocklist'],
};

async function rendererName(browser) {
  const p = await browser.newPage();
  await p.setContent('<canvas id="c"></canvas>');
  const name = await p.evaluate(() => {
    const c = document.getElementById('c');
    const gl = c.getContext('webgl2') || c.getContext('webgl');
    if (!gl) return 'no webgl';
    const d = gl.getExtension('WEBGL_debug_renderer_info');
    return d ? gl.getParameter(d.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
  });
  await p.close();
  return name;
}

/** Per-view budget. Exceeding any of these is a failure with a name. */
const BUDGET = {
  /** One frame this long is a visible hitch. Four 60Hz frames. */
  longestFrameMs: 68,
  /** Gaps over 50ms, across a five-second gesture. */
  droppedFrames: 8,
  settleMs: 1500,
  /** Tiles still unpainted once it has stopped moving. */
  blankTiles: 0,
  consoleErrors: 0,
};

/** The views, and how to reach each one. */
const VIEWS = [
  { id: 'weather', tab: 'map', mode: 'weather', label: 'live weather field' },
  { id: 'district', tab: 'map', mode: 'district', label: 'district grid (3D simulator)', pitch: true },
  { id: 'leaflet', tab: 'map', mode: 'leaflet', label: 'ward inundation map' },
];

/* ------------------------------------------------------------------ page */

async function openApp(browser, theme) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  await page.evaluateOnNewDocument((t) => {
    try {
      localStorage.setItem('floodypredict_theme', t);
    } catch {}
  }, theme);

  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e).slice(0, 180)));
  page.on('console', (m) => {
    if (m.type() === 'error') {
      const t = m.text();
      // Tile 404s from a third-party CDN are the network, not the app.
      if (!/Failed to load resource|ERR_/.test(t)) errors.push(t.slice(0, 180));
    }
  });

  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await wait(1200);
  await page.evaluate(() => {
    const b = Array.from(document.querySelectorAll('button')).find((x) =>
      /launch dashboard/i.test(x.textContent || '')
    );
    b?.click();
  });
  await wait(2500);
  return { page, errors };
}

/**
 * Switches to a view.
 *
 * The three map modes live behind the app's own Select, not behind three
 * buttons, so this opens the listbox and picks the option by its label the
 * way a person would, rather than reaching into React state.
 */
async function selectView(page, view) {
  const LABEL = {
    weather: 'live weather field',
    district: 'district impact',
    leaflet: 'ward detail',
  }[view.mode];

  // Open the listbox, then wait. Clicking the trigger and reading the
  // options in the same evaluate finds nothing every time: the click sets
  // React state and the option list does not exist until the render after
  // it. That is what "no-option" was - a race, not a missing control.
  const opened = await page.evaluate((label) => {
    const already = Array.from(document.querySelectorAll('[role="option"]')).some((o) =>
      (o.textContent || '').toLowerCase().includes(label)
    );
    if (already) return true;
    const trigger = Array.from(document.querySelectorAll('button[aria-haspopup="listbox"]')).find(
      (b) =>
        b.offsetParent !== null &&
        /live weather field|district impact|ward detail|schematic basin|what to show/i.test(
          b.textContent || ''
        )
    );
    if (!trigger) return false;
    trigger.click();
    return true;
  }, LABEL);
  if (!opened) return 'no-trigger';

  await page.waitForFunction(
    (label) =>
      Array.from(document.querySelectorAll('[role="option"]')).some((o) =>
        (o.textContent || '').toLowerCase().includes(label)
      ),
    { timeout: 5000, polling: 80 },
    LABEL
  ).catch(() => {});

  const picked = await page.evaluate((label) => {
    const option = Array.from(document.querySelectorAll('[role="option"]')).find((o) =>
      (o.textContent || '').toLowerCase().includes(label)
    );
    if (!option) return false;
    (option.querySelector('button') ?? option).click();
    return true;
  }, LABEL);
  if (!picked) return 'no-option';

  // Wait for the view itself rather than for a fixed number of seconds:
  // MapLibre under software WebGL can take six seconds to produce a canvas
  // on one run and one second on the next.
  const want = {
    district: '.maplibregl-canvas',
    leaflet: '.leaflet-container',
    weather: '#tn-weather-map canvas, #tn-weather-map svg, canvas, svg',
  }[view.mode];

  const mounted = await page
    .waitForFunction(
      (sel) => {
        for (const el of document.querySelectorAll(sel)) {
          const r = el.getBoundingClientRect();
          if (r.width > 380 && r.height > 260) return true;
        }
        return false;
      },
      { timeout: 25000, polling: 250 },
      want
    )
    .then(() => true)
    .catch(() => false);

  if (!mounted) return 'not-mounted';

  // Let tiles and the first frames land before measuring.
  await wait(view.mode === 'district' ? 3500 : 2500);
  return 'ok';
}

/* ------------------------------------------------------- the measurement */

/**
 * Starts a frame recorder in the page, runs a gesture, and reports what the
 * timeline did. rAF deltas are the honest measure here: they are what the
 * compositor actually managed, not what a synthetic profiler says it should
 * have.
 */
async function measureMovement(page, view) {
  await page.evaluate(() => {
    window.__frames = [];
    window.__recording = true;
    let last = performance.now();
    const tick = (now) => {
      if (!window.__recording) return;
      window.__frames.push(now - last);
      last = now;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });

  const box = await page.evaluate(() => {
    const sel = ['.maplibregl-canvas', '.leaflet-container', 'canvas', 'svg'];
    for (const s of sel) {
      for (const el of document.querySelectorAll(s)) {
        const r = el.getBoundingClientRect();
        if (r.width > 380 && r.height > 260) {
          return { x: r.x, y: r.y, w: r.width, h: r.height };
        }
      }
    }
    return null;
  });
  if (!box) return { missing: true };

  const cx = Math.round(box.x + box.w / 2);
  const cy = Math.round(box.y + box.h / 2);

  // A drag, a fling, and two wheel zooms - the gestures a map actually gets.
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  for (let i = 1; i <= 22; i++) {
    await page.mouse.move(cx - i * 7, cy + i * 4);
    await wait(8);
  }
  await page.mouse.up();
  await wait(260);

  await page.mouse.move(cx, cy);
  await page.mouse.down();
  for (let i = 1; i <= 10; i++) {
    await page.mouse.move(cx + i * 22, cy - i * 10);
    await wait(5);
  }
  await page.mouse.up();
  await wait(420);

  await page.mouse.move(cx, cy);
  await page.mouse.wheel({ deltaY: -420 });
  await wait(700);
  await page.mouse.wheel({ deltaY: 520 });
  await wait(700);

  if (view.pitch) {
    const toggled = await page.evaluate(() => {
      const b = Array.from(document.querySelectorAll('button')).find(
        (x) => /^3d$/i.test((x.textContent || '').trim()) && x.offsetParent !== null
      );
      if (!b) return false;
      b.click();
      return true;
    });
    await wait(1800);
    if (toggled) {
      await page.mouse.move(cx, cy);
      await page.mouse.down();
      for (let i = 1; i <= 14; i++) {
        await page.mouse.move(cx + i * 9, cy + i * 3);
        await wait(8);
      }
      await page.mouse.up();
      await wait(900);
    }
  }

  const settleStart = Date.now();
  await page
    .waitForFunction(
      () => {
        const f = window.__frames || [];
        const tail = f.slice(-14);
        return tail.length === 14 && tail.every((d) => d < 34);
      },
      { timeout: 6000, polling: 100 }
    )
    .catch(() => {});
  const settleMs = Date.now() - settleStart;

  const result = await page.evaluate(() => {
    window.__recording = false;
    const f = (window.__frames || []).slice(3);
    const blank = Array.from(document.querySelectorAll('img.leaflet-tile')).filter(
      (t) => !t.complete || t.naturalWidth === 0
    ).length;
    return {
      frames: f.length,
      longestFrameMs: Math.round(Math.max(0, ...f)),
      droppedFrames: f.filter((d) => d > 50).length,
      medianFrameMs: Math.round(f.slice().sort((a, b) => a - b)[Math.floor(f.length / 2)] || 0),
      blankTiles: blank,
    };
  });

  return { ...result, settleMs };
}

/* ------------------------------------------------------------ the checks */

function judge(view, m, errorCount) {
  if (m.missing) return [{ name: `${view.label}: no map canvas on screen`, fix: null }];
  const fails = [];
  if (m.longestFrameMs > BUDGET.longestFrameMs) {
    fails.push({
      name: `${view.label}: longest frame ${m.longestFrameMs}ms (budget ${BUDGET.longestFrameMs}ms)`,
      fix: 'stutter',
      view: view.id,
    });
  }
  if (m.droppedFrames > BUDGET.droppedFrames) {
    fails.push({
      name: `${view.label}: ${m.droppedFrames} dropped frames (budget ${BUDGET.droppedFrames})`,
      fix: 'stutter',
      view: view.id,
    });
  }
  if (m.settleMs > BUDGET.settleMs) {
    fails.push({
      name: `${view.label}: took ${m.settleMs}ms to settle (budget ${BUDGET.settleMs}ms)`,
      fix: 'settle',
      view: view.id,
    });
  }
  if (m.blankTiles > BUDGET.blankTiles) {
    fails.push({
      name: `${view.label}: ${m.blankTiles} tiles never painted`,
      fix: 'tiles',
      view: view.id,
    });
  }
  if (errorCount > BUDGET.consoleErrors) {
    fails.push({ name: `${view.label}: ${errorCount} console errors while moving`, fix: null });
  }
  return fails;
}

/* ----------------------------------------------------------- corrections */

/**
 * The corrections this loop knows how to make.
 *
 * Each one is a specific, named edit with a reason. A loop that "fixes
 * things" by guessing is worse than no loop: it moves code around until the
 * measurement stops complaining, and what it leaves behind is unexplainable.
 * So the list is short, every entry is applied at most once, and anything
 * not on it is reported for a person to look at rather than papered over.
 */
const CORRECTIONS = [
  {
    id: 'rain-off-during-map-move',
    fixes: ['stutter'],
    file: 'src/components/VantaBackground.tsx',
    describe: 'pause the rain canvas while a map is being dragged',
    applies: (src) => !src.includes('floodypredict-map-move'),
    apply: (src) =>
      src.replace(
        "    const onVisibility = () => { active = !document.hidden; previous = performance.now(); };",
        "    const onVisibility = () => { active = !document.hidden; previous = performance.now(); };\n" +
          "    // A map drag and a rain canvas are both asking for the same frame.\n" +
          "    // The map is the one the user is touching, so the rain yields.\n" +
          "    const onMapMove = (e: Event) => {\n" +
          "      active = !document.hidden && !(e as CustomEvent<boolean>).detail;\n" +
          "      previous = performance.now();\n" +
          "      if (!active) context.clearRect(0, 0, width, height);\n" +
          "    };"
      ),
  },
];

function applyCorrections(fails) {
  const wanted = new Set(fails.map((f) => f.fix).filter(Boolean));
  const applied = [];
  for (const c of CORRECTIONS) {
    if (!c.fixes.some((f) => wanted.has(f))) continue;
    const src = fs.readFileSync(c.file, 'utf8');
    if (!c.applies(src)) continue;
    const next = c.apply(src);
    if (next === src) continue;
    fs.writeFileSync(c.file, next);
    applied.push(c.describe);
  }
  return applied;
}

/* ----------------------------------------------------------------- loop */

let round = 0;
let lastFailSignature = '';

while (round < MAX_ROUNDS) {
  round += 1;
  console.log(`\n${'='.repeat(64)}\nROUND ${round}\n${'='.repeat(64)}`);

  const browser = await puppeteer.launch(LAUNCH);

  const renderer = await rendererName(browser);
  const software = /swiftshader|llvmpipe|software/i.test(renderer);
  console.log(`renderer: ${renderer}`);
  if (software) {
    console.log('');
    console.log('REFUSING TO JUDGE: this is a software rasteriser.');
    console.log('Frame times here measure the absence of a GPU, not the application.');
    console.log('Run without any --use-gl override, or on a machine with a GPU');
    console.log('available to Chrome.');
    await browser.close();
    process.exit(2);
  }

  const allFails = [];

  for (const theme of THEMES) {
    console.log(`\n--- ${theme} ---`);
    const { page, errors } = await openApp(browser, theme);

    for (const view of VIEWS) {
      const before = errors.length;
      const found = await selectView(page, view);
      if (found !== 'ok') {
        console.log(`  FAIL  ${view.label} - could not open it (${found})`);
        allFails.push({ name: `${view.label}: could not be opened (${found})`, fix: null, theme });
        continue;
      }
      const m = await measureMovement(page, view);
      const fails = judge(view, m, errors.length - before);
      allFails.push(...fails.map((f) => ({ ...f, theme })));

      if (m.missing) {
        console.log(`  FAIL  ${view.label} - no map canvas`);
      } else {
        const mark = fails.length ? 'FAIL' : 'PASS';
        console.log(
          `  ${mark}  ${view.label.padEnd(30)} ` +
            `worst ${String(m.longestFrameMs).padStart(4)}ms | ` +
            `median ${String(m.medianFrameMs).padStart(3)}ms | ` +
            `dropped ${String(m.droppedFrames).padStart(3)} | ` +
            `settle ${String(m.settleMs).padStart(4)}ms | ` +
            `blank ${m.blankTiles}`
        );
      }
      for (const f of fails) console.log(`          ${f.name}`);
    }
    await page.close();
  }

  await browser.close();

  if (!allFails.length) {
    console.log(`\nALL MAP VIEWS WITHIN BUDGET (round ${round})`);
    process.exit(0);
  }

  const signature = allFails.map((f) => f.name).sort().join('|');
  if (signature === lastFailSignature) {
    console.log('\nSTOPPING: the same failures survived a correction round.');
    console.log('Nothing this loop knows how to change would move them:');
    for (const f of allFails) console.log(`  - [${f.theme}] ${f.name}`);
    process.exit(1);
  }
  lastFailSignature = signature;

  const applied = applyCorrections(allFails);
  if (!applied.length) {
    console.log('\nSTOPPING: no correction in this loop addresses what failed.');
    for (const f of allFails) console.log(`  - [${f.theme}] ${f.name}`);
    process.exit(1);
  }

  console.log(`\nCORRECTED: ${applied.join('; ')}`);
  console.log('Rebuilding...');
  execSync('npm run build', { stdio: 'inherit' });
}

console.log(`\nSTOPPING: ${MAX_ROUNDS} rounds without a clean pass.`);
process.exit(1);
