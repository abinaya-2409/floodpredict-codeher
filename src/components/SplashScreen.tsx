import React, { useEffect, useRef, useState } from 'react';
import { LogoMark } from './Logo';
import { Activity, ArrowRight, CheckCircle2, CloudRain, Cpu, Satellite, ShieldCheck, Waves } from 'lucide-react';

interface LoadingStep {
  label: string;
  code: string;
  icon: React.ComponentType<{ className?: string }>;
}

const STEPS: LoadingStep[] = [
  { label: 'Orbital telemetry lock', code: 'SAT-INSAT-3DR', icon: Satellite },
  { label: 'Doppler radar calibration', code: 'RADAR-IMD-TN', icon: CloudRain },
  { label: 'Hydrodynamic basin simulation', code: 'HYDRO-MESH-200', icon: Waves },
  { label: 'Neural risk assessment', code: 'AI-SURFACE-INUNDATION', icon: Cpu },
  { label: 'Disaster response network', code: 'DISPATCH-ACTIVE', icon: ShieldCheck },
];

const STEP_MS = 520;

/**
 * The loading screen.
 *
 * Two things were wrong with it beyond colour. It tracked which of the five
 * startup steps was running, and which had finished, and rendered neither -
 * so the state existed, advanced, and was thrown away, leaving a progress
 * bar with nothing to say. And it was painted black with pale grey type
 * whatever the theme was, which meant entering the light theme began with a
 * black screen and ended with a white one.
 *
 * It now reads the theme the same way the rest of the app does, off the
 * document element, which `index.html` sets before the first paint. In the
 * OLED theme the page is a true #000 with the accent colours doing all the
 * work; in light it is the same overcast sky the dashboard sits on.
 */
export function SplashScreen({ onDone }: { onDone: () => void }) {
  const [currentStep, setCurrentStep] = useState(0);
  const [percent, setPercent] = useState(0);
  const [isLeaving, setIsLeaving] = useState(false);
  const finishedRef = useRef(false);

  const handleFinish = () => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    setIsLeaving(true);
    setTimeout(onDone, 420);
  };

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      onDone();
      return;
    }

    const interval = setInterval(() => {
      setPercent((prev) => (prev >= 100 ? 100 : Math.min(prev + Math.floor(Math.random() * 3) + 2, 100)));
    }, 55);

    const stepTimers = STEPS.map((_, idx) =>
      setTimeout(() => setCurrentStep(idx), idx * STEP_MS)
    );

    const completeTimer = setTimeout(() => {
      setPercent(100);
      handleFinish();
    }, STEPS.length * STEP_MS + 650);

    return () => {
      clearInterval(interval);
      stepTimers.forEach(clearTimeout);
      clearTimeout(completeTimer);
    };
  }, []);

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label="Loading FloodyLink"
      onClick={handleFinish}
      className={`splash fixed inset-0 z-[99999] flex select-none flex-col items-center justify-between overflow-hidden transition-opacity duration-500 ${
        isLeaving ? 'pointer-events-none opacity-0' : 'opacity-100'
      }`}
    >
      <style>{`
        @keyframes splashSweep { to { transform: rotate(360deg); } }
        @keyframes splashSonar { from { transform: scale(0.72); opacity: .7; } to { transform: scale(2.3); opacity: 0; } }
        @keyframes splashShimmer { from { transform: translateX(-100%); } to { transform: translateX(260%); } }
      `}</style>

      {/* Atmosphere. Every value here is a theme token, so the OLED theme
          gets a true black field with two coloured glows and the light theme
          gets the same overcast sky the dashboard sits on. */}
      <div className="pointer-events-none absolute inset-0" aria-hidden="true">
        <div className="splash-grid absolute inset-0" />
        <div className="splash-halo absolute left-1/2 top-1/2 h-[min(680px,150vw)] w-[min(680px,150vw)] -translate-x-1/2 -translate-y-1/2 rounded-full" />
        <div className="absolute left-1/2 top-1/2 h-[min(360px,80vw)] w-[min(360px,80vw)] -translate-x-1/2 -translate-y-1/2">
          {[0, 1.2, 2.4].map((delay) => (
            <div
              key={delay}
              className="splash-ring absolute inset-0 rounded-full"
              style={{ animation: `splashSonar 3.5s cubic-bezier(.2,.8,.2,1) ${delay}s infinite` }}
            />
          ))}
        </div>
      </div>

      {/* Head. `shell` is the same container the dashboard uses, so the
          loading screen and the page it becomes share one left edge. */}
      <header className="shell pad-safe-top relative z-10 flex items-center justify-between gap-3 pt-5 text-xs">
        <span className="inline-flex items-center gap-2 rounded-full border border-accent/30 bg-accent/10 px-3 py-1.5 font-mono text-micro font-semibold uppercase tracking-[0.14em] text-accent">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-accent" />
          </span>
          FloodyLink Core
        </span>
        <span className="hidden font-mono text-mini text-muted sm:inline">13.0827&deg;N, 80.2707&deg;E</span>
      </header>

      {/* Body */}
      <main className="shell relative z-10 my-auto flex w-full max-w-lg flex-col items-center py-6 text-center">
        <div className="relative mb-6 flex items-center justify-center">
          <div className="splash-scope relative flex h-28 w-28 items-center justify-center overflow-hidden rounded-full sm:h-32 sm:w-32">
            <div
              className="splash-beam pointer-events-none absolute inset-0 origin-center"
              style={{ animation: 'splashSweep 3s linear infinite' }}
            />
            <div className="splash-ring absolute inset-2 rounded-full border-dashed" />
            <div className="relative z-10 flex h-16 w-16 items-center justify-center rounded-card border border-accent/45 bg-accent/12">
              <LogoMark className="h-9 w-9 text-accent" />
            </div>
          </div>
        </div>

        <h1 className="font-display text-3xl font-extrabold tracking-tight text-fg sm:text-4xl">FloodyLink</h1>
        <p className="mt-1.5 text-xs font-medium text-fg-soft sm:text-sm">
          Urban flood risk intelligence and tiered early warning
        </p>

        {/* Progress */}
        <div className="mt-7 w-full">
          <div className="flex items-baseline justify-between font-mono text-mini">
            <span className="inline-flex items-center gap-1.5 text-muted">
              <Activity className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
              Initialising
            </span>
            <span className="text-sm font-bold tabular-nums text-accent">{percent}%</span>
          </div>

          <div
            className="splash-track relative mt-2 h-1.5 w-full overflow-hidden rounded-full"
            role="progressbar"
            aria-valuenow={percent}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div
              className="splash-fill relative h-full rounded-full transition-[width] duration-150 ease-out"
              style={{ width: `${percent}%` }}
            >
              <div
                className="splash-shimmer pointer-events-none absolute inset-y-0 w-16"
                style={{ animation: 'splashShimmer 1.8s infinite' }}
              />
            </div>
          </div>

          {/* The five steps, which the component has always tracked and never
              shown. Fixed height and one line each, so nothing reflows as the
              longest label arrives and the bar below never jumps. */}
          <ul className="mt-5 space-y-1.5 text-left">
            {STEPS.map((step, idx) => {
              const done = idx < currentStep;
              const active = idx === currentStep;
              const Icon = done ? CheckCircle2 : step.icon;
              return (
                <li
                  key={step.code}
                  className={`flex h-6 items-center gap-2.5 text-mini transition-colors duration-300 ${
                    done ? 'text-positive' : active ? 'text-fg' : 'text-subtle'
                  }`}
                >
                  <Icon className={`h-3.5 w-3.5 shrink-0 ${active ? 'text-accent' : ''}`} aria-hidden="true" />
                  <span className="min-w-0 flex-1 truncate font-medium">{step.label}</span>
                  <span className="hidden shrink-0 font-mono text-nano uppercase tracking-wider text-subtle sm:inline">
                    {step.code}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      </main>

      {/* Foot */}
      <footer className="shell pad-safe-bottom relative z-10 flex flex-col items-center justify-between gap-3 pb-5 text-xs sm:flex-row">
        <span className="text-center font-mono text-nano uppercase tracking-wider text-subtle sm:text-left">
          Precision flood forecasting for Tamil Nadu &middot; 200 wards surveyed
        </span>
        <button
          onClick={(e) => {
            e.stopPropagation();
            handleFinish();
          }}
          className="inline-flex h-10 shrink-0 cursor-pointer items-center gap-2 rounded-full border border-accent/35 bg-accent/10 px-4 text-xs font-semibold text-accent transition-colors hover:bg-accent/20"
        >
          <span>Launch dashboard</span>
          <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </footer>
    </div>
  );
}
