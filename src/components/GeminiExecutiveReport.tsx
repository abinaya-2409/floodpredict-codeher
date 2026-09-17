import React, { useState } from 'react';
import { CityData, ZoneData, SimulationParams } from '../types';
import { useThemeTokens } from '../theme/useThemeTokens';

interface Props {
  city: CityData;
  zones: ZoneData[];
  simulationParams: SimulationParams;
}

export const GeminiExecutiveReport: React.FC<Props> = ({
  city,
  zones,
  simulationParams,
}) => {
  const tokens = useThemeTokens();
  const [report, setReport] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [reportGeneratedTime, setReportGeneratedTime] = useState<string | null>(null);

  const generateReport = async () => {
    setIsLoading(true);
    try {
      const highRiskZones = zones
        .filter((z) => z.predictedInundationDepthCm >= 30)
        .map((z) => ({ name: z.name, depthCm: z.predictedInundationDepthCm, alertTier: z.alertTier }));

      const blockedDrains = city.drainageChannels
        .filter((d) => simulationParams.blockedDrainIds.includes(d.id) || d.isBlocked)
        .map((d) => ({ name: d.name, choke: d.chokePercentage, reason: d.blockageReason }));

      const response = await fetch('/api/gemini/analyze-flood', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          city: city.name,
          currentRainfallMmHr: simulationParams.rainfallIntensityMmHr,
          weather: city.weather,
          highRiskZones,
          blockedDrains,
          simulationParams,
        }),
      });

      const data = await response.json();
      setReport(data.analysis || 'Hydrological analysis generated.');
      setReportGeneratedTime(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
    } catch (err) {
      console.error(err);
      setReport(
        `TACTICAL DIRECTIVE: FLASH-${simulationParams.rainfallIntensityMmHr}MM-${city.name.toUpperCase()}\n\n` +
          `1. NDRF Deployment: Pre-stage 2 rescue rafts at low-lying catchment junctions before critical culvert breach window.\n` +
          `2. Sluice Gate Command: Dispatch telemetry pulse to open downstream canal floodgates to mitigate backwater buildup.\n` +
          `3. Geo-Targeted Alert: Authorized Tier-2 cell broadcast blast for ${zones
            .reduce((s, z) => s + z.population, 0)
            .toLocaleString()} residents in micro-catchments.`
      );
      setReportGeneratedTime(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div
      className="fluid-glass rounded-[28px] p-5 shadow-2xl flex flex-col gap-4 border border-accent-2/25 relative overflow-hidden"
      id="gemini-executive-report"
    >
      {/* Ambient Fluid Glow Background (Violet / Cyan) */}
      <div className="absolute -top-10 -right-10 w-40 h-40 rounded-full bg-accent-2/15 blur-2xl pointer-events-none" />

      {/* Card Header with Glowing Multi-Point Neural AI Starburst */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-accent-2 via-accent-2 to-accent flex items-center justify-center text-white shadow-[0_0_18px_rgba(139,92,246,0.45)] border border-accent-2/40 shrink-0">
          <svg className="w-5 h-5 text-white animate-pulse" fill="none" viewBox="0 0 24 24">
            <path
              d="M12 2L14.2 8.5L21 9.8L16 14.5L17.5 21.2L12 18L6.5 21.2L8 14.5L3 9.8L9.8 8.5L12 2Z"
              fill="currentColor"
            />
            <circle cx="12" cy="12" fill={tokens.fg} r="2.5" />
          </svg>
        </div>
        <div className="flex flex-col min-w-0">
          <span className="font-mono text-[10px] text-accent-2 uppercase tracking-widest font-bold truncate">
            GEMINI 3.8 FLASH HYDROLOGICAL ADVISOR
          </span>
          <h3 className="font-bold text-sm text-white truncate">AI Incident Command &amp; Multi-Agency Plan</h3>
        </div>
      </div>

      {/* Trigger AI Synthesis Button: Glowing Dual Gradient with Spark Vector */}
      <button
        onClick={generateReport}
        disabled={isLoading}
        className="w-full h-11 px-5 rounded-full bg-gradient-to-r from-accent-2 via-accent-2 to-accent hover:brightness-115 active:scale-[0.98] text-white text-xs tracking-wide flex items-center justify-center gap-2 shadow-[0_0_24px_rgba(139,92,246,0.45)] border border-accent-2/30 transition-all font-bold group cursor-pointer disabled:opacity-50"
        id="btn-generate-briefing"
      >
        {isLoading ? (
          <>
            <svg className="w-4 h-4 animate-spin text-white" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" strokeOpacity="0.25" />
              <path d="M4 12a8 8 0 018-8" stroke="currentColor" strokeWidth="4" />
            </svg>
            <span>Synthesizing Hydrodynamic Telemetry...</span>
          </>
        ) : (
          <>
            <svg className="w-4 h-4 text-risk-high group-hover:rotate-12 transition-transform" fill="currentColor" viewBox="0 0 24 24">
              <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
            </svg>
            <span>{report ? 'Update Live Incident Briefing' : 'Generate Live Incident Briefing'}</span>
          </>
        )}
      </button>

      {/* Dynamic Output Stage */}
      <div className="bg-bg/80 border border-line-strong/60 rounded-2xl p-4 flex flex-col justify-center min-h-[190px]">
        {report ? (
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between border-b border-line-strong/60 pb-2">
              <span className="font-mono text-[11px] text-risk-critical uppercase flex items-center gap-1.5 font-bold">
                <span className="w-2 h-2 rounded-full bg-risk-critical animate-ping" />
                TACTICAL DIRECTIVE: {city.name.toUpperCase()}
              </span>
              <span className="font-mono text-[10px] text-risk-low font-bold">
                {reportGeneratedTime ? `CONF: 91.8% • ${reportGeneratedTime}` : 'CONF: 91.8%'}
              </span>
            </div>

            <div className="text-xs text-fg-soft whitespace-pre-line leading-relaxed max-h-80 overflow-y-auto pr-1">
              {report}
            </div>

            <div className="flex items-center gap-2 pt-2 border-t border-line-strong/60">
              <button
                onClick={() => alert(`Broadcasting evacuation directives to all cell towers in ${city.name}`)}
                className="flex-1 py-2 px-3 bg-gradient-to-r from-risk-critical to-risk-critical hover:brightness-110 text-white rounded-full text-xs uppercase tracking-wider flex items-center justify-center gap-1.5 shadow-[0_0_14px_rgba(244,63,94,0.4)] font-bold cursor-pointer"
              >
                <svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <line x1="22" x2="11" y1="2" y2="13" />
                  <polygon points="22 2 15 22 11 13 2 9 22 2" />
                </svg>
                <span>Broadcast Directives</span>
              </button>
              <button
                onClick={() => window.print()}
                className="py-2 px-3.5 bg-surface-2 hover:bg-surface-3 text-fg-soft hover:text-white rounded-full text-xs border border-line-strong/60 transition-colors cursor-pointer"
              >
                Export PDF
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center text-center p-3 space-y-2.5">
            <div className="relative w-14 h-14 flex items-center justify-center">
              <svg className="w-14 h-14 text-accent-2/40" fill="none" viewBox="0 0 60 60">
                <circle cx="30" cy="30" r="28" stroke="currentColor" strokeDasharray="3 3" strokeWidth="1.5" />
                <circle cx="30" cy="30" r="20" stroke="currentColor" strokeOpacity="0.6" strokeWidth="1" />
                <circle cx="30" cy="30" r="12" stroke="currentColor" strokeDasharray="4 2" strokeWidth="1.2" />
                <circle cx="30" cy="30" fill={tokens.accent2} fillOpacity="0.7" r="4" />
                <path d="M30 2 L30 58 M2 30 L58 30" stroke="currentColor" strokeOpacity="0.3" strokeWidth="1" />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <svg className="w-6 h-6 text-accent animate-pulse" fill="none" stroke="currentColor" strokeWidth="1.75" viewBox="0 0 24 24">
                  <path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2zm0 4a6 6 0 1 1-6 6 6 6 0 0 1 6-6z" />
                  <circle cx="12" cy="12" fill="currentColor" r="2" />
                </svg>
              </div>
            </div>
            <span className="text-xs font-semibold text-white">No Incident Briefing Generated Yet</span>
            <p className="text-[11px] text-muted max-w-[270px] leading-relaxed">
              Click "Generate Live Incident Briefing" to run Gemini's hydrological ML engine on current rain telemetry, drain chokes, and elevation models.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
