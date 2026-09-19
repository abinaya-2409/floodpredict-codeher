import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

/**
 * The stylesheet is the contract.
 *
 * Every one of these guards a defect that shipped. The light theme painted
 * the same dark slate behind the page as the dark one did, so it never
 * looked like a light theme. Severity was set as type in colours chosen for
 * filled shapes, so "MODERATE" was yellow-on-white at 1.5:1. Components
 * reached past the tokens into Tailwind's raw palette, which is how a
 * cyan-300 label ended up invisible on a white card. None of those are
 * catchable by looking at one theme.
 */

const ROOT = path.resolve(__dirname, '../..');
const CSS = fs.readFileSync(path.join(ROOT, 'src/index.css'), 'utf8');

/**
 * Every custom property a selector sets, across all of its blocks.
 *
 * A selector appears more than once - `:root[data-theme="oled"]` sets
 * `color-scheme` inside `@layer base` and its whole palette outside it - so
 * reading only the first block finds one declaration and misses forty.
 */
function tokensIn(selector: string): Record<string, string> {
  const out: Record<string, string> = {};
  let found = false;
  let from = 0;

  for (;;) {
    const at = CSS.indexOf(selector + ' {', from);
    if (at === -1) break;
    found = true;

    // Walk to the matching close brace rather than to the first one.
    let depth = 0;
    let i = at + selector.length + 1;
    const start = i + 1;
    for (; i < CSS.length; i++) {
      if (CSS[i] === '{') depth++;
      else if (CSS[i] === '}') {
        depth--;
        if (depth === 0) break;
      }
    }

    const body = CSS.slice(start, i);
    for (const m of body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) out[m[1]] = m[2].trim();
    from = i;
  }

  if (!found) throw new Error(`no block for ${selector}`);
  return out;
}

const THEME = tokensIn('@theme');
const LIGHT = { ...THEME, ...tokensIn(':root[data-theme="light"]') };
const OLED = { ...THEME, ...tokensIn(':root[data-theme="oled"]') };

/* --------------------------------------------------------------- contrast */

function srgbToLinear(c: number): number {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string): number {
  const h = hex.trim().replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16));
  return 0.2126 * srgbToLinear(r) + 0.7152 * srgbToLinear(g) + 0.0722 * srgbToLinear(b);
}

function contrast(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

/* ------------------------------------------------------------------ tests */

describe('the two themes are actually two themes', () => {
  it('does not paint the same sky behind both', () => {
    // This is the bug that made light mode look like dark mode: one
    // hardcoded #2d4f63 slab behind the page, in both.
    expect(LIGHT['--sky-base']).toBeDefined();
    expect(OLED['--sky-base']).toBeDefined();
    expect(LIGHT['--sky-base']).not.toBe(OLED['--sky-base']);
  });

  it('gives the OLED theme a true black page, not a dark navy one', () => {
    expect(OLED['--color-bg']).toBe('#000000');
    expect(OLED['--sky-base']).toBe('#000000');
    expect(OLED['--color-map-canvas']).toBe('#000000');
  });

  it('keeps OLED surfaces off pure black so panels are still findable', () => {
    // A panel that is also #000 on a #000 page is an invisible panel. It
    // has to be lifted - just not far.
    const lift = luminance(OLED['--color-surface']);
    expect(lift).toBeGreaterThan(0);
    expect(lift).toBeLessThan(0.02);
  });

  it('names a distinct map canvas and surround in both themes', () => {
    for (const [name, t] of [['light', LIGHT], ['oled', OLED]] as const) {
      expect(t['--color-map-canvas'], name).toBeDefined();
      expect(t['--color-map-surround'], name).toBeDefined();
    }
  });
});

describe('text is readable on the surface it sits on', () => {
  const LEVELS = ['low', 'moderate', 'high', 'severe', 'critical'] as const;

  it('defines a readable ink for every severity level, in both themes', () => {
    for (const level of LEVELS) {
      expect(LIGHT[`--color-risk-${level}-ink`], `light ${level}`).toBeDefined();
      expect(OLED[`--color-risk-${level}-ink`], `oled ${level}`).toBeDefined();
    }
  });

  it('clears 4.5:1 for severity text on a light surface', () => {
    for (const level of LEVELS) {
      const ratio = contrast(LIGHT[`--color-risk-${level}-ink`], '#ffffff');
      expect(ratio, `light ${level} on white = ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('clears 4.5:1 for severity text on the OLED surface', () => {
    for (const level of LEVELS) {
      const ratio = contrast(OLED[`--color-risk-${level}-ink`], OLED['--color-surface']);
      expect(ratio, `oled ${level} = ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('clears 4.5:1 for body and secondary text in both themes', () => {
    const pairs = [
      ['light fg', LIGHT['--color-fg'], '#ffffff'],
      ['light fg-soft', LIGHT['--color-fg-soft'], '#ffffff'],
      ['light muted', LIGHT['--color-muted'], '#ffffff'],
      ['oled fg', OLED['--color-fg'], OLED['--color-surface']],
      ['oled fg-soft', OLED['--color-fg-soft'], OLED['--color-surface']],
      ['oled muted', OLED['--color-muted'], OLED['--color-surface']],
    ] as const;
    for (const [name, fg, bg] of pairs) {
      const ratio = contrast(fg, bg);
      expect(ratio, `${name} = ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('clears 4.5:1 for the accent and the status colours', () => {
    const checks = [
      ['light accent', LIGHT['--color-accent'], '#ffffff'],
      ['light positive', LIGHT['--color-positive'], '#ffffff'],
      ['light warning', LIGHT['--color-warning'], '#ffffff'],
      ['light danger', LIGHT['--color-danger'], '#ffffff'],
      ['oled accent', OLED['--color-accent'], OLED['--color-surface']],
      ['oled positive', OLED['--color-positive'], OLED['--color-surface']],
      ['oled warning', OLED['--color-warning'], OLED['--color-surface']],
      ['oled danger', OLED['--color-danger'], OLED['--color-surface']],
    ] as const;
    for (const [name, fg, bg] of checks) {
      const ratio = contrast(fg, bg);
      expect(ratio, `${name} = ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('sets the severity pill label in ink, not in the fill colour', () => {
    const badge = fs.readFileSync(path.join(ROOT, 'src/components/ui/Badge.tsx'), 'utf8');
    // `color: c` where c is the ramp value is how "Watch" became #f5d020
    // type on a 14% #f5d020 pill.
    expect(badge).toContain('RISK_INK');
    expect(badge).toMatch(/color:\s*RISK_INK\[level\]/);
  });

  it('puts legible text on a filled accent button', () => {
    for (const [name, t] of [['light', LIGHT], ['oled', OLED]] as const) {
      const ratio = contrast(t['--color-on-accent'], t['--color-accent']);
      expect(ratio, `${name} on-accent = ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5);
    }
  });
});

describe('components go through the tokens', () => {
  const HUES =
    'slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|' +
    'cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose';
  const RAW = new RegExp(
    `\\b(?:text|bg|border|ring|fill|stroke|from|via|to|divide|placeholder)-(?:${HUES})-[0-9]{2,3}`,
    'g'
  );

  function walk(dir: string, out: string[] = []): string[] {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (e.name !== '__tests__') walk(full, out);
      } else if (e.name.endsWith('.tsx')) out.push(full);
    }
    return out;
  }

  it('uses no raw Tailwind palette colour anywhere in the interface', () => {
    const offenders: string[] = [];
    for (const file of walk(path.join(ROOT, 'src'))) {
      const hits = fs.readFileSync(file, 'utf8').match(RAW);
      if (hits) {
        offenders.push(`${path.relative(ROOT, file)}: ${[...new Set(hits)].join(', ')}`);
      }
    }
    // A raw palette value is a colour that cannot follow the theme. Each one
    // is a element that looked right in whichever theme it was written in
    // and wrong in the other.
    expect(offenders).toEqual([]);
  });

  it('routes the header and the main column through the one container', () => {
    const navbar = fs.readFileSync(path.join(ROOT, 'src/components/Navbar.tsx'), 'utf8');
    const app = fs.readFileSync(path.join(ROOT, 'src/App.tsx'), 'utf8');
    // The 8px the header used to sit wider than the cards below it came from
    // these two disagreeing about their own padding.
    expect(navbar).toContain('className="shell');
    expect(app).toContain('className="shell');
    expect(navbar).not.toMatch(/max-w-7xl/);
    expect(app).not.toMatch(/max-w-7xl/);
  });
});

describe('the interface adapts to the device', () => {
  it('gives touch devices a 44px minimum target', () => {
    expect(CSS).toMatch(/@media \(pointer: coarse\)[\s\S]{0,700}min-height: 44px/);
  });

  it('stops iOS zooming the page when an input takes focus', () => {
    expect(CSS).toMatch(/font-size: max\(16px/);
  });

  it('measures full-height panels against the visible viewport', () => {
    expect(CSS).toContain('100dvh');
  });

  it('keeps content clear of the notch and the home indicator', () => {
    expect(CSS).toContain('env(safe-area-inset-left');
    expect(CSS).toContain('env(safe-area-inset-top');
    expect(CSS).toContain('env(safe-area-inset-bottom');
  });

  it('honours a request for less motion', () => {
    // This block was silently dropped for months: the rule above it was an
    // unterminated selector list, so the parser ate the @media that followed.
    const blocks = CSS.match(/@media \(prefers-reduced-motion: reduce\)/g) ?? [];
    expect(blocks.length).toBeGreaterThanOrEqual(3);
    expect(CSS).toMatch(/@media \(prefers-reduced-motion: reduce\) \{[\s\S]{0,200}\.storm-lightning/);
  });
});

describe('the stylesheet parses', () => {
  it('has no unterminated selector list', () => {
    // The specific shape of the bug that ate the reduced-motion rule:
    // a selector ending in a comma with an at-rule on the next line.
    expect(CSS).not.toMatch(/,\s*\n\s*\n*\s*@media/);
  });

  it('balances its braces', () => {
    const open = (CSS.match(/\{/g) ?? []).length;
    const close = (CSS.match(/\}/g) ?? []).length;
    expect(open).toBe(close);
  });
});
