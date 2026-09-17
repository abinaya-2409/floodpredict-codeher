import React from 'react';
import { CityData, WeatherForecast } from '../types';
import { Shield, CloudRain, Cpu, Radio, MapPin, Users, HelpCircle, Activity, Waves, Languages, ShieldAlert, Wifi, WifiOff, Clock } from 'lucide-react';
import { CITIES } from '../data/mockData';
import { Language, TRANSLATIONS } from '../utils/translations';

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
    <header className="sticky top-0 z-40 bg-slate-950/95 border-b border-slate-800/80 backdrop-blur-md" id="main-navigation">
      {/* Top Telemetry Ticker Bar */}
      <div className="bg-slate-900/80 border-b border-slate-800/60 px-4 py-1 text-[11px] text-slate-400 flex items-center justify-between overflow-x-auto whitespace-nowrap scrollbar-none">
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-1.5 text-cyan-400 font-mono">
            <span className={`w-2 h-2 rounded-full ${isOfflineSimulated ? 'bg-amber-400 animate-ping' : 'bg-cyan-400 animate-pulse'}`} />
            <span className="font-bold">{t.liveTelemetry}:</span>
            <span>{selectedCity.name} AWS Doppler Radar</span>
          </div>
          <span className="text-slate-600">|</span>
          <span>{t.rainfall}: <strong className="text-cyan-300 font-mono">{weather.currentRainfallMmHr} mm/hr</strong></span>
          <span className="text-slate-600">|</span>
          <span>{t.forecast24h}: <strong className="text-blue-300 font-mono">+{weather.forecast24hMm} mm</strong></span>
          <span className="text-slate-600">|</span>
          <span>{t.tide}: <strong className="text-indigo-300 font-mono">{weather.stormSurgeTideM}m MSL</strong></span>
          <span className="text-slate-600">|</span>
          <span>{t.dopplerTrend}: <strong className="text-amber-300 font-mono uppercase">{weather.dopplerRadarTrend}</strong></span>
        </div>

        <div className="hidden md:flex items-center space-x-3 text-slate-400">
          <span className="font-mono text-[10px] text-emerald-400 font-medium">● 87.4% Model Confidence</span>
          <span className="text-slate-600">|</span>
          <button
            onClick={onToggleOffline}
            className="hover:text-slate-200 flex items-center space-x-1 cursor-pointer"
            title="Toggle offline simulated mode"
          >
            {isOfflineSimulated ? (
              <span className="text-amber-400 font-semibold flex items-center"><WifiOff className="w-3 h-3 mr-1" /> Offline Cache</span>
            ) : (
              <span className="text-emerald-400 flex items-center"><Wifi className="w-3 h-3 mr-1" /> Online</span>
            )}
          </button>
        </div>
      </div>

      {/* Main Nav Header */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-3">
        {/* Brand & City Selector */}
        <div className="flex items-center space-x-3">
          <div className="p-2 rounded-xl bg-gradient-to-tr from-cyan-600 to-blue-600 text-white shadow-lg shadow-cyan-600/30 flex items-center justify-center shrink-0">
            <Waves className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <span className="font-extrabold text-white text-base tracking-tight font-display">{t.appTitle}</span>
              <span className="px-2 py-0.2 rounded text-[10px] font-mono font-bold bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                S-34 ENGINE
              </span>
            </div>
            <div className="text-[11px] text-slate-400 hidden sm:block truncate max-w-md">
              {t.tagline}
            </div>
          </div>
        </div>

        {/* Controls: City Switcher, Multi-Language, Role, Explainer */}
        <div className="flex items-center space-x-2">
          {/* Multi-language button (English / Tamil) */}
          <button
            onClick={onToggleLanguage}
            className="px-2.5 py-1.5 rounded-xl bg-slate-900 border border-slate-700/80 hover:border-cyan-500/50 text-slate-200 hover:text-white text-xs font-semibold flex items-center space-x-1.5 transition-all cursor-pointer"
            title="Switch Language (English / தமிழ்)"
          >
            <Languages className="w-3.5 h-3.5 text-cyan-400" />
            <span className="font-bold">{language === 'en' ? 'தமிழ்' : 'English'}</span>
          </button>

          {/* City Selector */}
          <div className="flex items-center bg-slate-900 border border-slate-700/80 rounded-xl p-1 text-xs">
            <MapPin className="w-3.5 h-3.5 text-cyan-400 ml-1.5 mr-1" />
            <select
              value={selectedCity.id}
              onChange={(e) => {
                const found = CITIES.find(c => c.id === e.target.value);
                if (found) onSelectCity(found);
              }}
              className="bg-transparent text-white font-semibold pr-2 py-1 text-xs focus:outline-none cursor-pointer"
            >
              {CITIES.map((c) => (
                <option key={c.id} value={c.id} className="bg-slate-900 text-white">
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          {/* Explainer Modal Button */}
          <button
            onClick={onOpenExplainer}
            className="px-3 py-1.5 rounded-xl bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/40 text-cyan-300 text-xs font-semibold flex items-center space-x-1.5 transition-all cursor-pointer hidden md:flex"
            title="Understand how the 4 inputs predict flood risk"
          >
            <HelpCircle className="w-3.5 h-3.5" />
            <span>Concept</span>
          </button>

          {/* User Persona Toggle (Authority vs Citizen) */}
          <button
            onClick={onToggleRole}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center space-x-1.5 border transition-all cursor-pointer ${
              userRole === 'authority'
                ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white border-blue-500/50 shadow-md shadow-blue-600/30'
                : 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white border-emerald-500/50 shadow-md shadow-emerald-600/30'
            }`}
          >
            {userRole === 'authority' ? (
              <>
                <Shield className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">{t.authorityHub}</span>
              </>
            ) : (
              <>
                <Users className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">{t.citizenView}</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Navigation Tabs Bar */}
      <div className="border-t border-slate-800/80 bg-slate-950/80 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto flex items-center space-x-1 sm:space-x-2 overflow-x-auto py-2 scrollbar-none text-xs">
          <button
            onClick={() => onChangeTab('map')}
            className={`px-3 py-1.5 rounded-xl font-semibold whitespace-nowrap transition-all flex items-center space-x-1.5 cursor-pointer ${
              activeTab === 'map'
                ? 'bg-cyan-500 text-slate-950 font-bold shadow-md shadow-cyan-500/20'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
            }`}
          >
            <Activity className="w-3.5 h-3.5" />
            <span>{t.tabMap}</span>
          </button>

          <button
            onClick={() => onChangeTab('streets')}
            className={`px-3 py-1.5 rounded-xl font-semibold whitespace-nowrap transition-all flex items-center space-x-1.5 cursor-pointer ${
              activeTab === 'streets'
                ? 'bg-cyan-500 text-slate-950 font-bold shadow-md shadow-cyan-500/20'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
            }`}
          >
            <MapPin className="w-3.5 h-3.5" />
            <span>{t.tabStreets}</span>
          </button>

          <button
            onClick={() => onChangeTab('whatif')}
            className={`px-3 py-1.5 rounded-xl font-semibold whitespace-nowrap transition-all flex items-center space-x-1.5 cursor-pointer ${
              activeTab === 'whatif'
                ? 'bg-cyan-500 text-slate-950 font-bold shadow-md shadow-cyan-500/20'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
            }`}
          >
            <Cpu className="w-3.5 h-3.5" />
            <span>{t.tabWhatIf}</span>
          </button>

          <button
            onClick={() => onChangeTab('alerts')}
            className={`px-3 py-1.5 rounded-xl font-semibold whitespace-nowrap transition-all flex items-center space-x-1.5 cursor-pointer ${
              activeTab === 'alerts'
                ? 'bg-cyan-500 text-slate-950 font-bold shadow-md shadow-cyan-500/20'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
            }`}
          >
            <Radio className="w-3.5 h-3.5" />
            <span>{t.tabAlerts}</span>
          </button>

          <button
            onClick={() => onChangeTab('resources')}
            className={`px-3 py-1.5 rounded-xl font-semibold whitespace-nowrap transition-all flex items-center space-x-1.5 cursor-pointer ${
              activeTab === 'resources'
                ? 'bg-cyan-500 text-slate-950 font-bold shadow-md shadow-cyan-500/20'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
            }`}
          >
            <ShieldAlert className="w-3.5 h-3.5" />
            <span>{t.tabResources}</span>
          </button>

          <button
            onClick={() => onChangeTab('fourinputs')}
            className={`px-3 py-1.5 rounded-xl font-semibold whitespace-nowrap transition-all flex items-center space-x-1.5 cursor-pointer ${
              activeTab === 'fourinputs'
                ? 'bg-cyan-500 text-slate-950 font-bold shadow-md shadow-cyan-500/20'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
            }`}
          >
            <CloudRain className="w-3.5 h-3.5" />
            <span>{t.tabFourInputs}</span>
          </button>

          <button
            onClick={() => onChangeTab('timeline')}
            className={`px-3 py-1.5 rounded-xl font-semibold whitespace-nowrap transition-all flex items-center space-x-1.5 cursor-pointer ${
              activeTab === 'timeline'
                ? 'bg-cyan-500 text-slate-950 font-bold shadow-md shadow-cyan-500/20'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            <span>{t.tabTimeline}</span>
          </button>

          <button
            onClick={() => onChangeTab('citizen')}
            className={`px-3 py-1.5 rounded-xl font-semibold whitespace-nowrap transition-all flex items-center space-x-1.5 cursor-pointer ${
              activeTab === 'citizen'
                ? 'bg-cyan-500 text-slate-950 font-bold shadow-md shadow-cyan-500/20'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>{t.tabCitizen}</span>
          </button>
        </div>
      </div>
    </header>
  );
};
