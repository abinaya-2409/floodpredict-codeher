import React, { useState } from 'react';
import { CityData, ZoneData, SimulationParams, RiskLevel } from '../types';
import { Layers, Activity, AlertTriangle, Eye, Shield, Waves, Zap, Droplets, MapPin, Gauge } from 'lucide-react';

interface Props {
  city: CityData;
  zones: ZoneData[];
  selectedZone: ZoneData | null;
  onSelectZone: (zone: ZoneData) => void;
  simulationParams: SimulationParams;
  onToggleDrainBlockage: (drainId: string) => void;
  onTogglePumpingStation: (drainId: string) => void;
}

export const HydrologicalMap: React.FC<Props> = ({
  city,
  zones,
  selectedZone,
  onSelectZone,
  simulationParams,
  onToggleDrainBlockage,
  onTogglePumpingStation
}) => {
  const [showRadarOverlay, setShowRadarOverlay] = useState(true);
  const [showDrainageLines, setShowDrainageLines] = useState(true);
  const [showElevationContours, setShowElevationContours] = useState(true);
  const [showPumps, setShowPumps] = useState(true);
  const [hoveredZone, setHoveredZone] = useState<ZoneData | null>(null);

  const getRiskColor = (risk: RiskLevel, alpha = 0.6) => {
    switch (risk) {
      case 'critical': return `rgba(225, 29, 72, ${alpha})`; // rose-600
      case 'severe': return `rgba(239, 68, 68, ${alpha})`; // red-500
      case 'high': return `rgba(249, 115, 22, ${alpha})`; // orange-500
      case 'moderate': return `rgba(234, 179, 8, ${alpha})`; // yellow-500
      case 'low': return `rgba(16, 185, 129, ${alpha})`; // emerald-500
      default: return `rgba(71, 85, 105, ${alpha})`;
    }
  };

  const getRiskBorderColor = (risk: RiskLevel) => {
    switch (risk) {
      case 'critical': return '#f43f5e';
      case 'severe': return '#ef4444';
      case 'high': return '#f97316';
      case 'moderate': return '#eab308';
      case 'low': return '#10b981';
      default: return '#64748b';
    }
  };

  return (
    <div className="fluid-glass rounded-[32px] overflow-hidden relative shadow-[0_24px_50px_rgba(0,0,0,0.65)] border border-cyan-500/25 flex flex-col h-full" id="hydrological-map-card">
      {/* Map Control Toolbar */}
      <div className="p-4 bg-slate-950/70 border-b border-slate-800/80 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center space-x-3">
          <div className="flex items-center space-x-2 text-cyan-400 font-bold text-sm">
            <Layers className="w-4 h-4" />
            <span>Interactive Hydrological Inundation Model</span>
          </div>
          <span className="hidden sm:inline-block px-2.5 py-0.5 rounded-full text-xs font-mono bg-cyan-950/80 border border-cyan-800/60 text-cyan-300">
            {city.name} Basin Grid (1:50000 Topo)
          </span>
        </div>

        {/* Layer Toggles */}
        <div className="flex items-center space-x-2 text-xs">
          <button
            onClick={() => setShowRadarOverlay(!showRadarOverlay)}
            className={`px-2.5 py-1 rounded-lg border transition-all flex items-center space-x-1.5 ${
              showRadarOverlay ? 'bg-cyan-500/20 border-cyan-500/60 text-cyan-300' : 'bg-slate-800/60 border-slate-700 text-slate-400'
            }`}
          >
            <Activity className="w-3.5 h-3.5" />
            <span>Doppler Radar</span>
          </button>
          
          <button
            onClick={() => setShowDrainageLines(!showDrainageLines)}
            className={`px-2.5 py-1 rounded-lg border transition-all flex items-center space-x-1.5 ${
              showDrainageLines ? 'bg-blue-500/20 border-blue-500/60 text-blue-300' : 'bg-slate-800/60 border-slate-700 text-slate-400'
            }`}
          >
            <Waves className="w-3.5 h-3.5" />
            <span>Canals & Drains</span>
          </button>

          <button
            onClick={() => setShowPumps(!showPumps)}
            className={`px-2.5 py-1 rounded-lg border transition-all flex items-center space-x-1.5 ${
              showPumps ? 'bg-emerald-500/20 border-emerald-500/60 text-emerald-300' : 'bg-slate-800/60 border-slate-700 text-slate-400'
            }`}
          >
            <Zap className="w-3.5 h-3.5" />
            <span>Pumps</span>
          </button>
        </div>
      </div>

      {/* Main SVG Vector Canvas */}
      <div className="relative flex-1 bg-slate-950 p-2 min-h-[420px] max-h-[560px] flex items-center justify-center overflow-hidden">
        {/* Radar Doppler Precipitation Animation Ring */}
        {showRadarOverlay && (
          <div className="absolute inset-0 pointer-events-none opacity-25 overflow-hidden">
            <div className="absolute -top-10 -left-10 w-[600px] h-[600px] rounded-full bg-gradient-to-tr from-cyan-500/20 via-blue-600/30 to-purple-600/10 blur-3xl animate-pulse"></div>
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 border border-cyan-500/20 rounded-full animate-ping opacity-20 duration-1000"></div>
          </div>
        )}

        <svg
          viewBox="0 0 420 420"
          className="w-full h-full max-h-[500px] select-none"
          style={{ filter: 'drop-shadow(0 4px 20px rgba(0,0,0,0.5))' }}
        >
          <defs>
            {/* Water Canal Pattern */}
            <linearGradient id="waterGradient" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#0284c7" stopOpacity="0.8" />
              <stop offset="100%" stopColor="#0369a1" stopOpacity="0.9" />
            </linearGradient>

            <linearGradient id="bayGradient" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#0c4a6e" stopOpacity="0.4" />
              <stop offset="100%" stopColor="#075985" stopOpacity="0.6" />
            </linearGradient>

            <pattern id="gridPattern" width="20" height="20" patternUnits="userSpaceOnUse">
              <path d="M 20 0 L 0 0 0 20" fill="none" stroke="#1e293b" strokeWidth="0.5" />
            </pattern>
          </defs>

          {/* Background Grid */}
          <rect width="420" height="420" fill="url(#gridPattern)" />

          {/* Coastal Water Body / Bay (Right side for Chennai, Left for Mumbai) */}
          {city.coastalCity && (
            <path
              d="M 370 0 Q 365 200 375 420 L 420 420 L 420 0 Z"
              fill="url(#bayGradient)"
              stroke="#0284c7"
              strokeWidth="1.5"
            />
          )}
          {city.coastalCity && (
            <text x="390" y="210" fill="#38bdf8" fontSize="9" fontWeight="700" transform="rotate(90 390 210)" textAnchor="middle" letterSpacing="2">
              BAY OF BENGAL / SEA OUTFALL
            </text>
          )}

          {/* Elevation Topo Contour Lines */}
          {showElevationContours && (
            <g opacity="0.3" stroke="#475569" strokeWidth="0.8" fill="none" strokeDasharray="3 3">
              <path d="M 30 100 Q 150 70 340 120" />
              <path d="M 20 220 Q 180 190 350 240" />
              <path d="M 40 330 Q 200 300 360 360" />
              <text x="35" y="95" fill="#64748b" fontSize="7">10m MSL Contour</text>
              <text x="25" y="215" fill="#64748b" fontSize="7">5m MSL Lowland</text>
              <text x="45" y="325" fill="#64748b" fontSize="7">3m MSL Depression</text>
            </g>
          )}

          {/* Major River Trunk Channels */}
          {showDrainageLines && (
            <g>
              {/* Adyar River Path */}
              <path
                d="M 30 290 C 120 280, 190 230, 270 190 C 310 170, 340 160, 375 160"
                fill="none"
                stroke="#38bdf8"
                strokeWidth="4.5"
                strokeLinecap="round"
                opacity="0.85"
              />
              <text x="110" y="275" fill="#bae6fd" fontSize="8" fontWeight="600">Adyar River</text>

              {/* Buckingham Canal (North-South Coastal Canal) */}
              <path
                d="M 350 10 Q 345 200 355 410"
                fill="none"
                stroke="#0284c7"
                strokeWidth="3.5"
                strokeDasharray="4 2"
                opacity="0.8"
              />
              <text x="330" y="80" fill="#7dd3fc" fontSize="7.5" fontWeight="600" transform="rotate(88 330 80)">Buckingham Canal</text>

              {/* Velachery Surplus Canal to Pallikaranai */}
              <path
                d="M 190 240 Q 230 260 270 300"
                fill="none"
                stroke={simulationParams.blockedDrainIds.includes('dc-2') ? '#ef4444' : '#0ea5e9'}
                strokeWidth="3"
                strokeDasharray={simulationParams.blockedDrainIds.includes('dc-2') ? '2 2' : 'none'}
              />
              <text x="235" y="275" fill={simulationParams.blockedDrainIds.includes('dc-2') ? '#fca5a5' : '#7dd3fc'} fontSize="7" fontWeight="bold">
                {simulationParams.blockedDrainIds.includes('dc-2') ? '⚠️ CHOKED SURPLUS' : 'Surplus Channel'}
              </text>
            </g>
          )}

          {/* Pallikaranai Marsh Wetland Area */}
          <ellipse cx="290" cy="320" rx="45" ry="30" fill="#042f2e" stroke="#0d9488" strokeWidth="1" strokeDasharray="3 2" opacity="0.7" />
          <text x="290" y="322" fill="#2dd4bf" fontSize="7" fontWeight="600" textAnchor="middle">Pallikaranai Wetland</text>

          {/* Zones Polygons */}
          {zones.map((zone) => {
            const isSelected = selectedZone?.id === zone.id;
            const isHovered = hoveredZone?.id === zone.id;
            const fillColor = getRiskColor(zone.currentRisk, isSelected ? 0.75 : 0.45);
            const borderColor = getRiskBorderColor(zone.currentRisk);

            return (
              <g
                key={zone.id}
                className="cursor-pointer transition-transform duration-200"
                onClick={() => onSelectZone(zone)}
                onMouseEnter={() => setHoveredZone(zone)}
                onMouseLeave={() => setHoveredZone(null)}
              >
                {/* Zone Area Polygon */}
                {zone.mapCoordinates.polygonPoints ? (
                  <polygon
                    points={zone.mapCoordinates.polygonPoints}
                    fill={fillColor}
                    stroke={borderColor}
                    strokeWidth={isSelected ? 3 : isHovered ? 2 : 1.2}
                    strokeDasharray={isSelected ? 'none' : 'none'}
                    className="transition-colors duration-300 hover:brightness-125"
                  />
                ) : (
                  <rect
                    x={zone.mapCoordinates.x}
                    y={zone.mapCoordinates.y}
                    width={zone.mapCoordinates.width}
                    height={zone.mapCoordinates.height}
                    rx="8"
                    fill={fillColor}
                    stroke={borderColor}
                    strokeWidth={isSelected ? 3 : isHovered ? 2 : 1.2}
                    className="transition-colors duration-300 hover:brightness-125"
                  />
                )}

                {/* Zone Label & Risk Depth Badge */}
                <g transform={`translate(${zone.mapCoordinates.x + (zone.mapCoordinates.width / 2)}, ${zone.mapCoordinates.y + (zone.mapCoordinates.height / 2)})`}>
                  {/* Risk Badge Background */}
                  <rect
                    x="-42"
                    y="-16"
                    width="84"
                    height="32"
                    rx="6"
                    fill="#0f172a"
                    stroke={borderColor}
                    strokeWidth="1.2"
                    opacity="0.92"
                  />
                  <text
                    x="0"
                    y="-4"
                    fill="#f8fafc"
                    fontSize="8.5"
                    fontWeight="700"
                    textAnchor="middle"
                  >
                    {zone.name.split(' ')[0]}
                  </text>
                  <text
                    x="0"
                    y="9"
                    fill={borderColor}
                    fontSize="8"
                    fontWeight="800"
                    fontFamily="monospace"
                    textAnchor="middle"
                  >
                    {zone.predictedInundationDepthCm} cm ({zone.alertTier.toUpperCase()})
                  </text>

                  {/* Severe Risk Pulse Dot */}
                  {(zone.currentRisk === 'critical' || zone.currentRisk === 'severe') && (
                    <circle cx="-34" cy="-8" r="3" fill="#f43f5e" className="animate-ping" />
                  )}
                </g>
              </g>
            );
          })}

          {/* Pumping Stations & Drain Checkpoints */}
          {showPumps && city.drainageChannels.map((drain, idx) => {
            const isBlocked = simulationParams.blockedDrainIds.includes(drain.id) || drain.isBlocked;
            const isPumpActive = simulationParams.activePumpingStations.includes(drain.id) || drain.pumpingStationActive;
            const posX = 100 + (idx * 48);
            const posY = 150 + (idx % 2 === 0 ? 40 : -30);

            return (
              <g
                key={drain.id}
                className="cursor-pointer"
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleDrainBlockage(drain.id);
                }}
                transform={`translate(${posX}, ${posY})`}
              >
                {/* Background pin */}
                <circle
                  cx="0"
                  cy="0"
                  r="10"
                  fill={isBlocked ? '#7f1d1d' : '#064e3b'}
                  stroke={isBlocked ? '#ef4444' : '#10b981'}
                  strokeWidth="1.5"
                />
                <text
                  x="0"
                  y="3"
                  fill="#ffffff"
                  fontSize="7"
                  fontWeight="bold"
                  textAnchor="middle"
                >
                  {isBlocked ? '✕' : '⚡'}
                </text>

                {/* Silt / Choke Indicator tag */}
                <rect x="-24" y="12" width="48" height="13" rx="3" fill="#020617" stroke={isBlocked ? '#ef4444' : '#10b981'} strokeWidth="0.8" opacity="0.9" />
                <text x="0" y="21" fill={isBlocked ? '#fca5a5' : '#a7f3d0'} fontSize="6.5" fontWeight="bold" textAnchor="middle">
                  {isBlocked ? 'CHOKED' : 'CLEAR'}
                </text>
              </g>
            );
          })}
        </svg>

        {/* Floating Map Legend */}
        <div className="absolute bottom-3 left-3 bg-slate-900/90 border border-slate-800 backdrop-blur-md rounded-xl p-2.5 text-xs text-slate-300 shadow-lg">
          <div className="text-[10px] font-mono text-slate-400 uppercase tracking-wider mb-1.5 font-bold">Flood Risk Classification</div>
          <div className="grid grid-cols-2 gap-x-3 gap-y-1">
            <div className="flex items-center space-x-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block"></span>
              <span className="text-[11px]">Low (&lt;15cm)</span>
            </div>
            <div className="flex items-center space-x-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-yellow-500 inline-block"></span>
              <span className="text-[11px]">Watch (15-30cm)</span>
            </div>
            <div className="flex items-center space-x-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-orange-500 inline-block"></span>
              <span className="text-[11px]">Warning (30-50cm)</span>
            </div>
            <div className="flex items-center space-x-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-rose-600 inline-block"></span>
              <span className="text-[11px]">Evacuate (&gt;50cm)</span>
            </div>
          </div>
        </div>
      </div>

      {/* Selected Zone Quick Telemetry Banner */}
      {selectedZone && (
        <div className="p-3 bg-slate-950 border-t border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center space-x-2">
            <div className="p-1.5 rounded-lg bg-cyan-500/10 text-cyan-400 border border-cyan-500/30">
              <MapPin className="w-4 h-4" />
            </div>
            <div>
              <span className="font-bold text-white text-sm">{selectedZone.name}</span>
              <span className="text-slate-400 ml-2">Wards: {selectedZone.wardNumbers.join(', ')}</span>
            </div>
          </div>

          <div className="flex items-center space-x-4">
            <div className="text-right">
              <div className="text-[10px] text-slate-400 uppercase">Est. Water Depth</div>
              <div className="font-mono font-bold text-cyan-300 text-sm">
                {selectedZone.predictedInundationDepthCm} cm
              </div>
            </div>
            <div className="text-right">
              <div className="text-[10px] text-slate-400 uppercase">Flooded Area</div>
              <div className="font-mono font-bold text-amber-300 text-sm">
                {selectedZone.predictedFloodedAreaPercent}%
              </div>
            </div>
            <div className="text-right">
              <div className="text-[10px] text-slate-400 uppercase">Action Tier</div>
              <span className={`px-2 py-0.5 rounded font-bold uppercase text-[10px] ${
                selectedZone.alertTier === 'evacuate' ? 'bg-rose-500 text-white' :
                selectedZone.alertTier === 'warning' ? 'bg-orange-500 text-white' :
                selectedZone.alertTier === 'watch' ? 'bg-yellow-500 text-slate-950' : 'bg-emerald-500 text-white'
              }`}>
                {selectedZone.alertTier}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
