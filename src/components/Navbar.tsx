import React from 'react';
import { CityData, WeatherForecast } from '../types';
import { CITIES } from '../data/mockData';
import { Language, TRANSLATIONS } from '../utils/translations';
import { Wifi, WifiOff } from 'lucide-react';
import { useThemeTokens } from '../theme/useThemeTokens';
import { LogoMark } from './Logo';

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
  const tokens = useThemeTokens();
  const t = TRANSLATIONS[language];

  return (
    <header className="sticky top-0 z-50 w-full px-3 sm:px-6 pt-3 pb-2 backdrop-blur-md bg-transparent">
      <div className="max-w-7xl mx-auto flex flex-col gap-2">
        {/* Top Live Telemetry Pill Strip */}
        <div className="fluid-glass rounded-full px-4 py-1.5 flex items-center justify-between text-xs overflow-x-auto whitespace-nowrap shadow-[0_4px_24px_rgba(0,0,0,0.5)] border border-risk-low/20">
          <div className="flex items-center gap-3">
            {/* Radar Animated Pulse & Sweep Icon */}
            <div className="flex items-center gap-2 text-risk-low font-mono tracking-wider font-bold">
              <div className="relative w-4 h-4 flex items-center justify-center">
                <svg className="w-4 h-4 text-risk-low" fill="none" viewBox="0 0 24 24">
                  <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.3" strokeWidth="1.5" />
                  <circle cx="12" cy="12" r="5.5" stroke="currentColor" strokeOpacity="0.5" strokeWidth="1.5" />
                  <line stroke="currentColor" strokeOpacity="0.25" strokeWidth="1" x1="12" x2="12" y1="2" y2="22" />
                  <line stroke="currentColor" strokeOpacity="0.25" strokeWidth="1" x1="2" x2="22" y1="12" y2="12" />
                  <g className="animate-radar-sweep origin-center">
                    <path d="M12 12 L21.5 8" stroke={tokens.positive} strokeLinecap="round" strokeWidth="2" />
                    <path d="M12 12 L22 12 A10 10 0 0 0 19 6 Z" fill="url(#navRadarSectorGrad)" opacity="0.4" />
                  </g>
                  <defs>
                    <radialGradient id="navRadarSectorGrad">
                      <stop offset="0%" stopColor={tokens.positive} stopOpacity="0.8" />
                      <stop offset="100%" stopColor={tokens.positive} stopOpacity="0" />
                    </radialGradient>
                  </defs>
                </svg>
                <span className="absolute w-1.5 h-1.5 rounded-full bg-risk-critical animate-ping" />
                <span className="absolute w-1 h-1 rounded-full bg-risk-critical" />
              </div>
              <span className="text-fg">LIVE HYDRO-TELEMETRY</span>
            </div>
            <span className="text-subtle">•</span>
            <span className="font-mono text-fg-soft">{selectedCity.name} AWS Doppler Radar</span>
            <span className="text-subtle">•</span>
            <span className="font-mono text-muted">
              Rainfall: <strong className="text-accent font-bold">{weather.currentRainfallMmHr} mm/hr</strong>
            </span>
            <span className="text-subtle">•</span>
            <span className="font-mono text-muted">
              24h Outlook: <strong className="text-risk-high font-bold">+{weather.forecast24hMm} mm</strong>
            </span>
            <span className="text-subtle">•</span>
            <span className="font-mono text-muted">
              Tide: <strong className="text-risk-low font-semibold">{weather.stormSurgeTideM}m MSL</strong>
            </span>
            <span className="text-subtle">•</span>
            <span className="font-mono text-muted">
              Doppler Trend: <strong className="text-risk-critical font-bold uppercase">{weather.dopplerRadarTrend}</strong>
            </span>
            <span className="text-subtle">•</span>
            <span className="font-mono text-muted">
              Confidence: <strong className="text-accent-2 font-bold">87.4%</strong>
            </span>
          </div>

          <div className="flex items-center gap-2 pl-4">
            <button
              onClick={onToggleOffline}
              className="inline-flex items-center gap-1.5 bg-risk-low/15 border border-risk-low/40 px-3 py-0.5 rounded-full text-risk-low font-mono text-[11px] font-semibold shadow-[0_0_10px_currentColor] hover:bg-risk-low/25 transition-colors cursor-pointer"
            >
              {isOfflineSimulated ? (
                <>
                  <WifiOff className="w-3 h-3 text-risk-high" />
                  <span className="text-risk-high">Offline Simulation</span>
                </>
              ) : (
                <>
                  <span className="w-1.5 h-1.5 rounded-full bg-risk-low animate-pulse" />
                  <span>Telemetry Online</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Main Navigation Fluid Island */}
        <div className="fluid-glass rounded-[26px] px-4 sm:px-6 py-2.5 flex items-center justify-between shadow-[0_8px_32px_rgba(0,0,0,0.55)] border border-line-strong/50">
          {/* Brand: one geometric mark, no ornament. */}
          <div className="flex items-center gap-3">
            <LogoMark className="h-8 w-8 shrink-0 text-accent" />
            <div className="flex flex-col leading-none">
              <span className="font-display text-base sm:text-lg font-extrabold tracking-tight text-fg">
                JalRakshak
              </span>
              <span className="mt-1 text-[10px] font-medium uppercase tracking-[0.18em] text-subtle">
                Flood Intelligence
              </span>
            </div>
          </div>

          {/* Controls: Language, Ward/City Picker, Concept, Authority Hub CTA */}
          <div className="flex items-center gap-2 sm:gap-3">
            {/* Translation Button */}
            <button
              onClick={onToggleLanguage}
              className="h-9 px-3 rounded-full bg-surface-2/80 hover:bg-surface-3 text-fg-soft hover:text-fg text-xs font-medium transition-all border border-line-strong/60 flex items-center gap-1.5 shadow-sm cursor-pointer"
              title="Switch Language"
            >
              <svg className="w-3.5 h-3.5 text-accent" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24">
                <circle cx="12" cy="12" r="10" />
                <line x1="2" y1="12" x2="22" y2="12" />
                <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
              </svg>
              <span>{language === 'en' ? 'தமிழ் / EN' : 'EN / தமிழ்'}</span>
            </button>

            {/* City / Ward Selector */}
            <div className="flex items-center bg-surface-2/80 border border-line-strong/60 hover:border-accent/50 rounded-full px-3.5 h-9 gap-2 text-fg-soft text-xs font-medium transition-all shadow-sm">
              <svg className="w-4 h-4 text-accent shrink-0" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24">
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
                className="bg-transparent text-fg font-semibold text-xs focus:outline-none cursor-pointer pr-1"
              >
                {CITIES.map((c) => (
                  <option key={c.id} value={c.id} className="bg-surface text-fg">
                    {c.name} ({c.zones.length} Wards)
                  </option>
                ))}
              </select>
            </div>

            {/* Concept Link */}
            <button
              onClick={onOpenExplainer}
              className="hidden lg:flex items-center h-9 px-4 rounded-full bg-surface-2/70 hover:bg-surface-3 text-fg-soft hover:text-fg text-xs font-medium transition-all border border-line-strong/60 cursor-pointer"
            >
              Concept
            </button>

            {/* Authority Hub CTA */}
            <button
              onClick={onToggleRole}
              className={`relative h-9 px-4 rounded-full font-bold text-xs tracking-wide transition-all flex items-center gap-2 border cursor-pointer shadow-lg ${
                userRole === 'authority'
                  ? 'bg-gradient-to-r from-risk-critical to-risk-critical hover:brightness-110 text-fg border-risk-critical/40 shadow-[0_0_20px_currentColor]'
                  : 'bg-gradient-to-r from-risk-low to-risk-low hover:brightness-110 text-fg border-risk-low/40 shadow-[0_0_20px_currentColor]'
              }`}
            >
              <span className="relative flex h-4 w-4 items-center justify-center">
                <svg className="w-4 h-4 text-fg" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24">
                  <path d="M12 2L4 5v6.09c0 5.05 3.41 9.76 8 10.91 4.59-1.15 8-5.86 8-10.91V5l-8-3z" />
                  <circle cx="12" cy="11.5" r="2.5" fill="currentColor" />
                </svg>
                {userRole === 'authority' && (
                  <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-risk-high animate-ping" />
                )}
              </span>
              <span>{userRole === 'authority' ? 'Authority Hub' : 'Citizen Portal'}</span>
            </button>
          </div>
        </div>

        {/* Fluid Pill Navigation Tabs */}
        <nav className="flex items-center gap-1.5 px-3 py-1.5 rounded-full fluid-glass overflow-x-auto border border-line-strong/50">
          <button
            onClick={() => onChangeTab('map')}
            className={`px-4 py-1.5 rounded-full text-xs font-semibold transition-all whitespace-nowrap flex items-center gap-2 cursor-pointer ${
              activeTab === 'map'
                ? 'bg-gradient-to-r from-risk-low/25 via-risk-low/20 to-accent/25 text-risk-low border border-risk-low/40 font-bold shadow-[0_0_16px_currentColor]'
                : 'text-fg-soft hover:text-fg hover:bg-surface-2/50 border border-transparent'
            }`}
          >
            {activeTab === 'map' && <span className="w-1.5 h-1.5 rounded-full bg-risk-low animate-pulse shadow-[0_0_6px_var(--color-risk-low)]" />}
            <span>Interactive Inundation Map</span>
          </button>

          <button
            onClick={() => onChangeTab('streets')}
            className={`px-4 py-1.5 rounded-full text-xs font-semibold transition-all whitespace-nowrap flex items-center gap-2 cursor-pointer ${
              activeTab === 'streets'
                ? 'bg-gradient-to-r from-risk-low/25 via-risk-low/20 to-accent/25 text-risk-low border border-risk-low/40 font-bold shadow-[0_0_16px_currentColor]'
                : 'text-fg-soft hover:text-fg hover:bg-surface-2/50 border border-transparent'
            }`}
          >
            {activeTab === 'streets' && <span className="w-1.5 h-1.5 rounded-full bg-risk-low animate-pulse shadow-[0_0_6px_var(--color-risk-low)]" />}
            <span>Street-Level Vulnerability</span>
          </button>

          <button
            onClick={() => onChangeTab('whatif')}
            className={`px-4 py-1.5 rounded-full text-xs font-semibold transition-all whitespace-nowrap flex items-center gap-2 cursor-pointer ${
              activeTab === 'whatif'
                ? 'bg-gradient-to-r from-risk-low/25 via-risk-low/20 to-accent/25 text-risk-low border border-risk-low/40 font-bold shadow-[0_0_16px_currentColor]'
                : 'text-fg-soft hover:text-fg hover:bg-surface-2/50 border border-transparent'
            }`}
          >
            {activeTab === 'whatif' && <span className="w-1.5 h-1.5 rounded-full bg-risk-low animate-pulse shadow-[0_0_6px_var(--color-risk-low)]" />}
            <span>"What-If" Hydraulic Sandbox</span>
          </button>

          <button
            onClick={() => onChangeTab('alerts')}
            className={`px-4 py-1.5 rounded-full text-xs font-semibold transition-all whitespace-nowrap flex items-center gap-2 cursor-pointer ${
              activeTab === 'alerts'
                ? 'bg-gradient-to-r from-risk-low/25 via-risk-low/20 to-accent/25 text-risk-low border border-risk-low/40 font-bold shadow-[0_0_16px_currentColor]'
                : 'text-fg-soft hover:text-fg hover:bg-surface-2/50 border border-transparent'
            }`}
          >
            {activeTab === 'alerts' && <span className="w-1.5 h-1.5 rounded-full bg-risk-low animate-pulse shadow-[0_0_6px_var(--color-risk-low)]" />}
            <span>Tiered Early Warning Hub</span>
          </button>

          <button
            onClick={() => onChangeTab('resources')}
            className={`px-4 py-1.5 rounded-full text-xs font-semibold transition-all whitespace-nowrap flex items-center gap-2 cursor-pointer ${
              activeTab === 'resources'
                ? 'bg-gradient-to-r from-risk-low/25 via-risk-low/20 to-accent/25 text-risk-low border border-risk-low/40 font-bold shadow-[0_0_16px_currentColor]'
                : 'text-fg-soft hover:text-fg hover:bg-surface-2/50 border border-transparent'
            }`}
          >
            {activeTab === 'resources' && <span className="w-1.5 h-1.5 rounded-full bg-risk-low animate-pulse shadow-[0_0_6px_var(--color-risk-low)]" />}
            <span>Resource Pre-Positioning</span>
          </button>

          <button
            onClick={() => onChangeTab('fourinputs')}
            className={`px-4 py-1.5 rounded-full text-xs font-semibold transition-all whitespace-nowrap flex items-center gap-2 cursor-pointer ${
              activeTab === 'fourinputs'
                ? 'bg-gradient-to-r from-risk-low/25 via-risk-low/20 to-accent/25 text-risk-low border border-risk-low/40 font-bold shadow-[0_0_16px_currentColor]'
                : 'text-fg-soft hover:text-fg hover:bg-surface-2/50 border border-transparent'
            }`}
          >
            {activeTab === 'fourinputs' && <span className="w-1.5 h-1.5 rounded-full bg-risk-low animate-pulse shadow-[0_0_6px_var(--color-risk-low)]" />}
            <span>The 4 Input Data Streams</span>
          </button>

          <button
            onClick={() => onChangeTab('timeline')}
            className={`px-4 py-1.5 rounded-full text-xs font-semibold transition-all whitespace-nowrap flex items-center gap-2 cursor-pointer ${
              activeTab === 'timeline'
                ? 'bg-gradient-to-r from-risk-low/25 via-risk-low/20 to-accent/25 text-risk-low border border-risk-low/40 font-bold shadow-[0_0_16px_currentColor]'
                : 'text-fg-soft hover:text-fg hover:bg-surface-2/50 border border-transparent'
            }`}
          >
            {activeTab === 'timeline' && <span className="w-1.5 h-1.5 rounded-full bg-risk-low animate-pulse shadow-[0_0_6px_var(--color-risk-low)]" />}
            <span>72h Timeline &amp; Risk</span>
          </button>

          <button
            onClick={() => onChangeTab('citizen')}
            className={`px-4 py-1.5 rounded-full text-xs font-semibold transition-all whitespace-nowrap flex items-center gap-2 cursor-pointer ${
              activeTab === 'citizen'
                ? 'bg-gradient-to-r from-risk-low/25 via-risk-low/20 to-accent/25 text-risk-low border border-risk-low/40 font-bold shadow-[0_0_16px_currentColor]'
                : 'text-fg-soft hover:text-fg hover:bg-surface-2/50 border border-transparent'
            }`}
          >
            {activeTab === 'citizen' && <span className="w-1.5 h-1.5 rounded-full bg-risk-low animate-pulse shadow-[0_0_6px_var(--color-risk-low)]" />}
            <span>Citizen Portal</span>
          </button>
        </nav>
      </div>
    </header>
  );
};
