import React, { useState, useEffect } from 'react';
import { CityData, WeatherForecast } from '../types';
import { CITIES } from '../data/mockData';
import { Language, TRANSLATIONS } from '../utils/translations';
import { Bluetooth, Moon, Sun, WifiOff } from 'lucide-react';
import { useThemeTokens } from '../theme/useThemeTokens';
import { LogoMark } from './Logo';
import { LanguagePicker } from './LanguagePicker';
import { Select } from './ui/Select';
import { ConnectionManager } from '../services/bluetooth/ConnectionManager';
import { BluetoothDevicePeer, ConnectionState } from '../services/bluetooth/BluetoothTypes';

/**
 * Section tabs, keyed to the translation table rather than hardcoded, so the
 * navigation actually changes language with everything else. It did not
 * before: switching language left the tab strip in English.
 */
/**
 * Sections, in two ranks.
 *
 * Ten tabs in one strip is a menu that has been unrolled: it overflowed on
 * anything narrower than a laptop, and the scroll hid whichever sections did
 * not fit. The three that get opened constantly stay as tabs; the other seven
 * group into two dropdowns, which also gives each one room for a line saying
 * what it is - something the strip never had space for.
 */
type TabKey = keyof typeof TRANSLATIONS.en;

const PRIMARY_TABS: { id: string; key: TabKey }[] = [
  { id: 'map', key: 'tabMap' },
  { id: 'alerts', key: 'tabAlerts' },
];

const TAB_GROUPS: {
  id: string;
  label: string;
  items: { id: string; key: TabKey; hint: string }[];
}[] = [
  {
    id: 'analyse',
    label: 'Look into',
    items: [
      { id: 'streets', key: 'tabStreets', hint: 'Which streets flood first' },
      { id: 'whatif', key: 'tabWhatIf', hint: 'Change the rain, see what happens' },
      { id: 'fourinputs', key: 'tabFourInputs', hint: 'Live data and past floods' },
      { id: 'timeline', key: 'tabTimeline', hint: 'The next 3 days, hour by hour' },
    ],
  },
  {
    id: 'respond',
    label: 'Take action',
    items: [
      { id: 'resources', key: 'tabResources', hint: 'Where to send pumps, boats and crews' },
      { id: 'citizen', key: 'tabCitizen', hint: 'What people are reporting' },
      { id: 'offline-chat', key: 'tabOfflineChat', hint: 'Talk phone-to-phone with no network' },
    ],
  },
];

interface Props {
  selectedCity: CityData;
  onSelectCity: (city: CityData) => void;
  activeTab: string;
  onChangeTab: (tab: string) => void;
  onOpenExplainer: () => void;
  /**
   * The theme controls arrived in App but never reached here, so the app
   * passed two props that this component neither declared nor rendered -
   * which meant a light/OLED switch with no way to operate it, and a
   * typecheck failure on main.
   */
  themeMode?: 'light' | 'oled';
  onToggleTheme?: () => void;
  weather: WeatherForecast;
  language: Language;
  onSetLanguage: (l: Language) => void;
  isOfflineSimulated: boolean;
  onToggleOffline: () => void;
}

export const Navbar: React.FC<Props> = ({
  selectedCity,
  onSelectCity,
  activeTab,
  onChangeTab,
  onOpenExplainer,
  themeMode,
  onToggleTheme,
  weather,
  language,
  onSetLanguage,
  isOfflineSimulated,
  onToggleOffline,
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
    <header className="sticky top-0 z-50 w-full pt-3 pb-2 bg-transparent">
      {/* `.shell` is the one container in the app. It used to be px-3/sm:px-6
          here and px-3/sm:px-6/lg:px-8 on <main>, so from 1024px up the
          navigation sat 8px wider than every card below it. */}
      <div className="shell flex flex-col gap-2">
        {/* Top Live Telemetry Pill Strip */}
        <div className="glass flex items-center gap-2.5 overflow-hidden rounded-full border-line px-3 py-1.5 text-xs whitespace-nowrap sm:gap-3 sm:px-4">
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
              <span className="hidden text-fg sm:inline">LIVE READINGS</span>
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
                    <strong className="font-bold text-risk-high-ink">
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
                    <strong className="font-bold uppercase text-risk-critical-ink">
                      {weather.dopplerRadarTrend}
                    </strong>
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
                className="inline-flex items-center gap-1.5 h-7 rounded-full border border-accent/55 bg-accent/15 px-3 font-mono text-mini font-bold text-accent transition-colors hover:bg-accent/25 cursor-pointer"
                title="Bluetooth P2P Mesh Connected"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-accent animate-ping" />
                <Bluetooth className="w-3 h-3 text-accent" />
                <span>🔵 BT: {btPeer?.nickname || btPeer?.name || 'Connected'}</span>
              </button>
            ) : isOfflineSimulated ? (
              <button
                onClick={onToggleOffline}
                className="inline-flex items-center gap-1.5 h-7 rounded-full border border-danger/45 bg-danger/12 px-3 font-mono text-mini font-semibold text-danger transition-colors hover:bg-danger/20 cursor-pointer"
                title="Telemetry Offline Simulation Mode"
              >
                <WifiOff className="w-3 h-3 text-danger" />
                <span>🔴 Offline</span>
              </button>
            ) : (
              <button
                onClick={onToggleOffline}
                className="inline-flex h-7 items-center gap-1.5 rounded-full border border-positive/35 bg-positive/12 px-3 font-mono text-mini font-semibold text-positive transition-colors hover:bg-positive/20 cursor-pointer"
                title="Telemetry Feed Online"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-positive animate-pulse" />
                <span>🟢 Online</span>
              </button>
            )}
          </div>
        </div>

        {/* Main Navigation Fluid Island */}
        <div className="glass rounded-panel flex flex-col gap-2.5 border-line-strong/50 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between sm:gap-3 sm:px-6">
          {/* Brand: one geometric mark, no ornament. */}
          <div className="flex min-w-0 items-center gap-3">
            <LogoMark className="h-8 w-8 shrink-0 text-accent" />
            <div className="flex min-w-0 flex-col leading-none">
              <span className="font-display text-base sm:text-lg font-extrabold tracking-tight text-fg">
                FloodyLink
              </span>
              <span className="mt-1 truncate text-micro font-medium uppercase tracking-[0.18em] text-subtle">
                Flood Intelligence
              </span>
            </div>
          </div>

          {/* Controls: Language, Ward/City Picker, Offline Chat CTA, Concept, Authority Hub CTA */}
          <div className="flex flex-wrap items-center gap-2 sm:flex-nowrap sm:justify-end sm:gap-3">
            <LanguagePicker language={language} onChange={onSetLanguage} />

            {/* Quick Access Offline Chat CTA */}
            <button
              onClick={() => onChangeTab('offline-chat')}
              className={`flex h-10 cursor-pointer items-center gap-1.5 rounded-full border px-3 text-xs font-bold transition-colors sm:px-4 ${
                activeTab === 'offline-chat'
                  ? 'border-accent bg-accent/20 text-accent'
                  : btState === 'connected'
                  ? 'border-accent/70 bg-accent/12 text-accent hover:bg-accent/20'
                  : 'border-line-strong/60 bg-surface-2/80 text-fg-soft hover:bg-surface-3 hover:text-accent'
              }`}
              title="Open Direct Offline Bluetooth Emergency Chat"
            >
              <Bluetooth className={`w-3.5 h-3.5 ${btState === 'connected' ? 'text-accent animate-pulse' : 'text-accent'}`} />
              <span className="hidden md:inline">Offline Chat</span>
              {btState === 'connected' && (
                <span className="w-1.5 h-1.5 rounded-full bg-accent" />
              )}
            </button>

            {/* City / Ward Selector */}
            {/* min-h, not h: on a touch device the <select> inside grows to the
                44px minimum, and a fixed-height wrapper would simply let it
                overflow the pill it is drawn in. */}
            <label className="flex min-h-10 items-center gap-2 rounded-full border border-line-strong/60 bg-surface-2/80 px-3.5 text-xs font-medium text-fg-soft transition-colors hover:border-accent/50">
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
                aria-label="City"
                className="h-full max-w-[9.5rem] cursor-pointer truncate border-0 bg-transparent pr-1 text-xs font-semibold text-fg focus:outline-none sm:max-w-none"
              >
                {CITIES.map((c) => (
                  <option key={c.id} value={c.id} className="bg-surface text-fg">
                    {c.name} ({c.zones.length} Wards)
                  </option>
                ))}
              </select>
            </label>

            {onToggleTheme && (
              <button
                onClick={onToggleTheme}
                aria-label={
                  themeMode === 'oled' ? 'Switch to light theme' : 'Switch to OLED theme'
                }
                title={themeMode === 'oled' ? 'Light theme' : 'OLED theme'}
                className="flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-full border border-line-strong/60 bg-surface-2/70 text-fg-soft transition-colors hover:bg-surface-3 hover:text-fg"
              >
                {themeMode === 'oled' ? (
                  <Sun className="h-3.5 w-3.5" aria-hidden="true" />
                ) : (
                  <Moon className="h-3.5 w-3.5" aria-hidden="true" />
                )}
              </button>
            )}

            {/* Concept Link */}
            <button
              onClick={onOpenExplainer}
              className="hidden h-10 cursor-pointer items-center rounded-full border border-line-strong/60 bg-surface-2/70 px-4 text-xs font-medium text-fg-soft transition-colors hover:bg-surface-3 hover:text-fg lg:flex"
            >
              Concept
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
          // rounded-full on a strip that has wrapped to two rows reads as a
          // lozenge with a hole in it. A panel radius is the honest shape for
          // a two-row strip; the pill comes back when it fits on one.
          className="glass flex flex-wrap items-center gap-1.5 rounded-panel border-line-strong/50 px-2.5 py-1.5 sm:rounded-full sm:px-3"
          // No overflow-x-auto: it clipped the section menus, which open
          // downwards out of this strip. With five controls instead of ten
          // there is nothing left to scroll anyway.
        >
          {PRIMARY_TABS.map((tab) => {
            const selected = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                role="tab"
                aria-selected={selected}
                onClick={() => onChangeTab(tab.id)}
                className={[
                  'flex h-10 items-center gap-2 whitespace-nowrap rounded-full border px-4',
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

          {TAB_GROUPS.map((group) => {
            const current = group.items.find((i) => i.id === activeTab);
            return (
              <Select
                key={group.id}
                label={group.label}
                // The trigger carries the open section when one of this
                // group's is active, so collapsing the strip never costs the
                // user the answer to "where am I".
                value={current ? current.id : ''}
                options={group.items.map((i) => ({
                  value: i.id,
                  label: t[i.key],
                  hint: i.hint,
                }))}
                onChange={onChangeTab}
                size="md"
                className={current ? 'ring-1 ring-accent/45 rounded-full' : ''}
                placeholder={group.label}
                prefix={group.label}
              />
            );
          })}
        </nav>
      </div>
    </header>
  );
};

