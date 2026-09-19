import React, { useEffect, useRef, useState } from 'react';
import { LogoMark } from './Logo';
import { ArrowRight } from 'lucide-react';

/**
 * The loading screen.
 *
 * It used to list five startup steps against invented equipment
 * designations - SAT-INSAT-3DR, RADAR-IMD-TN, HYDRO-MESH-200,
 * AI-SURFACE-INUNDATION, DISPATCH-ACTIVE - beside labels like "Orbital
 * telemetry lock" and "Neural risk assessment", with a live coordinate
 * readout and a "Core v2.4" build badge in the corner.
 *
 * None of it was real. The screen runs on a timer; it is not waiting on a
 * satellite, and there is no hydrodynamic mesh being warmed up behind it.
 * Dressing a three-second wait as a mission console is the kind of detail
 * that makes someone distrust the numbers on the next screen, which are
 * real. So it says what it is: the application is opening.
 */
export function SplashScreen({ onDone }: { onDone: () => void }) {
  const [percent, setPercent] = useState(0);
  const [isLeaving, setIsLeaving] = useState(false);
  const finishedRef = useRef(false);

  const handleFinish = () => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    setIsLeaving(true);
    setTimeout(onDone, 380);
  };

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      onDone();
      return;
    }

    const interval = setInterval(() => {
      setPercent((prev) => (prev >= 100 ? 100 : Math.min(prev + Math.floor(Math.random() * 4) + 3, 100)));
    }, 55);

    const done = setTimeout(() => {
      setPercent(100);
      handleFinish();
    }, 1900);

    return () => {
      clearInterval(interval);
      clearTimeout(done);
    };
  }, []);

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label="Loading FloodyLink"
      onClick={handleFinish}
      className={`splash fixed inset-0 z-[99999] flex select-none flex-col items-center justify-center overflow-hidden transition-opacity duration-400 ${
        isLeaving ? 'pointer-events-none opacity-0' : 'opacity-100'
      }`}
    >
      <style>{`
        @keyframes splashSonar { from { transform: scale(.75); opacity: .55; } to { transform: scale(2.2); opacity: 0; } }
      `}</style>

      {/* Atmosphere, from the theme tokens, so the screen the app opens on
          and the screen it becomes are the same product. */}
      <div className="pointer-events-none absolute inset-0" aria-hidden="true">
        <div className="splash-halo absolute left-1/2 top-1/2 h-[min(620px,150vw)] w-[min(620px,150vw)] -translate-x-1/2 -translate-y-1/2 rounded-full" />
        <div className="absolute left-1/2 top-1/2 h-[min(300px,72vw)] w-[min(300px,72vw)] -translate-x-1/2 -translate-y-1/2">
          {[0, 1.4].map((delay) => (
            <div
              key={delay}
              className="splash-ring absolute inset-0 rounded-full"
              style={{ animation: `splashSonar 3.4s cubic-bezier(.2,.8,.2,1) ${delay}s infinite` }}
            />
          ))}
        </div>
      </div>

      {/* `.shell` sets a max-width, so putting max-w-sm on the same element
          is two rules fighting over one property and the wider one wins -
          which is how the progress bar ended up spanning the whole window.
          The shell keeps the gutters; the inner box keeps the measure. */}
      <div className="shell relative z-10 flex w-full justify-center">
        <main className="flex w-full max-w-sm flex-col items-center text-center">
          <div className="splash-scope mb-6 flex h-20 w-20 items-center justify-center rounded-card">
            <LogoMark className="h-10 w-10 text-accent" />
          </div>

          <h1 className="font-display text-3xl font-extrabold tracking-tight text-fg sm:text-4xl">
            FloodyLink
          </h1>
          <p className="mt-2 text-xs text-fg-soft sm:text-sm">
            Flood risk and early warning for Tamil Nadu
          </p>

          <div
            className="splash-track relative mt-7 h-1 w-full overflow-hidden rounded-full"
            role="progressbar"
            aria-valuenow={percent}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div
              className="splash-fill h-full rounded-full transition-[width] duration-150 ease-out"
              style={{ width: `${percent}%` }}
            />
          </div>

          <button
            onClick={(e) => {
              e.stopPropagation();
              handleFinish();
            }}
            className="mt-7 inline-flex h-10 cursor-pointer items-center gap-2 rounded-full border border-accent/35 bg-accent/10 px-4 text-xs font-semibold text-accent transition-colors hover:bg-accent/20"
          >
            <span>Open</span>
            <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </main>
      </div>
    </div>
  );
}
