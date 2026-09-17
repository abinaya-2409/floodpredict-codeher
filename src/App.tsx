import React, { useState, useMemo, useEffect } from 'react';
import { CITIES, INITIAL_CITIZEN_REPORTS } from './data/mockData';
import { CityData, ZoneData, SimulationParams, CitizenReport, StreetVulnerability } from './types';
import { calculateZoneHydrology, calculateStreetHydrology } from './utils/floodEngine';
import { assessZone, rankByPriority } from './utils/riskIndex';
import { recommendResources } from './utils/dispatch';
import { Language, TRANSLATIONS } from './utils/translations';
import { Navbar } from './components/Navbar';
import { LeafletFloodMap } from './components/LeafletFloodMap';
import { HydrologicalMap } from './components/HydrologicalMap';
import { StreetLevelVulnerability } from './components/StreetLevelVulnerability';
import { WhatIfScenarioSandbox } from './components/WhatIfScenarioSandbox';
import { TieredAlertSystem } from './components/TieredAlertSystem';
import { ResourcePrepositioningHub } from './components/ResourcePrepositioningHub';
import { FourInputsDataHub } from './components/FourInputsDataHub';
import { HydrologicalTimelineView } from './components/HydrologicalTimelineView';
import { CitizenPortal } from './components/CitizenPortal';
import { GeminiExecutiveReport } from './components/GeminiExecutiveReport';
import { SystemExplainerModal } from './components/SystemExplainerModal';
import { StatTile } from './components/ui/StatTile';
import { RiskBadge } from './components/ui/Badge';
import { VantaBackground } from './components/VantaBackground';
import { VulnerabilityIndexPanel } from './components/VulnerabilityIndexPanel';
import { EvacuationPriorityQueue } from './components/EvacuationPriorityQueue';
import { AlertTriangle, ShieldCheck, Waves, Users, Clock, ArrowUpRight, Gauge, Cpu, CloudRain, Radio, WifiOff, Map as MapIcon, Sliders } from 'lucide-react';
import { useThemeTokens } from './theme/useThemeTokens';

export default function App() {
  const tokens = useThemeTokens();
  const [selectedCity, setSelectedCity] = useState<CityData>(CITIES[0]); // Default Chennai
  const [activeTab, setActiveTab] = useState<string>('map');
  const [mapRenderMode, setMapRenderMode] = useState<'leaflet' | 'schematic'>('leaflet');
  const [userRole, setUserRole] = useState<'authority' | 'citizen'>('authority');
  const [language, setLanguage] = useState<Language>('en');
  const [isOfflineSimulated, setIsOfflineSimulated] = useState(false);
  const [isExplainerOpen, setIsExplainerOpen] = useState(false);
  const [citizenReports, setCitizenReports] = useState<CitizenReport[]>(INITIAL_CITIZEN_REPORTS);

  const t = TRANSLATIONS[language];

  // Simulation Parameters state
  const [simulationParams, setSimulationParams] = useState<SimulationParams>({
    rainfallIntensityMmHr: selectedCity.weather.currentRainfallMmHr,
    durationHours: 3.5,
    drainMaintenanceEfficiency: 65,
    tideLevelM: selectedCity.weather.stormSurgeTideM,
    soilSaturationInitial: 80,
    blockedDrainIds: selectedCity.drainageChannels.filter(d => d.isBlocked).map(d => d.id),
    activePumpingStations: selectedCity.drainageChannels.filter(d => d.pumpingStationActive).map(d => d.id),
  });

  // Dynamically compute zone hydrological states based on simulation parameters
  const computedZones = useMemo(() => {
    return selectedCity.zones.map((zone) => {
      const hydro = calculateZoneHydrology(zone, selectedCity, simulationParams);
      const computedStreets: StreetVulnerability[] = zone.keyStreets.map((st) =>
        calculateStreetHydrology(st, zone, selectedCity, simulationParams)
      );

      return {
        ...zone,
        predictedInundationDepthCm: hydro.predictedInundationDepthCm,
        predictedFloodedAreaPercent: hydro.floodedAreaPercent,
        currentRisk: hydro.risk,
        alertTier: hydro.alertTier,
        keyStreets: computedStreets,
        leadTimeToFloodMins: hydro.leadTimeToFloodMins,
        drainageDeficitCusecs: hydro.drainageDeficitCusecs,
      };
    });
  }, [selectedCity, simulationParams]);

  /**
   * Composite Vulnerability Risk Index per zone, plus the auto-ranked
   * dispatch / evacuation queue derived from it. Everything downstream -
   * map colouring, resource priority, the evacuation order - reads from here
   * rather than from hand-authored priority fields.
   */
  const assessments = useMemo(
    () => computedZones.map((zone) => assessZone(zone, selectedCity, zone.leadTimeToFloodMins)),
    [computedZones, selectedCity]
  );

  const priorityQueue = useMemo(() => rankByPriority(assessments), [assessments]);

  /**
   * Dispatch recommendations, derived from the index rather than authored.
   * This is what makes the board work in every city instead of only Chennai.
   */
  const resourcePlan = useMemo(
    () => recommendResources(priorityQueue, computedZones, selectedCity),
    [priorityQueue, computedZones, selectedCity]
  );

  const assessmentById = useMemo(
    () => Object.fromEntries(assessments.map((a) => [a.zoneId, a])),
    [assessments]
  );


  // Selected Zone for detailed inspection
  const [selectedZoneId, setSelectedZoneId] = useState<string>(computedZones[0]?.id || 'velachery');
  const selectedZone = computedZones.find(z => z.id === selectedZoneId) || computedZones[0];

  const handleSelectCity = (newCity: CityData) => {
    setSelectedCity(newCity);
    setSimulationParams({
      rainfallIntensityMmHr: newCity.weather.currentRainfallMmHr,
      durationHours: 3.0,
      drainMaintenanceEfficiency: 65,
      tideLevelM: newCity.weather.stormSurgeTideM,
      soilSaturationInitial: 75,
      blockedDrainIds: newCity.drainageChannels.filter(d => d.isBlocked).map(d => d.id),
      activePumpingStations: newCity.drainageChannels.filter(d => d.pumpingStationActive).map(d => d.id),
    });
    setSelectedZoneId(newCity.zones[0]?.id || '');
  };

  const handleToggleDrainBlockage = (drainId: string) => {
    const isBlocked = simulationParams.blockedDrainIds.includes(drainId);
    setSimulationParams({
      ...simulationParams,
      blockedDrainIds: isBlocked
        ? simulationParams.blockedDrainIds.filter(id => id !== drainId)
        : [...simulationParams.blockedDrainIds, drainId],
    });
  };

  const handleTogglePumpingStation = (drainId: string) => {
    const isActive = simulationParams.activePumpingStations.includes(drainId);
    setSimulationParams({
      ...simulationParams,
      activePumpingStations: isActive
        ? simulationParams.activePumpingStations.filter(id => id !== drainId)
        : [...simulationParams.activePumpingStations, drainId],
    });
  };

  const handleResetSimulation = () => {
    setSimulationParams({
      rainfallIntensityMmHr: selectedCity.weather.currentRainfallMmHr,
      durationHours: 3.5,
      drainMaintenanceEfficiency: 65,
      tideLevelM: selectedCity.weather.stormSurgeTideM,
      soilSaturationInitial: 80,
      blockedDrainIds: selectedCity.drainageChannels.filter(d => d.isBlocked).map(d => d.id),
      activePumpingStations: selectedCity.drainageChannels.filter(d => d.pumpingStationActive).map(d => d.id),
    });
  };

  // High level overview metrics
  const severeOrCriticalZonesCount = computedZones.filter(
    z => z.currentRisk === 'severe' || z.currentRisk === 'critical'
  ).length;

  const totalAtRiskPopulation = computedZones
    .filter(z => z.predictedInundationDepthCm >= 30)
    .reduce((sum, z) => sum + z.population, 0);

  const shortestLeadTimeMins = Math.min(
    ...computedZones.flatMap(z => z.keyStreets.map(s => s.predictedTimeToFloodMinutes))
  );

  // Keep the document language in step so screen readers use the right voice.
  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  return (
    <div className="relative min-h-screen bg-bg text-fg flex flex-col font-sans selection:bg-risk-low/30 selection:text-risk-low overflow-x-hidden">
      <a href="#main-content" className="sr-only-focusable">Skip to main content</a>

      {/* Live sky (Vanta CLOUDS2), lazily loaded after first paint. */}
      <VantaBackground />

      {/* Ambient Fluid Hydrodynamics Background SVG & Blurs with Multi-Accent Nodes */}
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
        {/* Fluid Glowing Liquid Orbs (Multi-Accent: Emerald, Violet, Cyan, Amber) */}
        <div className="absolute -top-40 -left-40 w-[600px] h-[600px] rounded-full bg-accent/10 blur-[140px] animate-hydro-pulse" />
        <div className="absolute top-1/3 -right-40 w-[700px] h-[700px] rounded-full bg-accent-2/10 blur-[160px] animate-hydro-pulse" style={{ animationDelay: '2s' }} />
        <div className="absolute -bottom-40 left-1/3 w-[650px] h-[650px] rounded-full bg-accent/10 blur-[150px] animate-hydro-pulse" style={{ animationDelay: '1s' }} />
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[500px] h-[500px] rounded-full bg-accent-2/5 blur-[170px]" />
        
        {/* Organic Wave Contour Topography Overlay */}
        <svg className="absolute inset-0 w-full h-full opacity-25 animate-fluid-flow" preserveAspectRatio="none" viewBox="0 0 1440 900" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <linearGradient id="appWaveGrad" x1="0%" x2="100%" y1="0%" y2="100%">
              <stop offset="0%" stopColor={tokens.positive} stopOpacity="0.3" />
              <stop offset="35%" stopColor={tokens.accent} stopOpacity="0.25" />
              <stop offset="70%" stopColor={tokens.accent2} stopOpacity="0.2" />
              <stop offset="100%" stopColor={tokens.risk.high} stopOpacity="0.2" />
            </linearGradient>
          </defs>
          <path d="M0,160 C320,300, 420,80, 720,180 C1020,280, 1180,90, 1440,160 L1440,0 L0,0 Z" fill="none" stroke="url(#appWaveGrad)" strokeDasharray="6 8" strokeWidth="1.5" />
          <path d="M0,320 C280,480, 520,240, 840,360 C1160,480, 1260,260, 1440,340" fill="none" opacity="0.6" stroke="url(#appWaveGrad)" strokeWidth="1" />
          <path d="M0,560 C360,420, 600,680, 960,540 C1240,420, 1340,620, 1440,580" fill="none" opacity="0.5" stroke="url(#appWaveGrad)" strokeDasharray="4 6" strokeWidth="1.2" />
          <path d="M0,740 C240,820, 580,680, 900,760 C1180,840, 1360,720, 1440,780" fill="none" opacity="0.4" stroke="url(#appWaveGrad)" strokeWidth="1" />
        </svg>
      </div>

      {/* Navigation Header */}
      <Navbar
        selectedCity={selectedCity}
        onSelectCity={handleSelectCity}
        activeTab={activeTab}
        onChangeTab={setActiveTab}
        userRole={userRole}
        onToggleRole={() => setUserRole(userRole === 'authority' ? 'citizen' : 'authority')}
        onOpenExplainer={() => setIsExplainerOpen(true)}
        weather={selectedCity.weather}
        language={language}
        onToggleLanguage={() => setLanguage(language === 'en' ? 'ta' : 'en')}
        isOfflineSimulated={isOfflineSimulated}
        onToggleOffline={() => setIsOfflineSimulated(!isOfflineSimulated)}
      />

      {/* Offline Mode Emergency Banner (If active) */}
      {isOfflineSimulated && (
        <div className="relative z-20 bg-gradient-to-r from-risk-high via-risk-severe to-risk-high text-on-accent px-4 py-2 text-xs font-bold flex items-center justify-between shadow-lg">
          <div className="flex items-center space-x-2 max-w-7xl mx-auto w-full">
            <WifiOff className="w-4 h-4 shrink-0 animate-bounce" />
            <span>{t.offlineBannerTitle}:</span>
            <span className="font-normal">{t.offlineBannerDesc}</span>
          </div>
          <button
            onClick={() => setIsOfflineSimulated(false)}
            className="px-2 py-0.5 bg-bg text-risk-high rounded text-micro font-mono shrink-0 cursor-pointer"
          >
            Reconnect
          </button>
        </div>
      )}

      {/* Main Container */}
      <main id="main-content" className="relative z-10 flex-1 max-w-7xl w-full mx-auto px-3 sm:px-6 lg:px-8 py-4 space-y-6">
        {/* Top KPI Telemetry Banner */}
        {/* Top KPI Telemetry Banner with Multi-Accent Nodes */}
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {/* Metric 1: Critical Inundation Zones (Neon Coral / Rose Accent) */}
          <div className="glass glass-interactive rounded-panel p-5 relative overflow-hidden group border border-risk-critical/25 hover:border-risk-critical/50 shadow-[0_12px_32px_rgba(244,63,94,0.12)]">
            <div className="absolute -right-8 -bottom-8 w-32 h-32 rounded-full bg-accent-2/15 blur-2xl pointer-events-none group-hover:scale-125 transition-transform duration-500" />
            <div className="flex items-center justify-between">
              <span className="font-mono text-mini text-risk-critical/80 uppercase tracking-wider font-semibold">
                Critical Inundation Zones
              </span>
              <div className="w-10 h-10 rounded-card bg-risk-critical/20 border border-risk-critical/40 flex items-center justify-center text-risk-critical">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24">
                  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                  <line x1="12" x2="12" y1="9" y2="13" />
                  <circle cx="12" cy="17" fill="currentColor" r="1" />
                </svg>
              </div>
            </div>
            <div className="flex items-baseline gap-1.5 mt-3">
              <span className="text-3xl font-extrabold text-fg tracking-tight font-sans">{severeOrCriticalZonesCount}</span>
              <span className="text-muted text-sm">of</span>
              <span className="text-3xl font-extrabold text-risk-critical tracking-tight font-sans">{computedZones.length}</span>
              <span className="text-xs text-muted ml-1 font-medium">wards</span>
            </div>
            <div className="mt-3 flex items-center gap-2 pt-2 border-t border-risk-critical/20">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-accent-2 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-risk-high" />
              </span>
              <span className="text-mini text-risk-high font-medium">
                {severeOrCriticalZonesCount > 0 ? `${severeOrCriticalZonesCount} Sectors in Pre-Alarm State` : 'All Wards Stable'}
              </span>
            </div>
          </div>

          {/* Metric 2: Shortest Lead-Time (Tactical Amber / Gold Accent) */}
          <div className="glass glass-interactive rounded-panel p-5 relative overflow-hidden group border border-risk-high/25 hover:border-risk-high/50 shadow-[0_12px_32px_rgba(245,158,11,0.12)]">
            <div className="absolute -right-8 -bottom-8 w-32 h-32 rounded-full bg-accent-2/15 blur-2xl pointer-events-none group-hover:scale-125 transition-transform duration-500" />
            <div className="flex items-center justify-between">
              <span className="font-mono text-mini text-risk-high/80 uppercase tracking-wider font-semibold">
                Shortest Flood Lead-Time
              </span>
              <div className="w-10 h-10 rounded-card bg-risk-high/20 border border-risk-high/40 flex items-center justify-center text-risk-high">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24">
                  <circle cx="12" cy="13" r="8" />
                  <path d="M12 9v4l2.5 2.5" />
                  <path d="M5 3L2 6" />
                  <path d="M22 6l-3-3" />
                  <path d="M12 2v3" />
                </svg>
              </div>
            </div>
            <div className="flex items-baseline gap-1 mt-3">
              <span className="text-3xl font-extrabold text-risk-high tracking-tight font-sans">
                {shortestLeadTimeMins}
              </span>
              <span className="text-sm text-fg-soft font-medium">min</span>
            </div>
            <div className="mt-3 flex items-center gap-1.5 pt-2 border-t border-risk-high/20">
              <svg className="w-3.5 h-3.5 text-risk-high" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="2" viewBox="0 0 24 24">
                <path d="M2 12h20M2 6h20M2 18h20" />
              </svg>
              <span className="text-mini text-fg-soft truncate">
                {selectedZone?.name || 'Velachery'} Catchment Canal (Ch. 3.4km)
              </span>
            </div>
          </div>

          {/* Metric 3: At-Risk Citizens (Electric Violet / Purple Accent) */}
          <div className="glass glass-interactive rounded-panel p-5 relative overflow-hidden group border border-accent-2/25 hover:border-accent-2/50 shadow-[0_12px_32px_rgba(139,92,246,0.12)]">
            <div className="absolute -right-8 -bottom-8 w-32 h-32 rounded-full bg-accent-2/20 blur-2xl pointer-events-none group-hover:scale-125 transition-transform duration-500" />
            <div className="flex items-center justify-between">
              <span className="font-mono text-mini text-accent-2/80 uppercase tracking-wider font-semibold">
                At-Risk Citizens
              </span>
              <div className="w-10 h-10 rounded-card bg-accent-2/20 border border-accent-2/40 flex items-center justify-center text-accent-2">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24">
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                  <circle cx="9" cy="7" r="4" />
                  <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                  <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                </svg>
              </div>
            </div>
            <div className="flex items-baseline gap-1 mt-3">
              <span className="text-3xl font-extrabold text-fg tracking-tight font-sans">
                {totalAtRiskPopulation.toLocaleString()}
              </span>
            </div>
            <div className="mt-3 flex items-center gap-1.5 pt-2 border-t border-accent-2/20 text-accent-2">
              <svg className="w-3.5 h-3.5 text-accent-2 animate-pulse" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="2" viewBox="0 0 24 24">
                <path d="M4.93 19.07A10 10 0 0 1 19.07 4.93M7.76 16.24A6 6 0 0 1 16.24 7.76M12 12h.01" />
              </svg>
              <span className="text-mini font-medium">Cellular Geo-Cast Armed</span>
            </div>
          </div>

          {/* Metric 4: Choked Drainage Canals (Bright Electric Turquoise / Cyan Accent) */}
          <div className="glass glass-interactive rounded-panel p-5 relative overflow-hidden group border border-accent/25 hover:border-accent/50 shadow-[0_12px_32px_rgba(6,182,212,0.12)]">
            <div className="absolute -right-8 -bottom-8 w-32 h-32 rounded-full bg-accent/20 blur-2xl pointer-events-none group-hover:scale-125 transition-transform duration-500" />
            <div className="flex items-center justify-between">
              <span className="font-mono text-mini text-accent-soft/80 uppercase tracking-wider font-semibold">
                Choked Drainage Canals
              </span>
              <div className="w-10 h-10 rounded-card bg-accent/20 border border-accent/40 flex items-center justify-center text-accent-soft">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="2" viewBox="0 0 24 24">
                  <path d="M4 4v16" />
                  <path d="M20 4v16" />
                  <path d="M4 8h16" />
                  <path d="M4 16h16" />
                  <circle cx="12" cy="12" fill="currentColor" r="2.5" />
                  <path d="M12 4v4" />
                  <path d="M12 16v4" />
                </svg>
              </div>
            </div>
            <div className="flex items-baseline gap-2 mt-3">
              <span className="text-3xl font-extrabold text-accent-soft tracking-tight font-sans">
                {simulationParams.blockedDrainIds.length}
              </span>
              <span className="text-xs text-muted font-medium">Hydraulic Bottlenecks</span>
            </div>
            <div className="mt-3 flex items-center gap-1.5 pt-2 border-t border-accent/20 text-fg-soft text-mini truncate">
              <svg className="w-3.5 h-3.5 text-accent shrink-0" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="2" viewBox="0 0 24 24">
                <polyline points="16 3 21 3 21 8" />
                <line x1="4" x2="21" y1="20" y2="3" />
                <polyline points="21 16 21 21 16 21" />
                <line x1="15" x2="21" y1="15" y2="21" />
                <line x1="4" x2="9" y1="4" y2="9" />
              </svg>
              <span className="truncate">
                {selectedCity.drainageChannels.filter((d) => d.isBlocked).map((d) => d.name).slice(0, 2).join(' & ') || 'Otteri Nullah & Buckingham Canal'}
              </span>
            </div>
          </div>
        </div>

        {/* Tab 1: Interactive Flood Map */}
        {activeTab === 'map' && (
          <div className="space-y-6">
            {/* Composite index for the selected ward, and the queue it feeds. */}
            <div className="grid gap-4 lg:grid-cols-5">
              <div className="lg:col-span-2">
                {assessmentById[selectedZoneId] && (
                  <VulnerabilityIndexPanel assessment={assessmentById[selectedZoneId]} />
                )}
              </div>
              <div className="lg:col-span-3">
                <EvacuationPriorityQueue
                  queue={priorityQueue}
                  selectedZoneId={selectedZoneId}
                  onSelectZone={setSelectedZoneId}
                />
              </div>
            </div>

            {/* Map Mode Toggle Capsule with Bespoke Vector Icons */}
            <div className="glass rounded-panel p-3 flex flex-wrap items-center justify-between gap-3 border border-line-strong/60">
              <div className="flex items-center p-1 rounded-full bg-bg/80 border border-line-strong/60 shadow-inner">
                <button
                  onClick={() => setMapRenderMode('leaflet')}
                  className={`h-8 px-4 rounded-full text-xs font-semibold flex items-center gap-2 transition-colors cursor-pointer ${
                    mapRenderMode === 'leaflet'
                      ? 'bg-gradient-to-r from-risk-low to-risk-low text-fg font-bold'
                      : 'text-muted hover:text-fg'
                  }`}
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24">
                    <circle cx="12" cy="12" r="10" />
                    <path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20" />
                    <path d="M2 12h20" />
                    <circle cx="12" cy="12" fill="currentColor" r="2" />
                  </svg>
                  <span>Leaflet GIS Tile Map</span>
                </button>

                <button
                  onClick={() => setMapRenderMode('schematic')}
                  className={`h-8 px-4 rounded-full text-xs font-semibold flex items-center gap-2 transition-colors cursor-pointer ${
                    mapRenderMode === 'schematic'
                      ? 'bg-gradient-to-r from-risk-low to-risk-low text-fg font-bold'
                      : 'text-muted hover:text-fg'
                  }`}
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24">
                    <rect height="18" rx="2" width="18" x="3" y="3" />
                    <path d="M3 9h18" />
                    <path d="M9 21V9" />
                  </svg>
                  <span>Architectural Schematic Basin</span>
                </button>
              </div>

              <div className="text-xs text-muted font-mono hidden md:flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-accent animate-pulse" />
                <span>{selectedCity.name} Watershed • Topo 30m Resolution</span>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              {/* Map Rendering Container */}
              <div className="lg:col-span-8">
                {mapRenderMode === 'leaflet' ? (
                  <LeafletFloodMap
              resources={resourcePlan}
                    city={selectedCity}
                    zones={computedZones}
                    selectedZone={selectedZone}
                    onSelectZone={(z) => setSelectedZoneId(z.id)}
                    simulationParams={simulationParams}
                    onUpdateParams={setSimulationParams}
                    onToggleDrainBlockage={handleToggleDrainBlockage}
                    onTogglePumpingStation={handleTogglePumpingStation}
                  />
                ) : (
                  <HydrologicalMap
                    city={selectedCity}
                    zones={computedZones}
                    selectedZone={selectedZone}
                    onSelectZone={(z) => setSelectedZoneId(z.id)}
                    simulationParams={simulationParams}
                    onToggleDrainBlockage={handleToggleDrainBlockage}
                    onTogglePumpingStation={handleTogglePumpingStation}
                  />
                )}
              </div>

              {/* Side Action Panel */}
              <div className="lg:col-span-4 flex flex-col gap-5">
                {/* TOP CARD: SELECTED CATCHMENT FOCUS */}
                {selectedZone && (
                  <div className="glass rounded-panel p-5 shadow-2xl flex flex-col gap-4 border border-accent/25 relative overflow-hidden">
                    <div className="flex items-start justify-between">
                      <div className="flex flex-col">
                        <span className="font-mono text-micro text-muted uppercase tracking-wider font-semibold">
                          Selected Catchment Focus
                        </span>
                        <h2 className="text-xl font-bold text-fg tracking-tight mt-0.5">{selectedZone.name}</h2>
                      </div>
                      <span className={`px-3 py-1 rounded-full font-mono text-mini font-bold uppercase tracking-wider ${
                        selectedZone.alertTier === 'evacuate'
                          ? 'bg-risk-critical/20 border border-risk-critical/40 text-risk-critical animate-pulse'
                          : selectedZone.alertTier === 'warning'
                          ? 'bg-risk-high/20 border border-risk-high/40 text-risk-high'
                          : 'bg-risk-low/20 border border-risk-low/40 text-risk-low'
                      }`}>
                        Tier {selectedZone.alertTier}
                      </span>
                    </div>

                    {/* Measurements. Colour is applied only where the value
                        genuinely carries a severity - elevation and area do not,
                        so they stay neutral instead of being permanently red or
                        permanently green. */}
                    <div className="grid grid-cols-2 gap-3">
                      <StatTile
                        label="Est. inundation"
                        value={selectedZone.predictedInundationDepthCm}
                        unit="cm"
                        level={selectedZone.currentRisk}
                        note="Trend +2.1 cm / 30m"
                        icon={<Waves className="h-3.5 w-3.5" />}
                      />
                      <StatTile
                        label="Elevation (MSL)"
                        value={selectedZone.averageElevationM}
                        unit="m"
                        note={selectedZone.averageElevationM < 5 ? 'Depression basin' : 'Above basin floor'}
                        icon={<Gauge className="h-3.5 w-3.5" />}
                      />
                      <StatTile
                        label="Catchment area"
                        value={selectedZone.catchmentAreaSqKm}
                        unit="km2"
                        note={`${selectedZone.predictedFloodedAreaPercent}% currently inundated`}
                        icon={<MapIcon className="h-3.5 w-3.5" />}
                      />
                      <StatTile
                        label="Population"
                        value={selectedZone.population.toLocaleString('en-IN')}
                        note={`${assessmentById[selectedZoneId]?.assistedEvacuationNeeded.toLocaleString('en-IN') ?? '-'} need assistance`}
                        icon={<Users className="h-3.5 w-3.5" />}
                      />
                    </div>

                    {/* Fluid Street Inundation Thresholds List */}
                    <div className="flex flex-col gap-2">
                      <span className="text-mini text-muted uppercase tracking-wider font-semibold">
                        Key Streets Inundation Threshold:
                      </span>
                      <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                        {selectedZone.keyStreets.map((st, idx) => (
                          <div
                            key={st.streetId}
                            onClick={() => setActiveTab('streets')}
                            className="flex items-center justify-between p-2.5 rounded-card bg-bg/80 border border-line-strong/60 hover:border-accent/50 transition-colors cursor-pointer"
                          >
                            <div className="flex items-center gap-2.5 min-w-0 pr-2">
                              {/* Coloured by the street's computed risk, not by
                                  its position in the list. The first row was
                                  previously always critical magenta. */}
                              <div
                                className="w-7 h-7 rounded-card flex items-center justify-center shrink-0 border"
                                style={{
                                  color: `var(--color-risk-${st.riskLevel})`,
                                  background: `color-mix(in oklab, var(--color-risk-${st.riskLevel}) 14%, transparent)`,
                                  borderColor: `color-mix(in oklab, var(--color-risk-${st.riskLevel}) 32%, transparent)`,
                                }}
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                  <path d="M4 19h16M4 5h16M6 12h12M12 5v14" />
                                </svg>
                              </div>
                              <div className="flex flex-col min-w-0">
                                <span className="text-xs font-semibold text-fg truncate">{st.name}</span>
                                <span className="text-micro text-muted font-mono truncate">
                                  Culvert threshold: {st.criticalRainfallThresholdMmHr}mm/hr
                                </span>
                              </div>
                            </div>
                            <div className="flex shrink-0 items-center gap-2">
                              <RiskBadge level={st.riskLevel} />
                              <span className="font-mono text-mini text-muted whitespace-nowrap">
                                {st.criticalRainfallThresholdMmHr} mm/h
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Inspect Action Pill */}
                    <button
                      onClick={() => setActiveTab('streets')}
                      className="w-full py-2 px-4 rounded-full bg-surface-2/80 hover:bg-surface-3 text-accent border border-accent/30 hover:border-accent text-xs font-semibold flex items-center justify-center gap-2 transition-colors shadow-sm cursor-pointer"
                    >
                      <span>Inspect Micro-Thresholds &amp; Resident Directives</span>
                      <ArrowUpRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}

                {/* Gemini AI Briefing */}
                <GeminiExecutiveReport
                  city={selectedCity}
                  zones={computedZones}
                  simulationParams={simulationParams}
                />
              </div>
            </div>
          </div>
        )}

        {/* Tab 2: Street-Level Vulnerability & Thresholds */}
        {activeTab === 'streets' && (
          <StreetLevelVulnerability
            city={selectedCity}
            zones={computedZones}
            selectedZone={selectedZone}
            onSelectZone={(z) => setSelectedZoneId(z.id)}
            simulationParams={simulationParams}
          />
        )}

        {/* Tab 3: What-If Hydraulic Sandbox */}
        {activeTab === 'whatif' && (
          <WhatIfScenarioSandbox
            city={selectedCity}
            zones={computedZones}
            simulationParams={simulationParams}
            onUpdateParams={setSimulationParams}
            onResetParams={handleResetSimulation}
          />
        )}

        {/* Tab 4: Tiered Alert Hub */}
        {activeTab === 'alerts' && (
          <TieredAlertSystem
            city={selectedCity}
            zones={computedZones}
            selectedZone={selectedZone}
          />
        )}

        {/* Tab 5: Tactical Resource Pre-Positioning */}
        {activeTab === 'resources' && (
          <div className="space-y-6">
            <EvacuationPriorityQueue
              queue={priorityQueue}
              selectedZoneId={selectedZoneId}
              onSelectZone={setSelectedZoneId}
            />
            <ResourcePrepositioningHub
              city={selectedCity}
              zones={computedZones}
              resources={resourcePlan}
              simulationParams={simulationParams}
              onDispatchResource={(resId) => console.log('Dispatched', resId)}
            />
          </div>
        )}

        {/* Tab 6: The 4 Input Data Streams */}
        {activeTab === 'fourinputs' && (
          <FourInputsDataHub
            city={selectedCity}
            weather={selectedCity.weather}
            drainageChannels={selectedCity.drainageChannels}
          />
        )}

        {/* Tab 7: 72h Timeline & Confidence */}
        {activeTab === 'timeline' && (
          <HydrologicalTimelineView
            city={selectedCity}
            weather={selectedCity.weather}
            isOfflineSimulated={isOfflineSimulated}
            onToggleOffline={() => setIsOfflineSimulated(!isOfflineSimulated)}
          />
        )}

        {/* Tab 8: Citizen Safety Portal */}
        {activeTab === 'citizen' && (
          <CitizenPortal
            city={selectedCity}
            zones={computedZones}
            shelters={selectedCity.reliefShelters}
            citizenReports={citizenReports}
            onAddCitizenReport={(rep) => setCitizenReports([rep, ...citizenReports])}
          />
        )}
      </main>

      {/* FLUID HYDRODYNAMIC FOOTER */}
      <footer className="w-full relative z-10 py-6 px-4 sm:px-6">
        <div className="max-w-7xl mx-auto glass rounded-full px-6 py-3 flex flex-col md:flex-row items-center justify-between gap-3 text-xs text-muted border border-risk-low/20">
          <div className="flex items-center gap-2">
            <span className="text-risk-low font-semibold flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-risk-low animate-pulse" />
              JalRakshak AI
            </span>
            <span className="text-subtle">•</span>
            <span>S-34 AI-Based Flood Risk Prediction &amp; Tiered Early Warning System</span>
          </div>
          <div className="flex items-center gap-4">
            <button
              onClick={() => setIsExplainerOpen(true)}
              className="hover:text-risk-low transition-colors text-accent-soft font-medium cursor-pointer"
            >
              System Concept &amp; 4 Inputs
            </button>
            <span className="hidden md:inline text-subtle">•</span>
            <span className="text-fg-soft font-medium">Multi-City ML Model (Chennai, Mumbai, Bengaluru)</span>
          </div>
        </div>
      </footer>

      {/* System Concept Explainer Modal */}
      <SystemExplainerModal
        isOpen={isExplainerOpen}
        onClose={() => setIsExplainerOpen(false)}
      />
    </div>
  );
}
