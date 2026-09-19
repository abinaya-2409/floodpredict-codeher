import React from 'react';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, Legend, AreaChart, Area } from 'recharts';
import { HYDROLOGICAL_TIMELINE_DATA } from '../data/mockData';
import { CityData, WeatherForecast } from '../types';
import { Activity, CheckCircle, ShieldCheck, Database, Radio, Cpu, HardDrive, Wifi, WifiOff } from 'lucide-react';
import { useThemeTokens } from '../theme/useThemeTokens';

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
  const tokens = useThemeTokens();
  return (
    <div className="space-y-6" id="hydrological-timeline-view">
      {/* Offline Mode Banner & Model Confidence Header */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Model Confidence Card */}
        <div className="p-5 bg-surface border border-line rounded-card shadow-xl space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2 text-accent font-bold text-xs uppercase tracking-wider">
              <Cpu className="w-4 h-4" />
              <span>Model Reliability & Confidence Index</span>
            </div>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-mono font-bold bg-risk-low/20 text-risk-low-ink border border-risk-low/30">
              87.4% High Confidence
            </span>
          </div>

          <p className="text-xs text-fg-soft leading-relaxed">
            Prediction confidence is derived by fusing 4 distinct observational layers:
          </p>

          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="p-2.5 bg-bg rounded-card border border-line flex items-center space-x-2">
              <Radio className="w-4 h-4 text-accent shrink-0" />
              <div>
                <div className="font-bold text-fg">14 AWS Stations</div>
                <div className="text-micro text-muted">5-min rain telemetry</div>
              </div>
            </div>

            <div className="p-2.5 bg-bg rounded-card border border-line flex items-center space-x-2">
              <Activity className="w-4 h-4 text-accent shrink-0" />
              <div>
                <div className="font-bold text-fg">Doppler S-Band</div>
                <div className="text-micro text-muted">IMD radar reflectivity</div>
              </div>
            </div>

            <div className="p-2.5 bg-bg rounded-card border border-line flex items-center space-x-2">
              <Database className="w-4 h-4 text-accent-2 shrink-0" />
              <div>
                <div className="font-bold text-fg">CartoDEM 10m</div>
                <div className="text-micro text-muted">LiDAR slope & elevation</div>
              </div>
            </div>

            <div className="p-2.5 bg-bg rounded-card border border-line flex items-center space-x-2">
              <HardDrive className="w-4 h-4 text-risk-high-ink shrink-0" />
              <div>
                <div className="font-bold text-fg">2015/23 Ground Truth</div>
                <div className="text-micro text-muted">Historical calibration</div>
              </div>
            </div>
          </div>
        </div>

        {/* Offline Cache Resilience Tester */}
        <div className="p-5 bg-surface border border-line rounded-card shadow-xl space-y-3 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2 text-accent font-bold text-xs uppercase tracking-wider">
                <ShieldCheck className="w-4 h-4" />
                <span>Offline-Resilient Alert Fallback</span>
              </div>
              <button
                onClick={onToggleOffline}
                className={`px-3 py-1 rounded-card text-xs font-bold flex items-center space-x-1.5 transition-colors ${
                  isOfflineSimulated
                    ? 'bg-risk-high text-on-accent shadow-md shadow-risk-high/30'
                    : 'bg-surface-2 hover:bg-surface-3 text-fg-soft border border-line-strong'
                }`}
              >
                {isOfflineSimulated ? <WifiOff className="w-3.5 h-3.5" /> : <Wifi className="w-3.5 h-3.5" />}
                <span>{isOfflineSimulated ? 'Simulating Offline Mode' : 'Test Network Drop'}</span>
              </button>
            </div>

            <p className="text-xs text-fg-soft leading-relaxed mt-2">
              In severe deluges, cellular towers lose grid power. FloodyPredict stores last-known micro-catchment water ingress curves into local browser storage.
            </p>
          </div>

          <div className={`p-3 rounded-card border text-xs flex items-center space-x-2.5 ${
            isOfflineSimulated
              ? 'bg-risk-high/40 border-risk-high/50 text-risk-high-ink'
              : 'bg-bg border-line text-muted'
          }`}>
            <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${isOfflineSimulated ? 'bg-risk-high animate-ping' : 'bg-accent'}`} />
            <div>
              <strong className="text-fg">
                {isOfflineSimulated ? 'OFFLINE CACHE ACTIVE (Cached 8 mins ago)' : 'ONLINE STREAM CONNECTED'}
              </strong>
              <div className="text-mini text-muted mt-0.5">
                {isOfflineSimulated
                  ? 'Predictive evacuation tiers remain fully active and actionable without internet.'
                  : 'Real-time 5-minute AWS polling active.'}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Recharts Timeline Graphs */}
      <div className="bg-surface border border-line rounded-card p-5 md:p-6 shadow-xl space-y-6">
        <div>
          <div className="flex items-center space-x-2 text-accent font-bold text-xs uppercase tracking-wider">
            <Activity className="w-4 h-4" />
            <span>Multi-Variable Historical vs Forecast Progression</span>
          </div>
          <h3 className="text-lg md:text-xl font-bold text-fg mt-1">
            Rainfall Inflow (mm/hr) vs. Inundation Depth (cm) vs. Risk Score (0-100)
          </h3>
          <p className="text-muted text-xs mt-0.5">
            Observing how cumulative precipitation drives non-linear runoff surges once drainage thresholds are breached.
          </p>
        </div>

        {/* Chart 1: Rainfall vs Inundation Depth */}
        <div className="h-72 w-full pt-2">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={HYDROLOGICAL_TIMELINE_DATA}>
              <defs>
                <linearGradient id="rainGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={tokens.accent} stopOpacity={0.4}/>
                  <stop offset="95%" stopColor={tokens.accent} stopOpacity={0}/>
                </linearGradient>
                <linearGradient id="depthGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={tokens.risk.severe} stopOpacity={0.4}/>
                  <stop offset="95%" stopColor={tokens.risk.severe} stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke={tokens.line} opacity={0.5} />
              <XAxis dataKey="hour" stroke={tokens.muted} fontSize={11} />
              <YAxis stroke={tokens.muted} fontSize={11} />
              <Tooltip
                contentStyle={{ backgroundColor: tokens.surface, borderColor: tokens.line, borderRadius: '0.75rem', fontSize: '12px' }}
                itemStyle={{ color: '#e2e8f0' }}
              />
              <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }} />
              <Area type="monotone" dataKey="rainfallMmHr" name="Rainfall (mm/hr)" stroke={tokens.accent} fillOpacity={1} fill="url(#rainGradient)" strokeWidth={2} />
              <Area type="monotone" dataKey="avgInundationCm" name="Avg Inundation (cm)" stroke={tokens.risk.severe} fillOpacity={1} fill="url(#depthGradient)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Chart 2: Risk Index & Drainage Flow Saturation */}
        <div className="h-64 w-full pt-2 border-t border-line">
          <div className="text-xs font-semibold text-fg-soft mb-2">
            City-Wide Risk Index (0-100) & Drainage Capacity Saturation (%)
          </div>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={HYDROLOGICAL_TIMELINE_DATA}>
              <CartesianGrid strokeDasharray="3 3" stroke={tokens.line} opacity={0.5} />
              <XAxis dataKey="hour" stroke={tokens.muted} fontSize={11} />
              <YAxis stroke={tokens.muted} fontSize={11} domain={[0, 100]} />
              <Tooltip
                contentStyle={{ backgroundColor: tokens.surface, borderColor: tokens.line, borderRadius: '0.75rem', fontSize: '12px' }}
                itemStyle={{ color: '#e2e8f0' }}
              />
              <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }} />
              <Line type="monotone" dataKey="riskScore" name="Risk Score (0-100)" stroke={tokens.risk.high} strokeWidth={3} dot={{ r: 4 }} />
              <Line type="monotone" dataKey="drainFlowPercentage" name="Drain Capacity Used (%)" stroke="#a855f7" strokeWidth={2} strokeDasharray="5 5" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
};
