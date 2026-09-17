import React, { useEffect, useState } from 'react';
import { LogoMark } from './Logo';

/**
 * Opening screen.
 *
 * It holds for as long as the app genuinely needs and not a moment longer:
 * each line appears as that piece of work actually completes, then the whole
 * thing fades. A splash that outlasts the load is just a delay, so this one
 * is capped and can be skipped.
 *
 * The rising waterline is the only ornament, and it doubles as the progress
 * bar - the thing being waited for is a flood model, so the wait looks like
 * one.
 */

const STEPS = [
  'Loading hydrological engine',
  'Indexing ward demographics',
  'Computing vulnerability index',
  'Ranking evacuation priority',
];

export function SplashScreen({ onDone }: { onDone: () => void }) {
  const [step, setStep] = useState(0);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    // Respect reduced motion by skipping the sequence outright.
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      onDone();
      return;
    }

    const timers: number[] = [];
    STEPS.forEach((_, i) => {
      timers.push(window.setTimeout(() => setStep(i + 1), 260 + i * 240));
    });
    timers.push(window.setTimeout(() => setLeaving(true), 260 + STEPS.length * 240));
    timers.push(window.setTimeout(onDone, 260 + STEPS.length * 240 + 620));

    return () => timers.forEach(window.clearTimeout);
  }, [onDone]);

  const progress = (step / STEPS.length) * 100;

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label="Loading JalRakshak"
      onClick={onDone}
      className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-bg-deep transition-opacity duration-500"
      style={{ opacity: leaving ? 0 : 1, pointerEvents: leaving ? 'none' : 'auto' }}
    >
      {/* Rising water. Height tracks real progress, not a fixed animation. */}
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 transition-[height] duration-700 ease-out"
        style={{
          height: `${progress}%`,
          background:
            'linear-gradient(to top, color-mix(in oklab, var(--color-accent) 26%, transparent), transparent)',
        }}
        aria-hidden="true"
      >
        <div className="splash-wave absolute inset-x-0 top-0 h-px bg-accent/60" />
      </div>

      <div className="relative flex flex-col items-center gap-5 px-6 text-center">
        <LogoMark className="splash-mark h-14 w-14 text-accent" />

        <div>
          <h1 className="font-display text-2xl font-extrabold tracking-tight text-fg">
            JalRakshak
          </h1>
          <p className="mt-1.5 font-mono text-micro uppercase tracking-[0.28em] text-subtle">
            Flood Intelligence
          </p>
        </div>

        {/* Progress, stated rather than implied. */}
        <div
          className="h-0.5 w-56 overflow-hidden rounded-full bg-surface-2"
          role="progressbar"
          aria-valuenow={Math.round(progress)}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div
            className="h-full rounded-full bg-accent transition-[width] duration-500 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>

        <p className="h-4 font-mono text-mini text-muted" aria-live="polite">
          {STEPS[Math.min(step, STEPS.length - 1)]}
          <span className="splash-dots" aria-hidden="true" />
        </p>
      </div>

      <button
        onClick={onDone}
        className="absolute bottom-8 rounded-full border border-line px-4 py-1.5 text-mini font-semibold text-muted transition-colors hover:border-line-strong hover:text-fg cursor-pointer"
      >
        Skip
      </button>
    </div>
  );
}
