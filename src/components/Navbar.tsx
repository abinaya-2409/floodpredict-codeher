import React from 'react';
import { CityData, WeatherForecast } from '../types';
import { CITIES } from '../data/mockData';
import { Language, TRANSLATIONS } from '../utils/translations';
import { Wifi, WifiOff } from 'lucide-react';
import { useThemeTokens } from '../theme/useThemeTokens';
import { LogoMark } from './Logo';

/** Section tabs, in the order they appear. */
const TABS: { id: string; label: string }[] = [
  { id: 'map', label: 'Inundation Map' },
  { id: 'streets', label: 'Street Vulnerability' },
  { id: 'whatif', label: 'What-If Sandbox' },
  { id: 'alerts', label: 'Early Warning' },
  { id: 'resources', label: 'Resource Dispatch' },
  { id: 'fourinputs', label: 'Data Streams' },
  { id: 'timeline', label: '72h Timeline' },
  { id: 'citizen', label: 'Citizen Portal' },
];

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
        <div className="glass rounded-full px-4 py-1.5 flex items-center justify-between text-xs overflow-x-auto whitespace-nowrap shadow-[0_4px_24px_rgba(0,0,0,0.5)] border border-line">
          <div className="flex items-center gap-3">
            {/* Radar Animated Pulse & Sweep Icon */}
            <div className="flex items-center gap-2 text-positive font-mono tracking-wider font-bold">
              <div className="relative w-4 h-4 flex items-center justify-center">
                <svg className="w-4 h-4 text-positive" fill="none" viewBox="0 0 24 24">
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
                <span className="absolute w-1.5 h-1.5 rounded-full bg-accent-2 animate-ping" />
                <span className="absolute w-1 h-1 rounded-full bg-accent-2" />
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
              Tide: <strong className="text-accent-soft font-semibold">{weather.stormSurgeTideM}m MSL</strong>
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
              className="inline-flex items-center gap-1.5 bg-positive/12 border border-positive/35 px-3 py-0.5 rounded-full text-positive font-mono text-mini font-semibold hover:bg-positive/20 transition-colors cursor-pointer"
            >
              {isOfflineSimulated ? (
                <>
                  <WifiOff className="w-3 h-3 text-risk-high" />
                  <span className="text-risk-high">Offline Simulation</span>
                </>
              ) : (
                <>
                  <span className="w-1.5 h-1.5 rounded-full bg-positive animate-pulse" />
                  <span>Telemetry Online</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Main Navigation Fluid Island */}
        <div className="glass rounded-panel px-4 sm:px-6 py-2.5 flex items-center justify-between shadow-[0_8px_32px_rgba(0,0,0,0.55)] border border-line-strong/50">
          {/* Brand: one geometric mark, no ornament. */}
          <div className="flex items-center gap-3">
            <LogoMark className="h-8 w-8 shrink-0 text-accent" />
            <div className="flex flex-col leading-none">
              <span className="font-display text-base sm:text-lg font-extrabold tracking-tight text-fg">
                JalRakshak
              </span>
              <span className="mt-1 text-micro font-medium uppercase tracking-[0.18em] text-subtle">
                Flood Intelligence
              </span>
            </div>
          </div>

          {/* Controls: Language, Ward/City Picker, Concept, Authority Hub CTA */}
          <div className="flex items-center gap-2 sm:gap-3">
            {/* Translation Button */}
            <button
              onClick={onToggleLanguage}
              className="inline-flex h-9 items-center gap-1.5 rounded-full border border-line bg-surface-2 px-3.5 text-xs font-semibold text-fg-soft transition-colors hover:border-line-strong hover:bg-surface-3 hover:text-fg cursor-pointer"
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
            <div className="flex items-center bg-surface-2/80 border border-line-strong/60 hover:border-accent/50 rounded-full px-3.5 h-9 gap-2 text-fg-soft text-xs font-medium transition-colors shadow-sm">
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
              className="hidden lg:flex items-center h-9 px-4 rounded-full bg-surface-2/70 hover:bg-surface-3 text-fg-soft hover:text-fg text-xs font-medium transition-colors border border-line-strong/60 cursor-pointer"
            >
              Concept
            </button>

            {/* Authority Hub CTA */}
            <button
              onClick={onToggleRole}
              className={`relative h-9 px-4 rounded-full font-bold text-xs tracking-wide transition-colors flex items-center gap-2 border cursor-pointer shadow-lg ${
                userRole === 'authority'
                  ? 'bg-gradient-to-r from-risk-critical to-risk-critical hover:brightness-110 text-fg border-risk-critical/40'
                  : 'bg-gradient-to-r from-accent to-accent-deep hover:brightness-110 text-on-accent border-accent/50'
              }`}
            >
              <span className="relative flex h-4 w-4 items-center justify-center">
                <svg className="w-4 h-4 text-fg" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24">
                  <path d="M12 2L4 5v6.09c0 5.05 3.41 9.76 8 10.91 4.59-1.15 8-5.86 8-10.91V5l-8-3z" />
                  <circle cx="12" cy="11.5" r="2.5" fill="currentColor" />
                </svg>
                {userRole === 'authority' && (
                  <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-accent-2 animate-ping" />
                )}
              </span>
              <span>{userRole === 'authority' ? 'Authority Hub' : 'Citizen Portal'}</span>
            </button>
          </div>
        </div>

        {/* Section tabs.
            Eight near-identical buttons collapsed to one map over TABS, with
            real tablist semantics - previously these were plain buttons, so a
            screen reader announced no relationship between them and no
            indication of which section was current. */}
        <nav
          role="tablist"
          aria-label="Dashboard sections"
          className="flex items-center gap-1.5 overflow-x-auto rounded-full glass px-3 py-1.5 border border-line-strong/50"
        >
          {TABS.map((tab) => {
            const selected = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                role="tab"
                aria-selected={selected}
                onClick={() => onChangeTab(tab.id)}
                className={[
                  'flex items-center gap-2 whitespace-nowrap rounded-full border px-4 py-1.5',
                  'text-xs font-semibold transition-colors cursor-pointer',
                  selected
                    ? 'border-accent/45 bg-accent/18 text-accent font-bold'
                    : 'border-transparent text-fg-soft hover:bg-surface-2/60 hover:text-fg',
                ].join(' ')}
              >
                {selected && (
                  <span
                    className="h-1.5 w-1.5 rounded-full bg-accent animate-pulse"
                    aria-hidden="true"
                  />
                )}
                <span>{tab.label}</span>
              </button>
            );
          })}
        </nav>
      </div>
    </header>
  );
};
