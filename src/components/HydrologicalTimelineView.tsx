import React from 'react';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, Legend, AreaChart, Area } from 'recharts';
import { HYDROLOGICAL_TIMELINE_DATA } from '../data/mockData';
import { CityData, WeatherForecast } from '../types';
import { Activity, CheckCircle, ShieldCheck, Database, Radio, Cpu, HardDrive, Wifi, WifiOff } from 'lucide-react';

interface Props {
  city: CityData;
  weather: WeatherForecast;
  isOfflineSimulated: boolean;
  onToggleOffline: () => void;
}

export const HydrologicalTimelineView: React.FC<Props> = ({
  city,
  weather,
  isOfflineSimulated,
  onToggleOffline,
}) => {
  return (
    <div className="space-y-6" id="hydrological-timeline-view">
      {/* Offline Mode Banner & Model Confidence Header */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Model Confidence Card */}
        <div className="p-5 bg-slate-900 border border-slate-800 rounded-2xl shadow-xl space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2 text-cyan-400 font-bold text-xs uppercase tracking-wider">
              <Cpu className="w-4 h-4" />
              <span>Model Reliability & Confidence Index</span>
            </div>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-mono font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
              87.4% High Confidence
            </span>
          </div>

          <p className="text-xs text-slate-300 leading-relaxed">
            Prediction confidence is derived by fusing 4 distinct observational layers:
          </p>

          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="p-2.5 bg-slate-950 rounded-xl border border-slate-800 flex items-center space-x-2">
              <Radio className="w-4 h-4 text-cyan-400 shrink-0" />
              <div>
                <div className="font-bold text-white">14 AWS Stations</div>
                <div className="text-[10px] text-slate-400">5-min rain telemetry</div>
              </div>
            </div>

            <div className="p-2.5 bg-slate-950 rounded-xl border border-slate-800 flex items-center space-x-2">
              <Activity className="w-4 h-4 text-blue-400 shrink-0" />
              <div>
                <div className="font-bold text-white">Doppler S-Band</div>
                <div className="text-[10px] text-slate-400">IMD radar reflectivity</div>
              </div>
            </div>

            <div className="p-2.5 bg-slate-950 rounded-xl border border-slate-800 flex items-center space-x-2">
              <Database className="w-4 h-4 text-purple-400 shrink-0" />
              <div>
                <div className="font-bold text-white">CartoDEM 10m</div>
                <div className="text-[10px] text-slate-400">LiDAR slope & elevation</div>
              </div>
            </div>

            <div className="p-2.5 bg-slate-950 rounded-xl border border-slate-800 flex items-center space-x-2">
              <HardDrive className="w-4 h-4 text-amber-400 shrink-0" />
              <div>
                <div className="font-bold text-white">2015/23 Ground Truth</div>
                <div className="text-[10px] text-slate-400">Historical calibration</div>
              </div>
            </div>
          </div>
        </div>

        {/* Offline Cache Resilience Tester */}
        <div className="p-5 bg-slate-900 border border-slate-800 rounded-2xl shadow-xl space-y-3 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2 text-cyan-400 font-bold text-xs uppercase tracking-wider">
                <ShieldCheck className="w-4 h-4" />
                <span>Offline-Resilient Alert Fallback</span>
              </div>
              <button
                onClick={onToggleOffline}
                className={`px-3 py-1 rounded-xl text-xs font-bold flex items-center space-x-1.5 transition-all ${
                  isOfflineSimulated
                    ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/30'
                    : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700'
                }`}
              >
                {isOfflineSimulated ? <WifiOff className="w-3.5 h-3.5" /> : <Wifi className="w-3.5 h-3.5" />}
                <span>{isOfflineSimulated ? 'Simulating Offline Mode' : 'Test Network Drop'}</span>
              </button>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed mt-2">
              In severe deluges, cellular towers lose grid power. JalRakshak stores last-known micro-catchment water ingress curves into local browser storage.
            </p>
          </div>

          <div className={`p-3 rounded-xl border text-xs flex items-center space-x-2.5 ${
            isOfflineSimulated
              ? 'bg-amber-950/40 border-amber-500/50 text-amber-200'
              : 'bg-slate-950 border-slate-800 text-slate-400'
          }`}>
            <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${isOfflineSimulated ? 'bg-amber-400 animate-ping' : 'bg-emerald-400'}`} />
            <div>
              <strong className="text-white">
                {isOfflineSimulated ? 'OFFLINE CACHE ACTIVE (Cached 8 mins ago)' : 'ONLINE STREAM CONNECTED'}
              </strong>
              <div className="text-[11px] text-slate-400 mt-0.5">
                {isOfflineSimulated
                  ? 'Predictive evacuation tiers remain fully active and actionable without internet.'
                  : 'Real-time 5-minute AWS polling active.'}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Recharts Timeline Graphs */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 md:p-6 shadow-xl space-y-6">
        <div>
          <div className="flex items-center space-x-2 text-cyan-400 font-bold text-xs uppercase tracking-wider">
            <Activity className="w-4 h-4" />
            <span>Multi-Variable Historical vs Forecast Progression</span>
          </div>
          <h3 className="text-lg md:text-xl font-bold text-white mt-1">
            Rainfall Inflow (mm/hr) vs. Inundation Depth (cm) vs. Risk Score (0-100)
          </h3>
          <p className="text-slate-400 text-xs mt-0.5">
            Observing how cumulative precipitation drives non-linear runoff surges once drainage thresholds are breached.
          </p>
        </div>

        {/* Chart 1: Rainfall vs Inundation Depth */}
        <div className="h-72 w-full pt-2">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={HYDROLOGICAL_TIMELINE_DATA}>
              <defs>
                <linearGradient id="rainGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.4}/>
                  <stop offset="95%" stopColor="#06b6d4" stopOpacity={0}/>
                </linearGradient>
                <linearGradient id="depthGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#f43f5e" stopOpacity={0.4}/>
                  <stop offset="95%" stopColor="#f43f5e" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.5} />
              <XAxis dataKey="hour" stroke="#94a3b8" fontSize={11} />
              <YAxis stroke="#94a3b8" fontSize={11} />
              <Tooltip
                contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '0.75rem', fontSize: '12px' }}
                itemStyle={{ color: '#e2e8f0' }}
              />
              <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }} />
              <Area type="monotone" dataKey="rainfallMmHr" name="Rainfall (mm/hr)" stroke="#06b6d4" fillOpacity={1} fill="url(#rainGradient)" strokeWidth={2} />
              <Area type="monotone" dataKey="avgInundationCm" name="Avg Inundation (cm)" stroke="#f43f5e" fillOpacity={1} fill="url(#depthGradient)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Chart 2: Risk Index & Drainage Flow Saturation */}
        <div className="h-64 w-full pt-2 border-t border-slate-800">
          <div className="text-xs font-semibold text-slate-300 mb-2">
            City-Wide Risk Index (0-100) & Drainage Capacity Saturation (%)
          </div>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={HYDROLOGICAL_TIMELINE_DATA}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.5} />
              <XAxis dataKey="hour" stroke="#94a3b8" fontSize={11} />
              <YAxis stroke="#94a3b8" fontSize={11} domain={[0, 100]} />
              <Tooltip
                contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '0.75rem', fontSize: '12px' }}
                itemStyle={{ color: '#e2e8f0' }}
              />
              <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }} />
              <Line type="monotone" dataKey="riskScore" name="Risk Score (0-100)" stroke="#eab308" strokeWidth={3} dot={{ r: 4 }} />
              <Line type="monotone" dataKey="drainFlowPercentage" name="Drain Capacity Used (%)" stroke="#a855f7" strokeWidth={2} strokeDasharray="5 5" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
};
