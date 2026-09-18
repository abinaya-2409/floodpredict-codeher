import React, { useEffect, useState, useRef } from 'react';
import { LogoMark } from './Logo';
import { 
  Radar, 
  Satellite, 
  Waves, 
  Cpu, 
  ShieldCheck, 
  CloudRain, 
  Activity, 
  CheckCircle2, 
  Radio,
  ArrowRight
} from 'lucide-react';

interface LoadingStep {
  label: string;
  code: string;
  detail: string;
  icon: React.ComponentType<{ className?: string }>;
}

const STEPS: LoadingStep[] = [
  {
    label: 'Orbital Telemetry Lock',
    code: 'SAT-INSAT-3DR',
    detail: 'Acquiring high-resolution multispectral precipitation feeds',
    icon: Satellite,
  },
  {
    label: 'Doppler Radar Calibration',
    code: 'RADAR-IMD-TN',
    detail: 'Streaming 24-hour coastal convective storm radar sweeps',
    icon: CloudRain,
  },
  {
    label: 'Hydrodynamic Basin Simulation',
    code: 'HYDRO-MESH-200',
    detail: 'Simulating runoff & drainage discharge across all 200 wards',
    icon: Waves,
  },
  {
    label: 'Neural Risk Assessment Engine',
    code: 'AI-SURFACE-INUNDATION',
    detail: 'Computing street-level vulnerability & backflow thresholds',
    icon: Cpu,
  },
  {
    label: 'Disaster Response Network',
    code: 'DISPATCH-ACTIVE',
    detail: 'Prepositioning rescue nodes & offline Bluetooth relays',
    icon: ShieldCheck,
  },
];

export function SplashScreen({ onDone }: { onDone: () => void }) {
  const [currentStep, setCurrentStep] = useState(0);
  const [percent, setPercent] = useState(0);
  const [isLeaving, setIsLeaving] = useState(false);
  const [completedSteps, setCompletedSteps] = useState<number[]>([]);
  const finishedRef = useRef(false);

  const handleFinish = () => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    setIsLeaving(true);
    setTimeout(onDone, 500);
  };

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      onDone();
      return;
    }

    // Smooth progress counter ticker
    const interval = setInterval(() => {
      setPercent((prev) => {
        if (prev >= 100) {
          clearInterval(interval);
          return 100;
        }
        // Accelerates smoothly towards 100%
        const jump = Math.floor(Math.random() * 3) + 2;
        return Math.min(prev + jump, 100);
      });
    }, 55);

    // Step state advancement
    const stepDuration = 520;
    const stepTimers: NodeJS.Timeout[] = [];

    STEPS.forEach((_, idx) => {
      stepTimers.push(
        setTimeout(() => {
          setCurrentStep(idx);
          setCompletedSteps((prev) => [...prev, idx]);
        }, idx * stepDuration)
      );
    });

    // Auto dismiss after completion
    const completeTimer = setTimeout(() => {
      setPercent(100);
      handleFinish();
    }, STEPS.length * stepDuration + 650);

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
      className={`fixed inset-0 z-[99999] flex flex-col items-center justify-between overflow-hidden bg-[#070d14] text-slate-100 select-none cursor-pointer transition-all duration-700 ${
        isLeaving ? 'opacity-0 scale-[1.03] pointer-events-none' : 'opacity-100 scale-100'
      }`}
    >
      {/* Dynamic Scoped Keyframes */}
      <style>{`
        @keyframes hydroRadarSweep {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        @keyframes sonarWave {
          0% { transform: scale(0.7); opacity: 0.8; }
          100% { transform: scale(2.4); opacity: 0; }
        }
        @keyframes pulseGlow {
          0%, 100% { opacity: 0.35; transform: scale(1); }
          50% { opacity: 0.75; transform: scale(1.08); }
        }
        @keyframes shimmerLine {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(200%); }
        }
      `}</style>

      {/* Atmospheric Background Layers */}
      <div className="absolute inset-0 pointer-events-none">
        {/* Subtle grid pattern */}
        <div 
          className="absolute inset-0 opacity-[0.07]" 
          style={{
            backgroundImage: `linear-gradient(to right, rgba(56, 189, 248, 0.3) 1px, transparent 1px),
                              linear-gradient(to bottom, rgba(56, 189, 248, 0.3) 1px, transparent 1px)`,
            backgroundSize: '48px 48px'
          }}
        />

        {/* Ambient Radial Deep Glow */}
        <div 
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[700px] rounded-full pointer-events-none opacity-40 blur-[120px]"
          style={{
            background: 'radial-gradient(circle, rgba(14, 165, 233, 0.45) 0%, rgba(6, 182, 212, 0.15) 45%, transparent 70%)'
          }}
        />

        {/* Dynamic Sonar Rings */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 pointer-events-none">
          <div 
            className="absolute inset-0 rounded-full border border-cyan-500/20"
            style={{ animation: 'sonarWave 3.5s cubic-bezier(0.2, 0.8, 0.2, 1) infinite' }}
          />
          <div 
            className="absolute inset-0 rounded-full border border-teal-400/20"
            style={{ animation: 'sonarWave 3.5s cubic-bezier(0.2, 0.8, 0.2, 1) 1.2s infinite' }}
          />
          <div 
            className="absolute inset-0 rounded-full border border-sky-400/20"
            style={{ animation: 'sonarWave 3.5s cubic-bezier(0.2, 0.8, 0.2, 1) 2.4s infinite' }}
          />
        </div>
      </div>

      {/* TOP BAR: System Diagnostic Status */}
      <header className="relative w-full max-w-5xl px-6 pt-6 flex items-center justify-between text-xs tracking-wider z-10">
        <div className="flex items-center gap-2.5 font-mono text-cyan-400 bg-cyan-950/40 border border-cyan-500/30 px-3.5 py-1.5 rounded-full backdrop-blur-md shadow-sm">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-cyan-400"></span>
          </span>
          <span className="font-semibold uppercase tracking-widest text-[11px]">FloodyLink Core v2.4</span>
        </div>

        <div className="hidden sm:flex items-center gap-4 font-mono text-[11px] text-slate-400">
          <span className="flex items-center gap-1.5">
            <Radio className="w-3.5 h-3.5 text-teal-400 animate-pulse" />
            LIVE TELEMETRY FEED
          </span>
          <span className="text-slate-600">|</span>
          <span className="text-slate-300">GEO: 13.0827°N, 80.2707°E</span>
        </div>
      </header>

      {/* CENTER: Radar Scanner & Emblem */}
      <main className="relative flex flex-col items-center justify-center max-w-xl w-full px-6 py-4 my-auto z-10 text-center">
        {/* Luminous Radar Screen Container */}
        <div className="relative mb-7 flex items-center justify-center">
          {/* Outer Rotating Radar Ring */}
          <div 
            className="w-32 h-32 sm:w-36 sm:h-36 rounded-full border border-cyan-500/30 flex items-center justify-center relative overflow-hidden bg-slate-900/60 backdrop-blur-xl shadow-[0_0_50px_rgba(6,182,212,0.25)]"
          >
            {/* Rotating Sweep Beam */}
            <div 
              className="absolute inset-0 origin-center pointer-events-none"
              style={{
                background: 'conic-gradient(from 0deg, rgba(6, 182, 212, 0.45) 0deg, rgba(6, 182, 212, 0) 75deg, transparent 360deg)',
                animation: 'hydroRadarSweep 3s linear infinite'
              }}
            />

            {/* Inner Ring Markers */}
            <div className="absolute inset-2 rounded-full border border-cyan-400/20 border-dashed pointer-events-none" />
            <div className="absolute inset-8 rounded-full border border-teal-300/15 pointer-events-none" />

            {/* Glowing FloodyLink Logo Mark */}
            <div className="relative z-10 w-16 h-16 rounded-2xl bg-gradient-to-br from-cyan-500/20 to-teal-500/10 border border-cyan-400/50 flex items-center justify-center backdrop-blur-sm shadow-[0_0_20px_rgba(6,182,212,0.5)]">
              <LogoMark className="w-10 h-10 text-cyan-300 drop-shadow-[0_0_12px_rgba(6,182,212,0.8)]" />
            </div>
          </div>
        </div>

        {/* Platform Title & Typography */}
        <div className="mb-6 space-y-1.5">
          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white via-cyan-100 to-cyan-300 drop-shadow-[0_2px_12px_rgba(6,182,212,0.3)]">
            FloodyLink
          </h1>
          <p className="text-xs sm:text-sm font-medium tracking-wide text-cyan-200/80">
            Urban Flood Risk Intelligence & Tiered Early Warning System
          </p>
        </div>

        {/* High-Tech Progress Bar */}
        <div className="w-full max-w-md space-y-2 mb-6">
          <div className="flex justify-between items-center text-xs font-mono">
            <span className="text-slate-400 flex items-center gap-1.5">
              <Activity className="w-3.5 h-3.5 text-cyan-400 animate-pulse" />
              <span>INITIALIZING SYSTEM</span>
            </span>
            <span className="text-cyan-300 font-bold tracking-wider">{percent}%</span>
          </div>

          <div 
            className="relative h-2 w-full bg-slate-800/80 rounded-full overflow-hidden border border-slate-700/60 shadow-inner"
            role="progressbar"
            aria-valuenow={percent}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            {/* Filled Progress Bar */}
            <div 
              className="h-full bg-gradient-to-r from-teal-500 via-cyan-400 to-sky-300 rounded-full transition-all duration-150 ease-out relative shadow-[0_0_12px_rgba(6,182,212,0.8)]"
              style={{ width: `${percent}%` }}
            >
              {/* Shimmer Light Reflection */}
              <div 
                className="absolute inset-0 bg-gradient-to-r from-transparent via-white/40 to-transparent w-24 pointer-events-none"
                style={{ animation: 'shimmerLine 1.8s infinite' }}
              />
            </div>
          </div>
        </div>

        {/* Diagnostic Steps Feed */}
        <div className="w-full max-w-md bg-slate-900/70 border border-slate-800/80 rounded-xl p-3.5 backdrop-blur-md text-left shadow-lg">
          <div className="space-y-2">
            {STEPS.map((s, idx) => {
              const isCurrent = idx === currentStep;
              const isPassed = completedSteps.includes(idx);
              const Icon = s.icon;

              return (
                <div 
                  key={s.code}
                  className={`flex items-center justify-between text-xs transition-all duration-300 ${
                    isCurrent 
                      ? 'text-cyan-200 font-medium scale-[1.01] pl-1' 
                      : isPassed 
                        ? 'text-slate-400' 
                        : 'text-slate-600'
                  }`}
                >
                  <div className="flex items-center gap-2.5 truncate">
                    <Icon className={`w-3.5 h-3.5 shrink-0 ${
                      isCurrent ? 'text-cyan-400 animate-spin' : isPassed ? 'text-emerald-400' : 'text-slate-600'
                    }`} />
                    <span className="truncate">{s.label}</span>
                  </div>

                  <div className="flex items-center gap-2 font-mono text-[10px] shrink-0">
                    {isPassed ? (
                      <span className="flex items-center gap-1 text-emerald-400">
                        <CheckCircle2 className="w-3 h-3" />
                        <span>READY</span>
                      </span>
                    ) : isCurrent ? (
                      <span className="text-cyan-400 animate-pulse font-semibold">LOADING...</span>
                    ) : (
                      <span className="text-slate-600">WAITING</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </main>

      {/* BOTTOM ACTION BAR */}
      <footer className="relative w-full max-w-5xl px-6 pb-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs z-10">
        <div className="text-slate-500 font-mono text-[11px] text-center sm:text-left">
          <span>PRECISION FLOOD FORECASTING FOR TAMIL NADU</span>
          <span className="hidden sm:inline mx-2 text-slate-700">|</span>
          <span className="hidden sm:inline text-slate-500">200 WARDS SURVEYED</span>
        </div>

        <button
          onClick={(e) => {
            e.stopPropagation();
            handleFinish();
          }}
          className="flex items-center gap-2 px-4 py-2 rounded-full bg-cyan-950/40 hover:bg-cyan-900/60 border border-cyan-500/30 hover:border-cyan-400/60 text-cyan-300 text-xs font-semibold backdrop-blur-md transition-all shadow-sm hover:scale-[1.02] active:scale-[0.98] cursor-pointer"
        >
          <span>Launch Dashboard</span>
          <ArrowRight className="w-3.5 h-3.5 text-cyan-400" />
        </button>
      </footer>
    </div>
  );
}
