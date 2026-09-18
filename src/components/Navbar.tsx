import React, { useEffect, useState } from 'react';
import { Bluetooth, CircleHelp, LogIn, LogOut, Moon, ShieldCheck, Sun, Wifi, WifiOff } from 'lucide-react';
import { CityData, WeatherForecast } from '../types';
import { CITIES } from '../data/mockData';
import { Language, TRANSLATIONS } from '../utils/translations';
import { LogoMark } from './Logo';
import { LanguagePicker } from './LanguagePicker';
import { ConnectionManager } from '../services/bluetooth/ConnectionManager';
import { BluetoothDevicePeer, ConnectionState } from '../services/bluetooth/BluetoothTypes';
import { ThemeMode } from './VantaBackground';

const TABS: { id: string; key: keyof typeof TRANSLATIONS.en }[] = [
  { id: 'map', key: 'tabMap' }, { id: 'national', key: 'tabNational' }, { id: 'streets', key: 'tabStreets' }, { id: 'whatif', key: 'tabWhatIf' }, { id: 'alerts', key: 'tabAlerts' }, { id: 'resources', key: 'tabResources' }, { id: 'fourinputs', key: 'tabFourInputs' }, { id: 'timeline', key: 'tabTimeline' }, { id: 'citizen', key: 'tabCitizen' }, { id: 'offline-chat', key: 'tabOfflineChat' },
];

interface Props {
  selectedCity: CityData; onSelectCity: (city: CityData) => void; activeTab: string; onChangeTab: (tab: string) => void; userRole: 'authority' | 'citizen'; onToggleRole: () => void; onOpenExplainer: () => void; weather: WeatherForecast; language: Language; onSetLanguage: (l: Language) => void; isOfflineSimulated: boolean; onToggleOffline: () => void; onOpenAuthModal?: () => void; onSignOut?: () => void; session?: { mode: 'citizen' | 'authority'; isGuest: boolean; contact?: string; roleLabel?: string; wardName: string } | null; themeMode: ThemeMode; onToggleTheme: () => void;
}

export const Navbar: React.FC<Props> = ({ selectedCity, onSelectCity, activeTab, onChangeTab, userRole, onToggleRole, onOpenExplainer, weather, language, onSetLanguage, isOfflineSimulated, onToggleOffline, onOpenAuthModal, onSignOut, session, themeMode, onToggleTheme }) => {
  const t = TRANSLATIONS[language];
  const [btState, setBtState] = useState<ConnectionState>('disconnected');
  const [btPeer, setBtPeer] = useState<BluetoothDevicePeer | null>(null);
  useEffect(() => ConnectionManager.addListener((state, peer) => { setBtState(state); setBtPeer(peer); }), []);
  const online = !isOfflineSimulated;
  return <header className="app-header">
    <div className="app-header__utility"><div className="app-shell app-header__utility-inner"><span className="status-dot" /><span>Data feed {online ? 'operational' : 'offline'}</span><span className="utility-reading">{selectedCity.name}: {weather.currentRainfallMmHr} mm/hr rainfall</span><span className="utility-reading">24h forecast: {weather.forecast24hMm} mm</span><button onClick={onToggleOffline} className="utility-control" title="Toggle telemetry connection">{online ? <Wifi size={14} /> : <WifiOff size={14} />} {online ? 'Online' : 'Offline'}</button></div></div>
    <div className="app-shell app-header__main"><button onClick={() => onChangeTab('map')} className="brand" aria-label="FloodyPredict dashboard"><span className="brand-mark"><LogoMark className="h-7 w-7" /></span><span><strong>FloodyPredict</strong><small>Flood intelligence platform</small></span></button><div className="header-actions"><label className="city-select"><span className="sr-only">Selected city</span><select value={selectedCity.id} onChange={(e) => { const city = CITIES.find((entry) => entry.id === e.target.value); if (city) onSelectCity(city); }}>{CITIES.map((city) => <option key={city.id} value={city.id}>{city.name}</option>)}</select></label><LanguagePicker language={language} onChange={onSetLanguage} /><button className="icon-control" onClick={onToggleTheme} title={themeMode === 'light' ? 'Switch to OLED black mode' : 'Switch to light mode'}>{themeMode === 'light' ? <Moon size={17} /> : <Sun size={17} />}</button><button className="icon-control" onClick={onOpenExplainer} title="System information"><CircleHelp size={17} /></button><button className="icon-control" onClick={() => onChangeTab('offline-chat')} title={btState === 'connected' ? `Bluetooth connected to ${btPeer?.nickname || btPeer?.name || 'peer'}` : 'Offline emergency chat'}><Bluetooth size={17} /></button>{session && !session.isGuest ? <div className="account-control"><ShieldCheck size={16} /><span>{session.contact?.split('@')[0] || (session.mode === 'authority' ? 'Officer' : 'Citizen')}</span><button onClick={onSignOut} title="Sign out"><LogOut size={15} /></button></div> : <button className="button button--primary" onClick={onOpenAuthModal}><LogIn size={16} /> Sign in</button>}</div></div>
    <div className="app-shell app-header__nav-wrap"><nav role="tablist" aria-label="Dashboard sections" className="app-nav">{TABS.map((tab) => <button key={tab.id} role="tab" aria-selected={activeTab === tab.id} onClick={() => onChangeTab(tab.id)} className={activeTab === tab.id ? 'is-active' : ''}>{t[tab.key]}</button>)}<button onClick={onToggleRole} className="nav-role">{userRole === 'authority' ? 'Authority view' : 'Citizen view'}</button></nav></div>
  </header>;
};
