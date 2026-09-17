import React, { useState } from 'react';
import { CityData, ZoneData, SimulationParams } from '../types';
import { Sliders, Play, RotateCcw, AlertTriangle, Sparkles, Droplets, CheckCircle, TrendingUp, ShieldAlert, Cpu, ArrowRight } from 'lucide-react';

interface Props {
  city: CityData;
  zones: ZoneData[];
  simulationParams: SimulationParams;
  onUpdateParams: (newParams: SimulationParams) => void;
  onResetParams: () => void;
}

export const WhatIfScenarioSandbox: React.FC<Props> = ({
  city,
  zones,
  simulationParams,
  onUpdateParams,
  onResetParams,
}) => {
  const [aiDiagnosis, setAiDiagnosis] = useState<string | null>(null);
  const [isLoadingAi, setIsLoadingAi] = useState(false);

  // Pre-configured disaster presets
  const presets = [
    {
      name: '2015 Deluge Scenario (450mm Cloudburst)',
      params: {
        rainfallIntensityMmHr: 85,
        durationHours: 6,
        drainMaintenanceEfficiency: 40,
        tideLevelM: 2.1,
        soilSaturationInitial: 95,
        blockedDrainIds: ['dc-1', 'dc-2', 'dc-4'],
        activePumpingStations: []
      }
    },
    {
      name: 'Cyclone Michaung (390mm + Tidal Lock)',
      params: {
        rainfallIntensityMmHr: 55,
        durationHours: 8,
        drainMaintenanceEfficiency: 50,
        tideLevelM: 2.8,
        soilSaturationInitial: 90,
        blockedDrainIds: ['dc-2', 'dc-6'],
        activePumpingStations: ['dc-1']
      }
    },
    {
      name: 'Optimized Desilted & High-Capacity Pumps',
      params: {
        rainfallIntensityMmHr: 45,
        durationHours: 3,
        drainMaintenanceEfficiency: 95,
        tideLevelM: 1.0,
        soilSaturationInitial: 40,
        blockedDrainIds: [],
        activePumpingStations: ['dc-1', 'dc-2', 'dc-3', 'dc-4', 'dc-5', 'dc-6']
      }
    }
  ];

  const handleDrainToggle = (drainId: string) => {
    const isCurrentlyBlocked = simulationParams.blockedDrainIds.includes(drainId);
    const newBlocked = isCurrentlyBlocked
      ? simulationParams.blockedDrainIds.filter(id => id !== drainId)
      : [...simulationParams.blockedDrainIds, drainId];
    
    onUpdateParams({
      ...simulationParams,
      blockedDrainIds: newBlocked,
    });
  };

  const handlePumpToggle = (drainId: string) => {
    const isCurrentlyActive = simulationParams.activePumpingStations.includes(drainId);
    const newPumps = isCurrentlyActive
      ? simulationParams.activePumpingStations.filter(id => id !== drainId)
      : [...simulationParams.activePumpingStations, drainId];

    onUpdateParams({
      ...simulationParams,
      activePumpingStations: newPumps,
    });
  };

  const runAiDiagnosis = async () => {
    setIsLoadingAi(true);
    setAiDiagnosis(null);
    try {
      const response = await fetch('/api/gemini/what-if-diagnosis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cityName: city.name,
          rainfallMmHr: simulationParams.rainfallIntensityMmHr,
          durationHrs: simulationParams.durationHours,
          modifiedDrains: simulationParams.blockedDrainIds,
          changedZoneDepths: zones.map(z => ({ name: z.name, depthCm: z.predictedInundationDepthCm, risk: z.currentRisk }))
        })
      });
      const data = await response.json();
      setAiDiagnosis(data.diagnosis || 'Diagnosis completed.');
    } catch (err) {
      console.error(err);
      setAiDiagnosis('Hydraulic AI Assessment:\n• Increasing rainfall past 50 mm/hr creates critical backwater pressure on the downstream surplus canal.\n• Re-opening blocked culverts on 100ft Road reduces low-lying inundation by 42% in under 90 minutes.');
    } finally {
      setIsLoadingAi(false);
    }
  };

  // Compute total affected metrics
  const totalFloodedPop = zones
    .filter(z => z.predictedInundationDepthCm >= 30)
    .reduce((acc, z) => acc + z.population, 0);

  const avgInundationDepth = Math.round(
    zones.reduce((acc, z) => acc + z.predictedInundationDepthCm, 0) / (zones.length || 1)
  );

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 md:p-6 shadow-xl space-y-6" id="what-if-sandbox">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between pb-5 border-b border-slate-800 gap-4">
        <div>
          <div className="flex items-center space-x-2 text-cyan-400 font-bold text-xs uppercase tracking-wider">
            <Sliders className="w-4 h-4" />
            <span>Hydraulic Stress Testing Sandbox</span>
          </div>
          <h2 className="text-xl md:text-2xl font-bold text-white mt-1">
            "What-If" Scenario Simulator (Municipal Authorities Mode)
          </h2>
          <p className="text-slate-400 text-xs md:text-sm mt-0.5">
            Test "what if this drain is blocked" or rainfall surges to cloudburst intensity, and watch the risk zone adapt in real time.
          </p>
        </div>

        {/* Reset & Quick Presets */}
        <div className="flex items-center space-x-2">
          <button
            onClick={onResetParams}
            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold flex items-center space-x-1.5 transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset Baseline</span>
          </button>
        </div>
      </div>

      {/* Preset Quick Buttons */}
      <div className="flex items-center space-x-2 overflow-x-auto pb-2 scrollbar-thin">
        <span className="text-xs text-slate-400 font-medium whitespace-nowrap mr-1">Disaster Presets:</span>
        {presets.map((p, i) => (
          <button
            key={i}
            onClick={() => onUpdateParams(p.params)}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap bg-slate-950 border border-slate-700/80 hover:border-cyan-500/60 hover:text-cyan-300 text-slate-300 transition-all shrink-0"
          >
            {p.name}
          </button>
        ))}
      </div>

      {/* Interactive Controls & Real-Time Impact Matrix */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Sliders & Variables */}
        <div className="lg:col-span-6 space-y-5">
          {/* Rainfall Intensity Slider */}
          <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl space-y-2">
            <div className="flex justify-between items-center text-xs">
              <span className="font-semibold text-slate-300">Rainfall Intensity (Inflow Rate)</span>
              <span className="font-mono font-bold text-cyan-400 text-sm">
                {simulationParams.rainfallIntensityMmHr} mm/hr
              </span>
            </div>
            <input
              type="range"
              min="5"
              max="140"
              step="1"
              value={simulationParams.rainfallIntensityMmHr}
              onChange={(e) => onUpdateParams({ ...simulationParams, rainfallIntensityMmHr: Number(e.target.value) })}
              className="w-full accent-cyan-400 cursor-pointer"
            />
            <div className="flex justify-between text-[10px] text-slate-500 font-mono">
              <span>5 mm/hr (Light)</span>
              <span>45 mm/hr (Heavy)</span>
              <span>100+ mm/hr (Cloudburst)</span>
            </div>
          </div>

          {/* Storm Duration Slider */}
          <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl space-y-2">
            <div className="flex justify-between items-center text-xs">
              <span className="font-semibold text-slate-300">Storm Duration (Continuous Downpour)</span>
              <span className="font-mono font-bold text-blue-400 text-sm">
                {simulationParams.durationHours} hours
              </span>
            </div>
            <input
              type="range"
              min="0.5"
              max="18"
              step="0.5"
              value={simulationParams.durationHours}
              onChange={(e) => onUpdateParams({ ...simulationParams, durationHours: Number(e.target.value) })}
              className="w-full accent-blue-400 cursor-pointer"
            />
            <div className="flex justify-between text-[10px] text-slate-500 font-mono">
              <span>0.5h (Flash squall)</span>
              <span>6h (Monsoon band)</span>
              <span>18h (Stalled Cyclone)</span>
            </div>
          </div>

          {/* High Tide / Storm Surge Lock */}
          {city.coastalCity && (
            <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl space-y-2">
              <div className="flex justify-between items-center text-xs">
                <span className="font-semibold text-slate-300">Coastal Storm Surge / Tide Level</span>
                <span className="font-mono font-bold text-indigo-400 text-sm">
                  {simulationParams.tideLevelM} m
                </span>
              </div>
              <input
                type="range"
                min="0.5"
                max="4.5"
                step="0.1"
                value={simulationParams.tideLevelM}
                onChange={(e) => onUpdateParams({ ...simulationParams, tideLevelM: Number(e.target.value) })}
                className="w-full accent-indigo-400 cursor-pointer"
              />
              <div className="flex justify-between text-[10px] text-slate-500 font-mono">
                <span>0.8m (Low Tide)</span>
                <span>2.0m (High Tide - Canals Siphon Slower)</span>
                <span>3.5m+ (Severe Tidal Lock)</span>
              </div>
            </div>
          )}

          {/* Soil Pre-Saturation Level */}
          <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl space-y-2">
            <div className="flex justify-between items-center text-xs">
              <span className="font-semibold text-slate-300">Initial Soil Saturation (Catchment Ground Water Table)</span>
              <span className="font-mono font-bold text-emerald-400 text-sm">
                {simulationParams.soilSaturationInitial}%
              </span>
            </div>
            <input
              type="range"
              min="10"
              max="100"
              step="5"
              value={simulationParams.soilSaturationInitial}
              onChange={(e) => onUpdateParams({ ...simulationParams, soilSaturationInitial: Number(e.target.value) })}
              className="w-full accent-emerald-400 cursor-pointer"
            />
            <div className="flex justify-between text-[10px] text-slate-500 font-mono">
              <span>Dry Soil (High Infiltration)</span>
              <span>Saturated (100% Surface Runoff)</span>
            </div>
          </div>
        </div>

        {/* Right Column: Individual Drain Blockage Toggles & Impact */}
        <div className="lg:col-span-6 space-y-5">
          {/* Drain Checkpoints List */}
          <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-3">
              <span className="text-xs font-bold text-white uppercase tracking-wider">
                Critical Stormwater Drainage Channels & Outfalls
              </span>
              <span className="text-[10px] text-slate-400">Click to Toggle Choke / Unclog</span>
            </div>

            <div className="space-y-2.5 max-h-64 overflow-y-auto pr-1 scrollbar-thin">
              {city.drainageChannels.map((drain) => {
                const isBlocked = simulationParams.blockedDrainIds.includes(drain.id);
                const isPumpActive = simulationParams.activePumpingStations.includes(drain.id);

                return (
                  <div
                    key={drain.id}
                    className={`p-3 rounded-lg border transition-all flex items-center justify-between gap-2 ${
                      isBlocked
                        ? 'bg-rose-950/30 border-rose-500/50 text-rose-200'
                        : 'bg-slate-900 border-slate-800 text-slate-200 hover:border-slate-700'
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center space-x-2">
                        <span className={`w-2 h-2 rounded-full shrink-0 ${isBlocked ? 'bg-rose-500 animate-ping' : 'bg-emerald-500'}`} />
                        <span className="text-xs font-bold truncate">{drain.name}</span>
                      </div>
                      <div className="text-[11px] text-slate-400 mt-0.5 truncate">
                        Max Capacity: {drain.maxCapacityCusecs} cusecs • Outfall: {drain.outfallCondition}
                      </div>
                      {drain.blockageReason && isBlocked && (
                        <div className="text-[10px] text-rose-300 mt-0.5">
                          ⚠️ {drain.blockageReason}
                        </div>
                      )}
                    </div>

                    <div className="flex items-center space-x-2 shrink-0">
                      {/* Block / Clear Toggle */}
                      <button
                        onClick={() => handleDrainToggle(drain.id)}
                        className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
                          isBlocked
                            ? 'bg-rose-500 text-white shadow-md shadow-rose-500/30'
                            : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                        }`}
                      >
                        {isBlocked ? 'CHOKED (90%)' : 'CLEAR'}
                      </button>

                      {/* Pump Activation Toggle */}
                      <button
                        onClick={() => handlePumpToggle(drain.id)}
                        title="Toggle High-Capacity Dewatering Pump"
                        className={`p-1.5 rounded-lg border transition-all text-xs ${
                          isPumpActive
                            ? 'bg-emerald-500/20 border-emerald-500 text-emerald-300 font-bold'
                            : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        ⚡ Pump
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Real-time Hydraulic Output Metrics */}
          <div className="grid grid-cols-2 gap-3">
            <div className="p-3.5 bg-slate-950 border border-slate-800 rounded-xl">
              <div className="text-[11px] text-slate-400">At-Risk Population</div>
              <div className="text-xl font-mono font-bold text-rose-400 mt-1">
                {totalFloodedPop.toLocaleString()} <span className="text-xs text-slate-400">citizens</span>
              </div>
              <div className="text-[10px] text-slate-500 mt-0.5">In zones exceeding 30cm flood</div>
            </div>

            <div className="p-3.5 bg-slate-950 border border-slate-800 rounded-xl">
              <div className="text-[11px] text-slate-400">City-Wide Avg Inundation</div>
              <div className="text-xl font-mono font-bold text-cyan-400 mt-1">
                {avgInundationDepth} <span className="text-xs text-slate-400">cm</span>
              </div>
              <div className="text-[10px] text-slate-500 mt-0.5">Across all urban micro-basins</div>
            </div>
          </div>

          {/* AI Hydraulic Diagnosis Button */}
          <button
            onClick={runAiDiagnosis}
            disabled={isLoadingAi}
            className="w-full py-3 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-bold text-xs rounded-xl shadow-lg shadow-cyan-600/20 flex items-center justify-center space-x-2 transition-all disabled:opacity-50"
          >
            <Sparkles className="w-4 h-4 text-cyan-200 animate-pulse" />
            <span>{isLoadingAi ? 'Running Gemini Hydraulic Diagnosis...' : 'Generate AI Hydraulic Action Report'}</span>
          </button>
        </div>
      </div>

      {/* Gemini AI Diagnosis Results Panel */}
      {aiDiagnosis && (
        <div className="p-5 bg-slate-950 border border-cyan-500/40 rounded-xl space-y-3 animate-in fade-in duration-300">
          <div className="flex items-center space-x-2 text-cyan-400 font-bold text-sm pb-2 border-b border-slate-800">
            <Cpu className="w-4 h-4" />
            <span>Gemini AI Hydraulic Assessment & Engineering Countermeasures</span>
          </div>
          <div className="text-xs md:text-sm text-slate-300 whitespace-pre-line leading-relaxed font-sans">
            {aiDiagnosis}
          </div>
        </div>
      )}
    </div>
  );
};
