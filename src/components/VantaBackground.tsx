import React, { useEffect, useRef, useState } from 'react';
import { useTheme } from '../theme/ThemeProvider';

/**
 * Animated sky behind the whole application (Vanta CLOUDS2).
 *
 * Loaded through a dynamic import so three.js lands in its own chunk after
 * first paint rather than in the main bundle - the app is meant to open on a
 * weak connection, and a decorative background must never be on that path.
 *
 * Skipped entirely when the viewer has asked for reduced motion, or on very
 * small screens where a WebGL canvas costs battery for almost no effect.
 */

interface VantaEffect {
  setOptions: (o: Record<string, unknown>) => void;
  resize: () => void;
  destroy: () => void;
}

const SKIES: Record<string, { backgroundColor: number; skyColor: number; cloudColor: number; lightColor: number; speed: number }> = {
  // Overcast monsoon daylight - grey-blue sky, bright cloud edges.
  light: {
    backgroundColor: 0xdfe7f1,
    skyColor: 0x8fb3d9,
    cloudColor: 0xc9d8e8,
    lightColor: 0xffffff,
    speed: 0.7,
  },
  // Night storm. Near-black ground so the OLED saving is real.
  oled: {
    backgroundColor: 0x000000,
    skyColor: 0x03060d,
    cloudColor: 0x0d141f,
    lightColor: 0x1d2b3d,
    speed: 0.5,
  },
  // Base for Situational; hue and speed are overridden from live risk below.
  dynamic: {
    backgroundColor: 0x050c16,
    skyColor: 0x0b2740,
    cloudColor: 0x1b3d5c,
    lightColor: 0x3f7fa8,
    speed: 0.8,
  },
};

/** Blend two packed RGB colours. */
function mix(a: number, b: number, t: number): number {
  const ar = (a >> 16) & 255,
    ag = (a >> 8) & 255,
    ab = a & 255;
  const br = (b >> 16) & 255,
    bg = (b >> 8) & 255,
    bb = b & 255;
  const r = Math.round(ar + (br - ar) * t);
  const g = Math.round(ag + (bg - ag) * t);
  const bl = Math.round(ab + (bb - ab) * t);
  return (r << 16) | (g << 8) | bl;
}

export function VantaBackground() {
  const hostRef = useRef<HTMLDivElement>(null);
  const effectRef = useRef<VantaEffect | null>(null);
  const [ready, setReady] = useState(false);
  const { theme, riskLevel } = useTheme();

  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const tooSmall = window.matchMedia('(max-width: 640px)').matches;
    if (reduced || tooSmall || !hostRef.current) return;

    let cancelled = false;

    (async () => {
      try {
        const [THREE, clouds2Mod] = await Promise.all([
          import('three'),
          // vanta ships no type declarations
          import('vanta/dist/vanta.clouds2.min.js') as Promise<Record<string, unknown>>,
        ]);
        if (cancelled || !hostRef.current) return;

        const CLOUDS2 = (clouds2Mod.default ?? clouds2Mod) as (o: Record<string, unknown>) => VantaEffect;

        effectRef.current = CLOUDS2({
          el: hostRef.current,
          THREE,
          mouseControls: false,
          touchControls: false,
          gyroControls: false,
          minHeight: 200,
          minWidth: 200,
          scale: 1,
          scaleMobile: 1,
          texturePath: '/gallery/noise.png',
          ...SKIES[theme],
        });
        setReady(true);
      } catch (err) {
        // A decorative background is never worth breaking the page for.
        console.warn('Ambient background unavailable:', err);
      }
    })();

    return () => {
      cancelled = true;
      effectRef.current?.destroy();
      effectRef.current = null;
    };
    // Rebuilt only on theme change; live risk is applied without a rebuild.
  }, [theme]);

  // Situational theme: warm the sky and quicken the drift as risk climbs.
  useEffect(() => {
    if (!effectRef.current || theme !== 'dynamic') return;
    const t = Math.max(0, Math.min(1, riskLevel));
    effectRef.current.setOptions({
      skyColor: mix(0x0b2740, 0x4a1030, t),
      cloudColor: mix(0x1b3d5c, 0x7a2246, t),
      lightColor: mix(0x3f7fa8, 0xd05f8c, t),
      speed: 0.8 + t * 2.2,
    });
  }, [theme, riskLevel]);

  return (
    <div
      ref={hostRef}
      aria-hidden="true"
      className="vanta-canvas-host fixed inset-0 z-0 pointer-events-none"
      style={{
        opacity: ready ? (theme === 'oled' ? 0.5 : 0.85) : 0,
        transition: 'opacity 1.2s ease-out',
      }}
    />
  );
}
