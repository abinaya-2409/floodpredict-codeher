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

/**
 * Whether this device should run the animated background at all.
 *
 * Measured, not guessed: on an emulated Pixel 7 the WebGL sky and the rain
 * canvas together pushed a bare `1 + 1` evaluated in the page from under a
 * millisecond to 4.6 seconds. A background that decorative is not worth a
 * four second main thread stall on the device most likely to be holding this
 * app during a flood - taps go unanswered and the message alert is late.
 *
 * So phones get a still gradient. The checks, in order of how reliable they
 * are: an explicit request for less motion, a small screen, a coarse pointer
 * (touch), and finally the weak-hardware hints, which only some browsers
 * report and which are therefore last.
 */
function prefersStillBackground(): boolean {
  if (typeof window === 'undefined') return true;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return true;
  if (window.matchMedia('(max-width: 820px)').matches) return true;
  if (window.matchMedia('(pointer: coarse)').matches) return true;

  const nav = navigator as Navigator & { deviceMemory?: number };
  if (typeof nav.deviceMemory === 'number' && nav.deviceMemory <= 4) return true;
  if (typeof navigator.hardwareConcurrency === 'number' && navigator.hardwareConcurrency <= 4) {
    return true;
  }
  return false;
}

const SKY: Record<ThemeMode, Record<string, number>> = {
  light: { backgroundColor: 0x4d6675, skyColor: 0x2d4f63, cloudColor: 0x132a38, lightColor: 0x95b6c6, speed: 0.65 },
  oled: { backgroundColor: 0x050a14, skyColor: 0x102b3b, cloudColor: 0x02070c, lightColor: 0x6f98ac, speed: 0.55 },
};

export function VantaBackground({ theme }: { theme: ThemeMode }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const rainRef = useRef<HTMLCanvasElement>(null);
  const effectRef = useRef<VantaEffect | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // Skipped entirely on phones: this also means three.js is never even
    // downloaded there, which is a meaningful saving on a weak connection.
    if (prefersStillBackground() || !hostRef.current) return;

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

  useEffect(() => {
    const canvas = rainRef.current;
    if (!canvas || prefersStillBackground()) return;
    const context = canvas.getContext('2d');
    if (!context) return;

    type Drop = { x: number; y: number; length: number; speed: number; alpha: number; drift: number };
    let width = 0;
    let height = 0;
    let frame = 0;
    let previous = performance.now();
    let active = !document.hidden;
    let drops: Drop[] = [];

    const makeDrop = (startAbove = false): Drop => ({
      x: Math.random() * width,
      y: startAbove ? -Math.random() * height : Math.random() * height,
      length: 10 + Math.random() * 16,
      speed: 360 + Math.random() * 340,
      alpha: 0.08 + Math.random() * 0.16,
      drift: -35 - Math.random() * 45,
    });

    const resize = () => {
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      drops = Array.from({ length: width < 700 ? 58 : 118 }, () => makeDrop());
    };

    const render = (now: number) => {
      const delta = Math.min((now - previous) / 1000, 0.05);
      previous = now;
      if (active) {
        context.clearRect(0, 0, width, height);
        context.lineWidth = 1;
        context.lineCap = 'round';
        for (const drop of drops) {
          drop.x += drop.drift * delta;
          drop.y += drop.speed * delta;
          if (drop.y - drop.length > height || drop.x < -20) Object.assign(drop, makeDrop(true));
          context.strokeStyle = `rgb(210 239 250 / ${drop.alpha})`;
          context.beginPath();
          context.moveTo(drop.x, drop.y - drop.length);
          context.lineTo(drop.x + drop.drift * 0.035, drop.y);
          context.stroke();
        }
      }
      frame = requestAnimationFrame(render);
    };

    const onVisibility = () => { active = !document.hidden; previous = performance.now(); };
    resize();
    window.addEventListener('resize', resize, { passive: true });
    document.addEventListener('visibilitychange', onVisibility);
    frame = requestAnimationFrame(render);
    return () => { cancelAnimationFrame(frame); window.removeEventListener('resize', resize); document.removeEventListener('visibilitychange', onVisibility); };
  }, []);

  return (
    <div className="storm-background" aria-hidden="true">
      <div ref={hostRef} className="vanta-canvas-host fixed inset-0 z-0 pointer-events-none" style={{ opacity: ready ? 1 : 0, transition: 'opacity 1.2s ease-out' }} />
      <canvas ref={rainRef} className="storm-rain" />
      <div className="storm-lightning" />
    </div>
  );
}
