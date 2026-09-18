import React, { useEffect, useRef, useState } from 'react';

/**
 * Live sky behind the whole application (Vanta CLOUDS2).
 *
 * Uses the effect's own default palette - the look from vantajs.com - rather
 * than a recoloured variant, so the background reads as a real sky rather than
 * as interface chrome.
 *
 * Loaded through a dynamic import so three.js lands in its own chunk after
 * first paint: the app is meant to open on a weak connection, and a decorative
 * background must never sit on that path.
 */

interface VantaEffect {
  setOptions: (o: Record<string, unknown>) => void;
  resize: () => void;
  destroy: () => void;
}

export type ThemeMode = 'light' | 'oled';

const SKY: Record<ThemeMode, Record<string, number>> = {
  light: { backgroundColor: 0x4d6675, skyColor: 0x2d4f63, cloudColor: 0x132a38, lightColor: 0x95b6c6, speed: 0.65 },
  oled: { backgroundColor: 0x050a14, skyColor: 0x102b3b, cloudColor: 0x02070c, lightColor: 0x6f98ac, speed: 0.55 },
};

export function VantaBackground({ theme }: { theme: ThemeMode }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const effectRef = useRef<VantaEffect | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // Anyone who has asked for less motion gets a still background instead.
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced || !hostRef.current) return;

    let cancelled = false;

    (async () => {
      try {
        const [THREE, clouds2Mod] = await Promise.all([
          import('three'),
          // vanta ships no type declarations
          import('vanta/dist/vanta.clouds2.min.js') as Promise<Record<string, unknown>>,
        ]);
        if (cancelled || !hostRef.current) return;

        const CLOUDS2 = (clouds2Mod.default ?? clouds2Mod) as (
          o: Record<string, unknown>
        ) => VantaEffect;

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
          ...SKY[theme],
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
  }, [theme]);

  return (
    <div className="storm-background" aria-hidden="true">
      <div ref={hostRef} className="vanta-canvas-host fixed inset-0 z-0 pointer-events-none" style={{ opacity: ready ? 1 : 0, transition: 'opacity 1.2s ease-out' }} />
      <div className="storm-rain" />
      <div className="storm-lightning" />
    </div>
  );
}
