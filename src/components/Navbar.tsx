import React from 'react';
import { CityData, WeatherForecast } from '../types';
import { CITIES } from '../data/mockData';
import { Language, TRANSLATIONS } from '../utils/translations';
import { Wifi, WifiOff } from 'lucide-react';

interface Props {
  selectedCity: CityData;
  onSelectCity: (city: CityData) => void;
  activeTab: string;
  onChangeTab: (tab: string) => void;
  userRole: 'authority' | 'citizen';
  onToggleRole: () => void;
  onOpenExplainer: () => void;
  weather: WeatherForecast;
  language: Language;
  onToggleLanguage: () => void;
  isOfflineSimulated: boolean;
  onToggleOffline: () => void;
}

export const Navbar: React.FC<Props> = ({
  selectedCity,
  onSelectCity,
  activeTab,
  onChangeTab,
  userRole,
  onToggleRole,
  onOpenExplainer,
  weather,
  language,
  onToggleLanguage,
  isOfflineSimulated,
  onToggleOffline,
}) => {
  const t = TRANSLATIONS[language];

  return (
    <header className="sticky top-0 z-50 w-full px-3 sm:px-6 pt-3 pb-2 backdrop-blur-md bg-transparent">
      <div className="max-w-7xl mx-auto flex flex-col gap-2">
        {/* Top Live Telemetry Pill Strip */}
        <div className="fluid-glass rounded-full px-4 py-1.5 flex items-center justify-between text-xs overflow-x-auto whitespace-nowrap shadow-[0_4px_24px_rgba(0,0,0,0.5)] border border-emerald-500/20">
          <div className="flex items-center gap-3">
            {/* Radar Animated Pulse & Sweep Icon */}
            <div className="flex items-center gap-2 text-emerald-400 font-mono tracking-wider font-bold">
              <div className="relative w-4 h-4 flex items-center justify-center">
                <svg className="w-4 h-4 text-emerald-400" fill="none" viewBox="0 0 24 24">
                  <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.3" strokeWidth="1.5" />
                  <circle cx="12" cy="12" r="5.5" stroke="currentColor" strokeOpacity="0.5" strokeWidth="1.5" />
                  <line stroke="currentColor" strokeOpacity="0.25" strokeWidth="1" x1="12" x2="12" y1="2" y2="22" />
                  <line stroke="currentColor" strokeOpacity="0.25" strokeWidth="1" x1="2" x2="22" y1="12" y2="12" />
                  <g className="animate-radar-sweep origin-center">
                    <path d="M12 12 L21.5 8" stroke="#34d399" strokeLinecap="round" strokeWidth="2" />
                    <path d="M12 12 L22 12 A10 10 0 0 0 19 6 Z" fill="url(#navRadarSectorGrad)" opacity="0.4" />
                  </g>
                  <defs>
                    <radialGradient id="navRadarSectorGrad">
                      <stop offset="0%" stopColor="#34d399" stopOpacity="0.8" />
                      <stop offset="100%" stopColor="#34d399" stopOpacity="0" />
                    </radialGradient>
                  </defs>
                </svg>
                <span className="absolute w-1.5 h-1.5 rounded-full bg-rose-500 animate-ping" />
                <span className="absolute w-1 h-1 rounded-full bg-rose-500" />
              </div>
              <span className="text-white">LIVE HYDRO-TELEMETRY</span>
            </div>
            <span className="text-slate-600">•</span>
            <span className="font-mono text-slate-200">{selectedCity.name} AWS Doppler Radar</span>
            <span className="text-slate-600">•</span>
            <span className="font-mono text-slate-400">
              Rainfall: <strong className="text-cyan-400 font-bold">{weather.currentRainfallMmHr} mm/hr</strong>
            </span>
            <span className="text-slate-600">•</span>
            <span className="font-mono text-slate-400">
              24h Outlook: <strong className="text-amber-400 font-bold">+{weather.forecast24hMm} mm</strong>
            </span>
            <span className="text-slate-600">•</span>
            <span className="font-mono text-slate-400">
              Tide: <strong className="text-emerald-300 font-semibold">{weather.stormSurgeTideM}m MSL</strong>
            </span>
            <span className="text-slate-600">•</span>
            <span className="font-mono text-slate-400">
              Doppler Trend: <strong className="text-rose-400 font-bold uppercase">{weather.dopplerRadarTrend}</strong>
            </span>
            <span className="text-slate-600">•</span>
            <span className="font-mono text-slate-400">
              Confidence: <strong className="text-purple-400 font-bold">87.4%</strong>
            </span>
          </div>

          <div className="flex items-center gap-2 pl-4">
            <button
              onClick={onToggleOffline}
              className="inline-flex items-center gap-1.5 bg-emerald-500/15 border border-emerald-400/40 px-3 py-0.5 rounded-full text-emerald-300 font-mono text-[11px] font-semibold shadow-[0_0_10px_rgba(16,185,129,0.2)] hover:bg-emerald-500/25 transition-colors cursor-pointer"
            >
              {isOfflineSimulated ? (
                <>
                  <WifiOff className="w-3 h-3 text-amber-400" />
                  <span className="text-amber-300">Offline Simulation</span>
                </>
              ) : (
                <>
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  <span>Telemetry Online</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Main Navigation Fluid Island */}
        <div className="fluid-glass rounded-[26px] px-4 sm:px-6 py-2.5 flex items-center justify-between shadow-[0_8px_32px_rgba(0,0,0,0.55)] border border-slate-700/50">
          {/* Logo & Engine Branding: Cybernetic Multi-Layer Hydro-Shield */}
          <div className="flex items-center gap-3.5">
            <div className="relative w-11 h-11 rounded-2xl bg-gradient-to-br from-emerald-500/25 via-cyan-500/20 to-slate-900 flex items-center justify-center border border-emerald-400/40 shadow-[0_0_22px_rgba(16,185,129,0.35)] group">
              <svg className="w-7 h-7 text-emerald-400 transition-transform group-hover:scale-110" fill="none" viewBox="0 0 32 32">
                <path
                  d="M16 3 L27 7 V15 C27 22.5 16 28 16 28 C16 28 5 22.5 5 15 V7 L16 3 Z"
                  fill="url(#brandShieldGrad)"
                  fillOpacity="0.25"
                  stroke="currentColor"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="1.75"
                />
                <path
                  d="M16 9 C16 9 21.5 16 21.5 19 C21.5 22 19 24.5 16 24.5 C13 24.5 10.5 22 10.5 19 C10.5 16 16 9 16 9 Z"
                  fill="#06b6d4"
                  fillOpacity="0.85"
                />
                <path
                  d="M12.5 20 C13.5 19.2 14.7 19.2 16 20 C17.3 20.8 18.5 20.8 19.5 20"
                  stroke="#f0fdf4"
                  strokeLinecap="round"
                  strokeWidth="1.5"
                />
                <defs>
                  <linearGradient id="brandShieldGrad" x1="5" y1="3" x2="27" y2="28" gradientUnits="userSpaceOnUse">
                    <stop offset="0%" stopColor="#34d399" />
                    <stop offset="100%" stopColor="#0284c7" />
                  </linearGradient>
                </defs>
              </svg>
              <div className="absolute -bottom-1 -right-1 w-3 h-3 rounded-full bg-emerald-400 border-2 border-slate-900 animate-ping" />
              <div className="absolute -bottom-1 -right-1 w-3 h-3 rounded-full bg-emerald-400 border-2 border-slate-900" />
            </div>
            <div className="flex flex-col">
              <div className="flex items-center gap-2">
                <span className="text-lg sm:text-xl font-extrabold tracking-tight text-white font-sans">JalRakshak AI</span>
                <span className="px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-400/40 text-emerald-300 font-mono text-[10px] font-bold tracking-wider shadow-[0_0_8px_rgba(16,185,129,0.25)]">
                  S-34 ENGINE
                </span>
              </div>
              <span className="text-xs text-slate-400 hidden sm:inline">{t.tagline}</span>
            </div>
          </div>

          {/* Controls: Language, Ward/City Picker, Concept, Authority Hub CTA */}
          <div className="flex items-center gap-2 sm:gap-3">
            {/* Translation Button */}
            <button
              onClick={onToggleLanguage}
              className="h-9 px-3 rounded-full bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-medium transition-all border border-slate-700/60 flex items-center gap-1.5 shadow-sm cursor-pointer"
              title="Switch Language"
            >
              <svg className="w-3.5 h-3.5 text-cyan-400" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24">
                <circle cx="12" cy="12" r="10" />
                <line x1="2" y1="12" x2="22" y2="12" />
                <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
              </svg>
              <span>{language === 'en' ? 'தமிழ் / EN' : 'EN / தமிழ்'}</span>
            </button>

            {/* City / Ward Selector */}
            <div className="flex items-center bg-slate-800/80 border border-slate-700/60 hover:border-cyan-500/50 rounded-full px-3.5 h-9 gap-2 text-slate-200 text-xs font-medium transition-all shadow-sm">
              <svg className="w-4 h-4 text-cyan-400 shrink-0" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24">
                <path d="M3 21h18" />
                <path d="M5 21V7l5-4v18" />
                <path d="M10 9l9 4v8" />
                <line x1="7" y1="10" x2="7.01" y2="10" />
                <line x1="7" y1="14" x2="7.01" y2="14" />
                <line x1="14" y1="15" x2="14.01" y2="15" />
              </svg>
              <select
                value={selectedCity.id}
                onChange={(e) => {
                  const found = CITIES.find((c) => c.id === e.target.value);
                  if (found) onSelectCity(found);
                }}
                className="bg-transparent text-slate-100 font-semibold text-xs focus:outline-none cursor-pointer pr-1"
              >
                {CITIES.map((c) => (
                  <option key={c.id} value={c.id} className="bg-slate-900 text-white">
                    {c.name} ({c.zones.length} Wards)
                  </option>
                ))}
              </select>
            </div>

            {/* Concept Link */}
            <button
              onClick={onOpenExplainer}
              className="hidden lg:flex items-center h-9 px-4 rounded-full bg-slate-800/70 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-medium transition-all border border-slate-700/60 cursor-pointer"
            >
              Concept
            </button>

            {/* Authority Hub CTA */}
            <button
              onClick={onToggleRole}
              className={`relative h-9 px-4 rounded-full font-bold text-xs tracking-wide transition-all flex items-center gap-2 border cursor-pointer shadow-lg ${
                userRole === 'authority'
                  ? 'bg-gradient-to-r from-rose-600 to-rose-700 hover:brightness-110 text-white border-rose-400/40 shadow-[0_0_20px_rgba(244,63,94,0.45)]'
                  : 'bg-gradient-to-r from-emerald-600 to-teal-600 hover:brightness-110 text-white border-emerald-400/40 shadow-[0_0_20px_rgba(16,185,129,0.35)]'
              }`}
            >
              <span className="relative flex h-4 w-4 items-center justify-center">
                <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24">
                  <path d="M12 2L4 5v6.09c0 5.05 3.41 9.76 8 10.91 4.59-1.15 8-5.86 8-10.91V5l-8-3z" />
                  <circle cx="12" cy="11.5" r="2.5" fill="currentColor" />
                </svg>
                {userRole === 'authority' && (
                  <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-yellow-300 animate-ping" />
                )}
              </span>
              <span>{userRole === 'authority' ? 'Authority Hub' : 'Citizen Portal'}</span>
            </button>
          </div>
        </div>

        {/* Fluid Pill Navigation Tabs */}
        <nav className="flex items-center gap-1.5 px-3 py-1.5 rounded-full fluid-glass overflow-x-auto border border-slate-700/50">
          <button
            onClick={() => onChangeTab('map')}
            className={`px-4 py-1.5 rounded-full text-xs font-semibold transition-all whitespace-nowrap flex items-center gap-2 cursor-pointer ${
              activeTab === 'map'
                ? 'bg-gradient-to-r from-emerald-500/25 via-teal-500/20 to-cyan-500/25 text-emerald-300 border border-emerald-400/40 font-bold shadow-[0_0_16px_rgba(16,185,129,0.3)]'
                : 'text-slate-300 hover:text-white hover:bg-slate-800/50 border border-transparent'
            }`}
          >
            {activeTab === 'map' && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_6px_#34d399]" />}
            <span>Interactive Inundation Map</span>
          </button>

          <button
            onClick={() => onChangeTab('streets')}
            className={`px-4 py-1.5 rounded-full text-xs font-semibold transition-all whitespace-nowrap flex items-center gap-2 cursor-pointer ${
              activeTab === 'streets'
                ? 'bg-gradient-to-r from-emerald-500/25 via-teal-500/20 to-cyan-500/25 text-emerald-300 border border-emerald-400/40 font-bold shadow-[0_0_16px_rgba(16,185,129,0.3)]'
                : 'text-slate-300 hover:text-white hover:bg-slate-800/50 border border-transparent'
            }`}
          >
            {activeTab === 'streets' && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_6px_#34d399]" />}
            <span>Street-Level Vulnerability</span>
          </button>

          <button
            onClick={() => onChangeTab('whatif')}
            className={`px-4 py-1.5 rounded-full text-xs font-semibold transition-all whitespace-nowrap flex items-center gap-2 cursor-pointer ${
              activeTab === 'whatif'
                ? 'bg-gradient-to-r from-emerald-500/25 via-teal-500/20 to-cyan-500/25 text-emerald-300 border border-emerald-400/40 font-bold shadow-[0_0_16px_rgba(16,185,129,0.3)]'
                : 'text-slate-300 hover:text-white hover:bg-slate-800/50 border border-transparent'
            }`}
          >
            {activeTab === 'whatif' && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_6px_#34d399]" />}
            <span>"What-If" Hydraulic Sandbox</span>
          </button>

          <button
            onClick={() => onChangeTab('alerts')}
            className={`px-4 py-1.5 rounded-full text-xs font-semibold transition-all whitespace-nowrap flex items-center gap-2 cursor-pointer ${
              activeTab === 'alerts'
                ? 'bg-gradient-to-r from-emerald-500/25 via-teal-500/20 to-cyan-500/25 text-emerald-300 border border-emerald-400/40 font-bold shadow-[0_0_16px_rgba(16,185,129,0.3)]'
                : 'text-slate-300 hover:text-white hover:bg-slate-800/50 border border-transparent'
            }`}
          >
            {activeTab === 'alerts' && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_6px_#34d399]" />}
            <span>Tiered Early Warning Hub</span>
          </button>

          <button
            onClick={() => onChangeTab('resources')}
            className={`px-4 py-1.5 rounded-full text-xs font-semibold transition-all whitespace-nowrap flex items-center gap-2 cursor-pointer ${
              activeTab === 'resources'
                ? 'bg-gradient-to-r from-emerald-500/25 via-teal-500/20 to-cyan-500/25 text-emerald-300 border border-emerald-400/40 font-bold shadow-[0_0_16px_rgba(16,185,129,0.3)]'
                : 'text-slate-300 hover:text-white hover:bg-slate-800/50 border border-transparent'
            }`}
          >
            {activeTab === 'resources' && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_6px_#34d399]" />}
            <span>Resource Pre-Positioning</span>
          </button>

          <button
            onClick={() => onChangeTab('fourinputs')}
            className={`px-4 py-1.5 rounded-full text-xs font-semibold transition-all whitespace-nowrap flex items-center gap-2 cursor-pointer ${
              activeTab === 'fourinputs'
                ? 'bg-gradient-to-r from-emerald-500/25 via-teal-500/20 to-cyan-500/25 text-emerald-300 border border-emerald-400/40 font-bold shadow-[0_0_16px_rgba(16,185,129,0.3)]'
                : 'text-slate-300 hover:text-white hover:bg-slate-800/50 border border-transparent'
            }`}
          >
            {activeTab === 'fourinputs' && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_6px_#34d399]" />}
            <span>The 4 Input Data Streams</span>
          </button>

          <button
            onClick={() => onChangeTab('timeline')}
            className={`px-4 py-1.5 rounded-full text-xs font-semibold transition-all whitespace-nowrap flex items-center gap-2 cursor-pointer ${
              activeTab === 'timeline'
                ? 'bg-gradient-to-r from-emerald-500/25 via-teal-500/20 to-cyan-500/25 text-emerald-300 border border-emerald-400/40 font-bold shadow-[0_0_16px_rgba(16,185,129,0.3)]'
                : 'text-slate-300 hover:text-white hover:bg-slate-800/50 border border-transparent'
            }`}
          >
            {activeTab === 'timeline' && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_6px_#34d399]" />}
            <span>72h Timeline &amp; Risk</span>
          </button>

          <button
            onClick={() => onChangeTab('citizen')}
            className={`px-4 py-1.5 rounded-full text-xs font-semibold transition-all whitespace-nowrap flex items-center gap-2 cursor-pointer ${
              activeTab === 'citizen'
                ? 'bg-gradient-to-r from-emerald-500/25 via-teal-500/20 to-cyan-500/25 text-emerald-300 border border-emerald-400/40 font-bold shadow-[0_0_16px_rgba(16,185,129,0.3)]'
                : 'text-slate-300 hover:text-white hover:bg-slate-800/50 border border-transparent'
            }`}
          >
            {activeTab === 'citizen' && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_6px_#34d399]" />}
            <span>Citizen Portal</span>
          </button>
        </nav>
      </div>
    </header>
  );
};
