import React, { useState, useMemo } from 'react';
import { CITIES, INITIAL_CITIZEN_REPORTS } from './data/mockData';
import { CityData, ZoneData, SimulationParams, CitizenReport, StreetVulnerability } from './types';
import { calculateZoneHydrology, calculateStreetHydrology } from './utils/floodEngine';
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
import { AlertTriangle, ShieldCheck, Waves, Users, Clock, ArrowUpRight, Gauge, Cpu, CloudRain, Radio, WifiOff, Map as MapIcon, Sliders } from 'lucide-react';

export default function App() {
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
      };
    });
  }, [selectedCity, simulationParams]);

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

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-cyan-500 selection:text-slate-950">
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
        <div className="bg-gradient-to-r from-amber-600 via-orange-600 to-amber-700 text-slate-950 px-4 py-2 text-xs font-bold flex items-center justify-between shadow-lg">
          <div className="flex items-center space-x-2 max-w-7xl mx-auto w-full">
            <WifiOff className="w-4 h-4 shrink-0 animate-bounce" />
            <span>{t.offlineBannerTitle}:</span>
            <span className="font-normal">{t.offlineBannerDesc}</span>
          </div>
          <button
            onClick={() => setIsOfflineSimulated(false)}
            className="px-2 py-0.5 bg-slate-950 text-amber-300 rounded text-[10px] font-mono shrink-0 cursor-pointer"
          >
            Reconnect
          </button>
        </div>
      )}

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* Top KPI Telemetry Banner */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
          <div className="p-4 bg-slate-900/90 border border-slate-800 rounded-2xl shadow-lg flex items-center space-x-3">
            <div className="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 shrink-0">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <div className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">{t.criticalZones}</div>
              <div className="text-xl font-mono font-bold text-white mt-0.5">
                {severeOrCriticalZonesCount} of {computedZones.length} <span className="text-xs text-rose-400">Wards</span>
              </div>
            </div>
          </div>

          <div className="p-4 bg-slate-900/90 border border-slate-800 rounded-2xl shadow-lg flex items-center space-x-3">
            <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-400 shrink-0">
              <Clock className="w-5 h-5" />
            </div>
            <div>
              <div className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">{t.shortestLead}</div>
              <div className="text-xl font-mono font-bold text-amber-300 mt-0.5">
                {shortestLeadTimeMins} <span className="text-xs text-slate-400">min</span>
              </div>
            </div>
          </div>

          <div className="p-4 bg-slate-900/90 border border-slate-800 rounded-2xl shadow-lg flex items-center space-x-3">
            <div className="p-2.5 rounded-xl bg-blue-500/10 border border-blue-500/30 text-blue-400 shrink-0">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <div className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">{t.atRiskCitizens}</div>
              <div className="text-xl font-mono font-bold text-blue-300 mt-0.5">
                {totalAtRiskPopulation.toLocaleString()}
              </div>
            </div>
          </div>

          <div className="p-4 bg-slate-900/90 border border-slate-800 rounded-2xl shadow-lg flex items-center space-x-3">
            <div className="p-2.5 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 shrink-0">
              <Waves className="w-5 h-5" />
            </div>
            <div>
              <div className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">{t.chokedDrains}</div>
              <div className="text-xl font-mono font-bold text-cyan-300 mt-0.5">
                {simulationParams.blockedDrainIds.length} <span className="text-xs text-slate-400">Bottlenecks</span>
              </div>
            </div>
          </div>
        </div>

        {/* Tab 1: Interactive Flood Map */}
        {activeTab === 'map' && (
          <div className="space-y-6">
            {/* Map Mode Toggle (Leaflet GIS with Carto tiles vs Hydraulic Schematic) */}
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <span className="text-xs font-bold text-slate-300 uppercase tracking-wider">Map Visualization Engine:</span>
                <div className="flex items-center bg-slate-900 p-1 rounded-xl border border-slate-800 text-xs">
                  <button
                    onClick={() => setMapRenderMode('leaflet')}
                    className={`px-3 py-1 rounded-lg font-semibold flex items-center space-x-1.5 transition-all cursor-pointer ${
                      mapRenderMode === 'leaflet'
                        ? 'bg-cyan-500 text-slate-950 font-bold shadow'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    <MapIcon className="w-3.5 h-3.5" />
                    <span>Leaflet GIS Tile Map</span>
                  </button>

                  <button
                    onClick={() => setMapRenderMode('schematic')}
                    className={`px-3 py-1 rounded-lg font-semibold flex items-center space-x-1.5 transition-all cursor-pointer ${
                      mapRenderMode === 'schematic'
                        ? 'bg-cyan-500 text-slate-950 font-bold shadow'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    <Gauge className="w-3.5 h-3.5" />
                    <span>Architectural Schematic Basin</span>
                  </button>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Map Rendering Container */}
              <div className="lg:col-span-8">
                {mapRenderMode === 'leaflet' ? (
                  <LeafletFloodMap
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
              <div className="lg:col-span-4 space-y-4">
                {/* Selected Zone Deep Dive */}
                {selectedZone && (
                  <div className="p-5 bg-slate-900 border border-slate-800 rounded-2xl shadow-xl space-y-3">
                    <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                      <div>
                        <div className="text-[10px] uppercase font-mono text-cyan-400 font-bold">Selected Catchment</div>
                        <h3 className="text-lg font-bold text-white mt-0.5">{selectedZone.name}</h3>
                      </div>
                      <span className={`px-2.5 py-1 rounded text-xs font-bold uppercase ${
                        selectedZone.alertTier === 'evacuate' ? 'bg-rose-500 text-white animate-pulse' :
                        selectedZone.alertTier === 'warning' ? 'bg-orange-500 text-white' : 'bg-yellow-500 text-slate-950'
                      }`}>
                        Tier {selectedZone.alertTier}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="p-2.5 bg-slate-950 rounded-xl border border-slate-800">
                        <span className="text-slate-400 text-[10px] block">Est. Inundation</span>
                        <span className="text-base font-mono font-bold text-rose-400">{selectedZone.predictedInundationDepthCm} cm</span>
                      </div>
                      <div className="p-2.5 bg-slate-950 rounded-xl border border-slate-800">
                        <span className="text-slate-400 text-[10px] block">Elevation (MSL)</span>
                        <span className="text-base font-mono font-bold text-blue-400">{selectedZone.averageElevationM} m</span>
                      </div>
                      <div className="p-2.5 bg-slate-950 rounded-xl border border-slate-800">
                        <span className="text-slate-400 text-[10px] block">Catchment Area</span>
                        <span className="text-base font-mono font-bold text-slate-200">{selectedZone.catchmentAreaSqKm} km²</span>
                      </div>
                      <div className="p-2.5 bg-slate-950 rounded-xl border border-slate-800">
                        <span className="text-slate-400 text-[10px] block">Population</span>
                        <span className="text-base font-mono font-bold text-slate-200">{selectedZone.population.toLocaleString()}</span>
                      </div>
                    </div>

                    {/* Quick Street Threshold links */}
                    <div className="pt-2 border-t border-slate-800">
                      <div className="text-xs font-semibold text-slate-300 mb-2">Key Streets Inundation Threshold:</div>
                      <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1 scrollbar-thin">
                        {selectedZone.keyStreets.map((st) => (
                          <div
                            key={st.streetId}
                            onClick={() => setActiveTab('streets')}
                            className="p-2 bg-slate-950 hover:bg-slate-800 rounded-lg border border-slate-800 cursor-pointer flex items-center justify-between text-xs transition-colors"
                          >
                            <span className="text-slate-200 truncate pr-2">{st.name}</span>
                            <span className="font-mono text-cyan-400 font-bold shrink-0">{st.criticalRainfallThresholdMmHr}mm/h</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <button
                      onClick={() => setActiveTab('streets')}
                      className="w-full py-2 bg-slate-800 hover:bg-slate-700 text-cyan-300 font-semibold text-xs rounded-xl flex items-center justify-center space-x-1.5 transition-colors cursor-pointer"
                    >
                      <span>Inspect Micro-Thresholds & Resident Directives</span>
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
          <ResourcePrepositioningHub
            city={selectedCity}
            zones={computedZones}
            simulationParams={simulationParams}
            onDispatchResource={(resId) => console.log('Dispatched', resId)}
          />
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

      {/* Footer */}
      <footer className="bg-slate-950 border-t border-slate-800/80 py-6 px-4 sm:px-6 lg:px-8 text-center text-xs text-slate-500">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center space-x-2 text-slate-400">
            <span className="font-bold text-white">JalRakshak AI</span>
            <span>•</span>
            <span>S-34 AI-Based Flood Risk Prediction & Tiered Early Warning System</span>
          </div>
          <div className="flex items-center space-x-4">
            <button
              onClick={() => setIsExplainerOpen(true)}
              className="text-cyan-400 hover:text-cyan-300 font-semibold cursor-pointer"
            >
              System Concept & 4 Inputs
            </button>
            <span>•</span>
            <span>Multi-City ML Model (Chennai, Mumbai, Bengaluru)</span>
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
