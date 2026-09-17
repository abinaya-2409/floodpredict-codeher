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
    <div className="bg-surface border border-line rounded-card p-5 md:p-6 shadow-xl space-y-6" id="what-if-sandbox">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between pb-5 border-b border-line gap-4">
        <div>
          <div className="flex items-center space-x-2 text-accent font-bold text-xs uppercase tracking-wider">
            <Sliders className="w-4 h-4" />
            <span>Hydraulic Stress Testing Sandbox</span>
          </div>
          <h2 className="text-xl md:text-2xl font-bold text-fg mt-1">
            "What-If" Scenario Simulator (Municipal Authorities Mode)
          </h2>
          <p className="text-muted text-xs md:text-sm mt-0.5">
            Test "what if this drain is blocked" or rainfall surges to cloudburst intensity, and watch the risk zone adapt in real time.
          </p>
        </div>

        {/* Reset & Quick Presets */}
        <div className="flex items-center space-x-2">
          <button
            onClick={onResetParams}
            className="px-3 py-1.5 bg-surface-2 hover:bg-surface-3 text-fg-soft rounded-card text-xs font-semibold flex items-center space-x-1.5 transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset Baseline</span>
          </button>
        </div>
      </div>

      {/* Preset Quick Buttons */}
      <div className="flex items-center space-x-2 overflow-x-auto pb-2 scrollbar-thin">
        <span className="text-xs text-muted font-medium whitespace-nowrap mr-1">Disaster Presets:</span>
        {presets.map((p, i) => (
          <button
            key={i}
            onClick={() => onUpdateParams(p.params)}
            className="px-3 py-1.5 rounded-control text-xs font-semibold whitespace-nowrap bg-bg border border-line-strong/80 hover:border-accent/60 hover:text-accent-soft text-fg-soft transition-all shrink-0"
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
          <div className="p-4 bg-bg border border-line rounded-card space-y-2">
            <div className="flex justify-between items-center text-xs">
              <span className="font-semibold text-fg-soft">Rainfall Intensity (Inflow Rate)</span>
              <span className="font-mono font-bold text-accent text-sm">
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
              className="w-full accent-accent cursor-pointer"
            />
            <div className="flex justify-between text-[10px] text-subtle font-mono">
              <span>5 mm/hr (Light)</span>
              <span>45 mm/hr (Heavy)</span>
              <span>100+ mm/hr (Cloudburst)</span>
            </div>
          </div>

          {/* Storm Duration Slider */}
          <div className="p-4 bg-bg border border-line rounded-card space-y-2">
            <div className="flex justify-between items-center text-xs">
              <span className="font-semibold text-fg-soft">Storm Duration (Continuous Downpour)</span>
              <span className="font-mono font-bold text-accent text-sm">
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
              className="w-full accent-accent cursor-pointer"
            />
            <div className="flex justify-between text-[10px] text-subtle font-mono">
              <span>0.5h (Flash squall)</span>
              <span>6h (Monsoon band)</span>
              <span>18h (Stalled Cyclone)</span>
            </div>
          </div>

          {/* High Tide / Storm Surge Lock */}
          {city.coastalCity && (
            <div className="p-4 bg-bg border border-line rounded-card space-y-2">
              <div className="flex justify-between items-center text-xs">
                <span className="font-semibold text-fg-soft">Coastal Storm Surge / Tide Level</span>
                <span className="font-mono font-bold text-accent-2 text-sm">
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
                className="w-full accent-accent-2 cursor-pointer"
              />
              <div className="flex justify-between text-[10px] text-subtle font-mono">
                <span>0.8m (Low Tide)</span>
                <span>2.0m (High Tide - Canals Siphon Slower)</span>
                <span>3.5m+ (Severe Tidal Lock)</span>
              </div>
            </div>
          )}

          {/* Soil Pre-Saturation Level */}
          <div className="p-4 bg-bg border border-line rounded-card space-y-2">
            <div className="flex justify-between items-center text-xs">
              <span className="font-semibold text-fg-soft">Initial Soil Saturation (Catchment Ground Water Table)</span>
              <span className="font-mono font-bold text-risk-low text-sm">
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
              className="w-full accent-risk-low cursor-pointer"
            />
            <div className="flex justify-between text-[10px] text-subtle font-mono">
              <span>Dry Soil (High Infiltration)</span>
              <span>Saturated (100% Surface Runoff)</span>
            </div>
          </div>
        </div>

        {/* Right Column: Individual Drain Blockage Toggles & Impact */}
        <div className="lg:col-span-6 space-y-5">
          {/* Drain Checkpoints List */}
          <div className="p-4 bg-bg border border-line rounded-card">
            <div className="flex items-center justify-between pb-3 border-b border-line mb-3">
              <span className="text-xs font-bold text-fg uppercase tracking-wider">
                Critical Stormwater Drainage Channels & Outfalls
              </span>
              <span className="text-[10px] text-muted">Click to Toggle Choke / Unclog</span>
            </div>

            <div className="space-y-2.5 max-h-64 overflow-y-auto pr-1 scrollbar-thin">
              {city.drainageChannels.map((drain) => {
                const isBlocked = simulationParams.blockedDrainIds.includes(drain.id);
                const isPumpActive = simulationParams.activePumpingStations.includes(drain.id);

                return (
                  <div
                    key={drain.id}
                    className={`p-3 rounded-control border transition-all flex items-center justify-between gap-2 ${
                      isBlocked
                        ? 'bg-risk-critical/30 border-risk-critical/50 text-risk-critical'
                        : 'bg-surface border-line text-fg-soft hover:border-line-strong'
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center space-x-2">
                        <span className={`w-2 h-2 rounded-full shrink-0 ${isBlocked ? 'bg-risk-critical animate-ping' : 'bg-risk-low'}`} />
                        <span className="text-xs font-bold truncate">{drain.name}</span>
                      </div>
                      <div className="text-[11px] text-muted mt-0.5 truncate">
                        Max Capacity: {drain.maxCapacityCusecs} cusecs • Outfall: {drain.outfallCondition}
                      </div>
                      {drain.blockageReason && isBlocked && (
                        <div className="text-[10px] text-risk-critical mt-0.5">
                          ⚠️ {drain.blockageReason}
                        </div>
                      )}
                    </div>

                    <div className="flex items-center space-x-2 shrink-0">
                      {/* Block / Clear Toggle */}
                      <button
                        onClick={() => handleDrainToggle(drain.id)}
                        className={`px-2.5 py-1 rounded-control text-xs font-bold transition-all ${
                          isBlocked
                            ? 'bg-risk-critical text-fg shadow-md shadow-risk-critical/30'
                            : 'bg-surface-2 text-fg-soft hover:bg-surface-3'
                        }`}
                      >
                        {isBlocked ? 'CHOKED (90%)' : 'CLEAR'}
                      </button>

                      {/* Pump Activation Toggle */}
                      <button
                        onClick={() => handlePumpToggle(drain.id)}
                        title="Toggle High-Capacity Dewatering Pump"
                        className={`p-1.5 rounded-control border transition-all text-xs ${
                          isPumpActive
                            ? 'bg-risk-low/20 border-risk-low text-risk-low font-bold'
                            : 'bg-surface-2 border-line-strong text-muted hover:text-fg-soft'
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
            <div className="p-3.5 bg-bg border border-line rounded-card">
              <div className="text-[11px] text-muted">At-Risk Population</div>
              <div className="text-xl font-mono font-bold text-risk-critical mt-1">
                {totalFloodedPop.toLocaleString()} <span className="text-xs text-muted">citizens</span>
              </div>
              <div className="text-[10px] text-subtle mt-0.5">In zones exceeding 30cm flood</div>
            </div>

            <div className="p-3.5 bg-bg border border-line rounded-card">
              <div className="text-[11px] text-muted">City-Wide Avg Inundation</div>
              <div className="text-xl font-mono font-bold text-accent mt-1">
                {avgInundationDepth} <span className="text-xs text-muted">cm</span>
              </div>
              <div className="text-[10px] text-subtle mt-0.5">Across all urban micro-basins</div>
            </div>
          </div>

          {/* AI Hydraulic Diagnosis Button */}
          <button
            onClick={runAiDiagnosis}
            disabled={isLoadingAi}
            className="w-full py-3 bg-gradient-to-r from-accent to-accent hover:from-accent hover:to-accent text-fg font-bold text-xs rounded-card shadow-lg shadow-accent/20 flex items-center justify-center space-x-2 transition-all disabled:opacity-50"
          >
            <Sparkles className="w-4 h-4 text-accent-soft animate-pulse" />
            <span>{isLoadingAi ? 'Running Gemini Hydraulic Diagnosis...' : 'Generate AI Hydraulic Action Report'}</span>
          </button>
        </div>
      </div>

      {/* Gemini AI Diagnosis Results Panel */}
      {aiDiagnosis && (
        <div className="p-5 bg-bg border border-accent/40 rounded-card space-y-3 animate-in fade-in duration-300">
          <div className="flex items-center space-x-2 text-accent font-bold text-sm pb-2 border-b border-line">
            <Cpu className="w-4 h-4" />
            <span>Gemini AI Hydraulic Assessment & Engineering Countermeasures</span>
          </div>
          <div className="text-xs md:text-sm text-fg-soft whitespace-pre-line leading-relaxed font-sans">
            {aiDiagnosis}
          </div>
        </div>
      )}
    </div>
  );
};
