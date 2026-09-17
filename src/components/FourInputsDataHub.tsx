import React, { useState } from 'react';
import { CityData, WeatherForecast, DrainageChannel, HistoricalFloodComparison } from '../types';
import { CloudRain, Waves, Radio, History, CheckCircle2, AlertCircle, Gauge, Activity, Wind, Compass, Droplet } from 'lucide-react';
import { CHENNAI_HISTORICAL_DATA } from '../data/mockData';

interface Props {
  city: CityData;
  weather: WeatherForecast;
  drainageChannels: DrainageChannel[];
}

export const FourInputsDataHub: React.FC<Props> = ({
  city,
  weather,
  drainageChannels,
}) => {
  const [activeTab, setActiveTab] = useState<'rainfall' | 'drainage' | 'forecast' | 'historical'>('rainfall');

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 md:p-6 shadow-xl space-y-6" id="four-inputs-hub">
      {/* Section Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between pb-5 border-b border-slate-800 gap-4">
        <div>
          <div className="flex items-center space-x-2 text-cyan-400 font-bold text-xs uppercase tracking-wider">
            <Radio className="w-4 h-4" />
            <span>Official 4-Pillar Telemetry Pipeline</span>
          </div>
          <h2 className="text-xl md:text-2xl font-bold text-white mt-1">
            Hydrological Data Ingestion & ML Validation Engine
          </h2>
          <p className="text-slate-400 text-xs md:text-sm mt-0.5">
            The core four data streams powering the predictive models before floodwaters accumulate on streets.
          </p>
        </div>

        {/* Tab Pills */}
        <div className="flex items-center space-x-1.5 bg-slate-950 p-1 rounded-xl border border-slate-800">
          <button
            onClick={() => setActiveTab('rainfall')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center space-x-1.5 transition-all ${
              activeTab === 'rainfall' ? 'bg-cyan-500 text-slate-950 font-bold shadow' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <CloudRain className="w-3.5 h-3.5" />
            <span>1. Rainfall Data</span>
          </button>

          <button
            onClick={() => setActiveTab('drainage')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center space-x-1.5 transition-all ${
              activeTab === 'drainage' ? 'bg-cyan-500 text-slate-950 font-bold shadow' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Waves className="w-3.5 h-3.5" />
            <span>2. Drainage Info</span>
          </button>

          <button
            onClick={() => setActiveTab('forecast')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center space-x-1.5 transition-all ${
              activeTab === 'forecast' ? 'bg-cyan-500 text-slate-950 font-bold shadow' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Radio className="w-3.5 h-3.5" />
            <span>3. Forecast Radar</span>
          </button>

          <button
            onClick={() => setActiveTab('historical')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center space-x-1.5 transition-all ${
              activeTab === 'historical' ? 'bg-cyan-500 text-slate-950 font-bold shadow' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <History className="w-3.5 h-3.5" />
            <span>4. Historical Deluges</span>
          </button>
        </div>
      </div>

      {/* Tab 1: Live Rainfall Data */}
      {activeTab === 'rainfall' && (
        <div className="space-y-4 animate-in fade-in duration-200">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl">
              <div className="text-xs text-slate-400">Current Precipitation Rate</div>
              <div className="text-2xl font-mono font-bold text-cyan-400 mt-1">
                {weather.currentRainfallMmHr} <span className="text-xs text-slate-400 font-sans">mm/hr</span>
              </div>
              <div className="text-[10px] text-rose-400 mt-1 font-semibold flex items-center">
                <AlertCircle className="w-3 h-3 mr-1" />
                <span>Exceeding standard drain capacity (30mm/h)</span>
              </div>
            </div>

            <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl">
              <div className="text-xs text-slate-400">24-Hour Accumulated Rain</div>
              <div className="text-2xl font-mono font-bold text-blue-400 mt-1">
                {weather.totalAccumulated24hMm} <span className="text-xs text-slate-400 font-sans">mm</span>
              </div>
              <div className="text-[10px] text-slate-500 mt-1">Ground soil saturated</div>
            </div>

            <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl">
              <div className="text-xs text-slate-400">Intensity Category</div>
              <div className="text-lg font-bold text-amber-400 mt-1">
                {weather.intensityCategory}
              </div>
              <div className="text-[10px] text-slate-500 mt-1">IMD Heavy Squall Criteria</div>
            </div>

            <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl">
              <div className="text-xs text-slate-400">Atmospheric Barometer</div>
              <div className="text-2xl font-mono font-bold text-indigo-400 mt-1">
                {weather.atmosphericPressureHpa} <span className="text-xs text-slate-400 font-sans">hPa</span>
              </div>
              <div className="text-[10px] text-slate-500 mt-1">Low pressure trough active</div>
            </div>
          </div>

          <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl text-xs space-y-2">
            <h4 className="font-bold text-white text-sm">How Rainfall Input Operates:</h4>
            <p className="text-slate-300 leading-relaxed">
              Automatic Weather Stations (AWS) stream 5-minute precipitation intensity readings. Rather than only summing total rain, 
              the ML hydrological model continuously tracks the <em>rate of water volume inflow</em> (Q_in = C × I × A) 
              versus the urban storm drainage evacuation rate (Q_out).
            </p>
          </div>
        </div>
      )}

      {/* Tab 2: Drainage Capacity & Siltation */}
      {activeTab === 'drainage' && (
        <div className="space-y-4 animate-in fade-in duration-200">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {drainageChannels.map((drain) => (
              <div key={drain.id} className="p-4 bg-slate-950 border border-slate-800 rounded-xl space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <span className={`w-2.5 h-2.5 rounded-full ${drain.isBlocked ? 'bg-rose-500' : 'bg-emerald-500'}`} />
                    <span className="font-bold text-white text-sm">{drain.name}</span>
                  </div>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase ${
                    drain.isBlocked ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30' : 'bg-emerald-500/20 text-emerald-300'
                  }`}>
                    {drain.isBlocked ? 'Choked' : 'Operational'}
                  </span>
                </div>

                <div className="space-y-1">
                  <div className="flex justify-between text-xs text-slate-400 font-mono">
                    <span>Flow: {drain.currentFlowCusecs} cusecs</span>
                    <span>Max: {drain.maxCapacityCusecs} cusecs</span>
                  </div>
                  {/* Progress bar */}
                  <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${
                        (drain.currentFlowCusecs / drain.maxCapacityCusecs) > 0.85 ? 'bg-rose-500' : 'bg-cyan-500'
                      }`}
                      style={{ width: `${Math.min(100, (drain.currentFlowCusecs / drain.maxCapacityCusecs) * 100)}%` }}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs pt-1 border-t border-slate-800/80">
                  <div>
                    <span className="text-slate-500 text-[10px] uppercase block">Silt / Debris Choke</span>
                    <span className="font-mono font-bold text-amber-400">{drain.chokePercentage}% Choked</span>
                  </div>
                  <div>
                    <span className="text-slate-500 text-[10px] uppercase block">Outfall Status</span>
                    <span className="font-mono text-slate-300">{drain.outfallCondition.replace('_', ' ')}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl text-xs">
            <p className="text-slate-300 leading-relaxed">
              <strong className="text-white">Why Drainage is the critical multiplier:</strong> A 40mm/hr rainstorm with clear drains creates minimal pooling; 
              the identical 40mm/hr rainstorm with a 65% choked surplus channel causes 70+ cm water stagnation into surrounding residential neighborhoods within 45 minutes.
            </p>
          </div>
        </div>
      )}

      {/* Tab 3: Weather Forecast Radar */}
      {activeTab === 'forecast' && (
        <div className="space-y-4 animate-in fade-in duration-200">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl">
              <div className="text-xs text-slate-400">Next 6 Hours Forecast</div>
              <div className="text-2xl font-mono font-bold text-cyan-400 mt-1">
                +{weather.forecast6hMm} <span className="text-xs text-slate-400 font-sans">mm</span>
              </div>
              <div className="text-[10px] text-cyan-300 mt-1">Doppler: {weather.dopplerRadarTrend}</div>
            </div>

            <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl">
              <div className="text-xs text-slate-400">Next 12 Hours Forecast</div>
              <div className="text-2xl font-mono font-bold text-blue-400 mt-1">
                +{weather.forecast12hMm} <span className="text-xs text-slate-400 font-sans">mm</span>
              </div>
              <div className="text-[10px] text-slate-500 mt-1">Intense night squall</div>
            </div>

            <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl">
              <div className="text-xs text-slate-400">Next 24 Hours Total</div>
              <div className="text-2xl font-mono font-bold text-indigo-400 mt-1">
                +{weather.forecast24hMm} <span className="text-xs text-slate-400 font-sans">mm</span>
              </div>
              <div className="text-[10px] text-rose-400 font-semibold mt-1">High Flood Trigger</div>
            </div>

            <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl">
              <div className="text-xs text-slate-400">Next 48 Hours Outlook</div>
              <div className="text-2xl font-mono font-bold text-purple-400 mt-1">
                +{weather.forecast48hMm} <span className="text-xs text-slate-400 font-sans">mm</span>
              </div>
              <div className="text-[10px] text-slate-500 mt-1">Depression crossing coast</div>
            </div>
          </div>

          <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl text-xs space-y-2">
            <h4 className="font-bold text-white text-sm">Predicting Hours Before Water Rises:</h4>
            <p className="text-slate-300 leading-relaxed">
              By combining high-resolution atmospheric models (WRF / ECMWF) with Doppler Radar nowcasts, 
              JalRakshak AI forecasts inundation <strong>6 to 12 hours prior to storm landfall</strong>, 
              allowing authorities to empty reservoirs, issue vehicle warnings, and stage rescue boats before roads flood.
            </p>
          </div>
        </div>
      )}

      {/* Tab 4: Historical Flood Calibration (Chennai 2015 & 2023) */}
      {activeTab === 'historical' && (
        <div className="space-y-4 animate-in fade-in duration-200">
          <div className="p-3.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-300">
            <span className="font-bold text-white">Machine Learning Ground-Truth Training:</span> The hydrological risk model is calibrated and validated against real past inundation datasets from the 2015 Deluge and 2023 Cyclone Michaung in Chennai.
          </div>

          <div className="space-y-3">
            {CHENNAI_HISTORICAL_DATA.map((deluge, i) => (
              <div key={i} className="p-4 bg-slate-950 border border-slate-800 rounded-xl space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <span className="p-1 rounded bg-cyan-500/20 text-cyan-400 font-mono text-xs font-bold">{deluge.year}</span>
                    <span className="font-bold text-white text-sm">{deluge.eventName}</span>
                  </div>
                  <span className="font-mono text-xs text-cyan-300 font-bold">{deluge.recordedRainfallMm24h} mm / 24h</span>
                </div>

                <p className="text-xs text-slate-300 leading-relaxed">
                  <strong className="text-slate-200">Hydrological Root Cause:</strong> {deluge.primaryCause}
                </p>

                <div className="flex items-center space-x-4 text-[11px] text-slate-400 pt-2 border-t border-slate-800/80 font-mono">
                  <span>Peak Inundation: <strong className="text-slate-200">{deluge.peakInundationAreaSqKm} sq.km</strong></span>
                  <span>•</span>
                  <span>Impacted Population: <strong className="text-rose-300">{deluge.affectedPopulation.toLocaleString()}</strong></span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
