import React, { useState, useEffect } from 'react';
import { CityData, WeatherForecast } from '../types';
import { CITIES } from '../data/mockData';
import { Language, TRANSLATIONS } from '../utils/translations';
import { Wifi, WifiOff, LogIn, LogOut, User, ShieldCheck, Bluetooth, Radio } from 'lucide-react';
import { useThemeTokens } from '../theme/useThemeTokens';
import { LogoMark } from './Logo';
import { LanguagePicker } from './LanguagePicker';
import { ConnectionManager } from '../services/bluetooth/ConnectionManager';
import { BluetoothDevicePeer, ConnectionState } from '../services/bluetooth/BluetoothTypes';

/**
 * Section tabs, keyed to the translation table rather than hardcoded, so the
 * navigation actually changes language with everything else. It did not
 * before: switching language left the tab strip in English.
 */
const TABS: { id: string; key: keyof typeof TRANSLATIONS.en }[] = [
  { id: 'map', key: 'tabMap' },
  { id: 'national', key: 'tabNational' },
  { id: 'streets', key: 'tabStreets' },
  { id: 'whatif', key: 'tabWhatIf' },
  { id: 'alerts', key: 'tabAlerts' },
  { id: 'resources', key: 'tabResources' },
  { id: 'fourinputs', key: 'tabFourInputs' },
  { id: 'timeline', key: 'tabTimeline' },
  { id: 'citizen', key: 'tabCitizen' },
  { id: 'offline-chat', key: 'tabOfflineChat' },
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
  onSetLanguage: (l: Language) => void;
  isOfflineSimulated: boolean;
  onToggleOffline: () => void;
  onOpenAuthModal?: () => void;
  onSignOut?: () => void;
  session?: {
    mode: 'citizen' | 'authority';
    isGuest: boolean;
    contact?: string;
    roleLabel?: string;
    wardName: string;
  } | null;
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
  onSetLanguage,
  isOfflineSimulated,
  onToggleOffline,
  onOpenAuthModal,
  onSignOut,
  session,
}) => {
  const tokens = useThemeTokens();
  const t = TRANSLATIONS[language];

  const [btState, setBtState] = useState<ConnectionState>('disconnected');
  const [btPeer, setBtPeer] = useState<BluetoothDevicePeer | null>(null);

  useEffect(() => {
    const unsub = ConnectionManager.addListener((state, peer) => {
      setBtState(state);
      setBtPeer(peer);
    });
    return () => unsub();
  }, []);

  return (
    <header className="sticky top-0 z-50 w-full px-3 sm:px-6 pt-3 pb-2 backdrop-blur-md bg-transparent">
      <div className="max-w-7xl mx-auto flex flex-col gap-2">
        {/* Top Live Telemetry Pill Strip */}
        <div className="glass flex items-center gap-3 overflow-hidden rounded-full border border-line px-4 py-1.5 text-xs whitespace-nowrap shadow-[0_4px_24px_rgba(0,0,0,0.5)]">
          {/* Static label. */}
          <div className="flex shrink-0 items-center gap-3">
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
          </div>

          <div className="telemetry-ticker relative min-w-0 flex-1 overflow-hidden" aria-live="off">
            <div className="telemetry-track flex w-max items-center">
              {[0, 1].map((copy) => (
                <div
                  key={copy}
                  className="flex shrink-0 items-center gap-3 pr-3"
                  aria-hidden={copy === 1 ? 'true' : undefined}
                >
                  <span className="text-subtle">&bull;</span>
                  <span className="font-mono text-fg-soft">
                    {selectedCity.name} AWS Doppler Radar
                  </span>
                  <span className="text-subtle">&bull;</span>
                  <span className="font-mono text-muted">
                    {t.rainfall}:{' '}
                    <strong className="font-bold text-accent">
                      {weather.currentRainfallMmHr} mm/hr
                    </strong>
                  </span>
                  <span className="text-subtle">&bull;</span>
                  <span className="font-mono text-muted">
                    {t.forecast24h}:{' '}
                    <strong className="font-bold text-risk-high">
                      +{weather.forecast24hMm} mm
                    </strong>
                  </span>
                  <span className="text-subtle">&bull;</span>
                  <span className="font-mono text-muted">
                    {t.tide}:{' '}
                    <strong className="font-semibold text-accent-soft">
                      {weather.stormSurgeTideM}m MSL
                    </strong>
                  </span>
                  <span className="text-subtle">&bull;</span>
                  <span className="font-mono text-muted">
                    {t.dopplerTrend}:{' '}
                    <strong className="font-bold uppercase text-risk-critical">
                      {weather.dopplerRadarTrend}
                    </strong>
                  </span>
                  <span className="text-subtle">&bull;</span>
                  <span className="font-mono text-muted">
                    {t.confidenceScore}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Connectivity Status Badges: Online, Offline, Bluetooth Connected */}
          <div className="flex shrink-0 items-center gap-2 pl-2">
            {btState === 'connected' ? (
              <button
                onClick={() => onChangeTab('offline-chat')}
                className="inline-flex items-center gap-1.5 bg-blue-950/80 border border-blue-400/60 px-3 py-0.5 rounded-full text-blue-300 font-mono text-mini font-bold hover:bg-blue-900 transition-all cursor-pointer shadow-[0_0_10px_rgba(59,130,246,0.3)]"
                title="Bluetooth P2P Mesh Connected"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-ping" />
                <Bluetooth className="w-3 h-3 text-blue-400" />
                <span>🔵 BT: {btPeer?.nickname || btPeer?.name || 'Connected'}</span>
              </button>
            ) : isOfflineSimulated ? (
              <button
                onClick={onToggleOffline}
                className="inline-flex items-center gap-1.5 bg-rose-950/70 border border-rose-500/40 px-3 py-0.5 rounded-full text-rose-300 font-mono text-mini font-semibold hover:bg-rose-900 transition-colors cursor-pointer"
                title="Telemetry Offline Simulation Mode"
              >
                <WifiOff className="w-3 h-3 text-rose-400" />
                <span>🔴 Offline</span>
              </button>
            ) : (
              <button
                onClick={onToggleOffline}
                className="inline-flex items-center gap-1.5 bg-positive/12 border border-positive/35 px-3 py-0.5 rounded-full text-positive font-mono text-mini font-semibold hover:bg-positive/20 transition-colors cursor-pointer"
                title="Telemetry Feed Online"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-positive animate-pulse" />
                <span>🟢 Online</span>
              </button>
            )}
          </div>
        </div>

        {/* Main Navigation Fluid Island */}
        <div className="glass rounded-panel px-4 sm:px-6 py-2.5 flex items-center justify-between shadow-[0_8px_32px_rgba(0,0,0,0.55)] border border-line-strong/50">
          {/* Brand: one geometric mark, no ornament. */}
          <div className="flex items-center gap-3">
            <LogoMark className="h-8 w-8 shrink-0 text-accent" />
            <div className="flex flex-col leading-none">
              <span className="font-display text-base sm:text-lg font-extrabold tracking-tight text-fg">
                FloodyPredict
              </span>
              <span className="mt-1 text-micro font-medium uppercase tracking-[0.18em] text-subtle">
                Flood Intelligence
              </span>
            </div>
          </div>

          {/* Controls: Language, Ward/City Picker, Offline Chat CTA, Concept, Authority Hub CTA */}
          <div className="flex items-center gap-2 sm:gap-3">
            <LanguagePicker language={language} onChange={onSetLanguage} />

            {/* Quick Access Offline Chat CTA */}
            <button
              onClick={() => onChangeTab('offline-chat')}
              className={`h-9 px-3 sm:px-4 rounded-full border text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer shadow-sm ${
                activeTab === 'offline-chat'
                  ? 'bg-cyan-500/25 border-cyan-400 text-cyan-300 shadow-[0_0_12px_rgba(6,182,212,0.3)]'
                  : btState === 'connected'
                  ? 'bg-blue-950/90 border-blue-400 text-blue-300 hover:bg-blue-900 shadow-[0_0_10px_rgba(59,130,246,0.3)]'
                  : 'bg-surface-2/80 hover:bg-surface-3 text-fg-soft hover:text-cyan-300 border-line-strong/60'
              }`}
              title="Open Direct Offline Bluetooth Emergency Chat"
            >
              <Bluetooth className={`w-3.5 h-3.5 ${btState === 'connected' ? 'text-blue-400 animate-pulse' : 'text-cyan-400'}`} />
              <span className="hidden md:inline">Offline Chat</span>
              {btState === 'connected' && (
                <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />
              )}
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

            {/* FloodyPredict Authentication Controls (Sign-In / Sign-Out) */}
            {session && !session.isGuest ? (
              <div className="flex items-center gap-1.5 bg-surface-2/90 border border-line-strong/60 rounded-full p-0.5 pl-2.5 shadow-sm">
                {/* User Identity Pill (clickable to view modal) */}
                <button
                  onClick={onOpenAuthModal}
                  className="flex items-center gap-1.5 text-xs text-fg-soft hover:text-cyan-300 transition-colors cursor-pointer py-1 pr-1.5 focus:outline-none"
                  title={`Logged in as ${session.contact || 'User'} (${session.mode === 'authority' ? 'Officer' : 'Citizen'}) - Click to switch or view profile`}
                >
                  {session.mode === 'authority' ? (
                    <ShieldCheck className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                  ) : (
                    <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shrink-0" />
                  )}
                  <span className="font-medium max-w-[130px] sm:max-w-[170px] truncate text-fg">
                    {session.contact ? session.contact.split('@')[0] : session.mode === 'authority' ? 'Officer' : 'Citizen'}
                  </span>
                  <span className="text-[10px] font-mono uppercase px-1.5 py-0.5 rounded bg-surface-3 text-muted hidden md:inline">
                    {session.mode === 'authority' ? 'Admin' : 'Verified'}
                  </span>
                </button>

                {/* Dedicated Sign-Out Button */}
                {onSignOut && (
                  <button
                    onClick={onSignOut}
                    className="h-7 px-2.5 rounded-full bg-rose-950/60 hover:bg-rose-900/80 border border-rose-500/40 hover:border-rose-400 text-rose-300 hover:text-white text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer shadow-sm"
                    title="Sign Out of FloodyPredict"
                  >
                    <LogOut className="w-3 h-3 text-rose-400" />
                    <span className="text-[11px]">Sign Out</span>
                  </button>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-1.5">
                {session?.isGuest && (
                  <span className="text-[10px] font-mono uppercase px-2 py-1 rounded-full bg-slate-800 border border-slate-700 text-slate-400 hidden sm:inline">
                    Guest Mode
                  </span>
                )}
                {onOpenAuthModal && (
                  <button
                    onClick={onOpenAuthModal}
                    className="h-9 px-3.5 sm:px-4 rounded-full bg-gradient-to-r from-teal-600/90 to-cyan-600/90 hover:from-teal-500 hover:to-cyan-500 text-white border border-teal-400/50 text-xs font-bold flex items-center gap-1.5 transition-all shadow-[0_0_15px_rgba(20,184,166,0.3)] cursor-pointer hover:scale-[1.02] active:scale-[0.98]"
                    title="Sign In with Email OTP or Authority Credentials"
                  >
                    <LogIn className="w-3.5 h-3.5 text-cyan-200" />
                    <span>Sign In</span>
                  </button>
                )}
              </div>
            )}

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
                <span>{t[tab.key]}</span>
              </button>
            );
          })}
        </nav>
      </div>
    </header>
  );
};
