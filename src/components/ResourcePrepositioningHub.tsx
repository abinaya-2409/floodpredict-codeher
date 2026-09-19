import React, { useState } from 'react';
import { CityData, ZoneData, ResourcePrepositioning, SimulationParams } from '../types';
import { ShieldAlert, Zap, Truck, Users, Send, CheckCircle2, AlertTriangle, LifeBuoy, MapPin, Sparkles, TrendingUp } from 'lucide-react';

const ASSET_FILTERS: { id: string; label: string }[] = [
  { id: 'all', label: 'All assets' },
  { id: 'dewatering_pump', label: 'Pumps' },
  { id: 'ndrf_boat_unit', label: 'Boats' },
  { id: 'mobile_power_generator', label: 'Power' },
  { id: 'food_relief_truck', label: 'Rations' },
];

interface Props {
  city: CityData;
  zones: ZoneData[];
  simulationParams: SimulationParams;
  /** Derived from the risk index in App, not authored by hand. */
  resources: ResourcePrepositioning[];
  onDispatchResource: (resourceId: string) => void;
}

export const ResourcePrepositioningHub: React.FC<Props> = ({
  city,
  zones,
  simulationParams,
  resources,
}) => {
  const [dispatchedList, setDispatchedList] = useState<string[]>(['res-2', 'res-5']);
  const [filterType, setFilterType] = useState<string>('all');

  const handleToggleDispatch = (id: string) => {
    if (dispatchedList.includes(id)) {
      setDispatchedList(dispatchedList.filter(item => item !== id));
    } else {
      setDispatchedList([...dispatchedList, id]);
    }
  };

  const filtered = filterType === 'all'
    ? resources
    : resources.filter(r => r.type === filterType);

  // Dynamic calculations for City-Wide Summary
  const criticalZones = zones.filter(z => z.predictedInundationDepthCm >= 45);
  const totalImpactedPop = zones
    .filter(z => z.predictedInundationDepthCm >= 30)
    .reduce((acc, z) => acc + z.population, 0);

  const totalDewateringPumpsNeeded = zones.reduce((acc, z) => {
    if (z.predictedInundationDepthCm > 50) return acc + 6;
    if (z.predictedInundationDepthCm > 30) return acc + 3;
    return acc + 1;
  }, 0);

  const totalRescueBoatsNeeded = zones
    .filter(z => z.predictedInundationDepthCm >= 50)
    .reduce((acc, z) => acc + Math.ceil(z.population / 40000), 0);

  return (
    <div className="space-y-6" id="resource-prepositioning-hub">
      {/* City-Wide Summary Dashboard Header */}
      <div className="p-5 md:p-6 bg-surface border border-line rounded-card shadow-xl space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between pb-4 border-b border-line gap-3">
          <div>
            <div className="flex items-center space-x-2 text-accent font-bold text-xs uppercase tracking-wider">
              <ShieldAlert className="w-4 h-4" />
              <span>Disaster Response Resource Optimization</span>
            </div>
            <h2 className="text-xl md:text-2xl font-bold text-fg mt-1">
              Municipal & NDRF Tactical Pre-Positioning Command
            </h2>
            <p className="text-muted text-xs md:text-sm mt-0.5">
              Algorithmically positions heavy dewatering pumps, NDRF rescue dinghies, mobile gensets, and relief trucks hours before floodwaters peak.
            </p>
          </div>

          <div className="flex items-center space-x-2">
            <span className="px-3 py-1.5 rounded-card bg-accent/20 text-accent-soft border border-accent/30 text-xs font-mono font-bold">
              {dispatchedList.length} of {resources.length} Squads Active
            </span>
          </div>
        </div>

        {/* Tactical Metric Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="p-3.5 bg-bg border border-line rounded-card">
            <div className="text-mini text-muted">Total Population at Risk</div>
            <div className="text-xl font-mono font-bold text-risk-critical-ink mt-1">
              {totalImpactedPop.toLocaleString()} <span className="text-xs text-muted">citizens</span>
            </div>
            <div className="text-micro text-subtle mt-0.5">In &gt;30cm inundation zones</div>
          </div>

          <div className="p-3.5 bg-bg border border-line rounded-card">
            <div className="text-mini text-muted">Dewatering Pumps Deployed</div>
            <div className="text-xl font-mono font-bold text-accent mt-1">
              {totalDewateringPumpsNeeded} <span className="text-xs text-muted">Pumps (100 HP)</span>
            </div>
            <div className="text-micro text-subtle mt-0.5">Siphoning 12,000 LPS</div>
          </div>

          <div className="p-3.5 bg-bg border border-line rounded-card">
            <div className="text-mini text-muted">NDRF / SDRF Dinghy Squads</div>
            <div className="text-xl font-mono font-bold text-risk-high-ink mt-1">
              {totalRescueBoatsNeeded} <span className="text-xs text-muted">Boat Units</span>
            </div>
            <div className="text-micro text-subtle mt-0.5">Pre-staged at low bridges</div>
          </div>

          <div className="p-3.5 bg-bg border border-line rounded-card">
            <div className="text-mini text-muted">Critical Catchments</div>
            <div className="text-xl font-mono font-bold text-accent-2 mt-1">
              {criticalZones.length} of {zones.length} <span className="text-xs text-muted">Wards</span>
            </div>
            <div className="text-micro text-subtle mt-0.5">Evacuation directives issued</div>
          </div>
        </div>
      </div>

      {/* Resource Inventory & Tactical Deployment Cards */}
      <div className="bg-surface border border-line rounded-card p-5 md:p-6 shadow-xl space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-line gap-3">
          <div className="flex items-center space-x-2">
            <span className="text-xs font-bold text-fg uppercase tracking-wider">
              Priority Asset Staging Recommendations
            </span>
          </div>

          {/* Asset filter. Five duplicated buttons collapsed to one map, with
              radiogroup semantics so the active filter is announced. */}
          <div
            role="radiogroup"
            aria-label="Filter by asset type"
            className="flex items-center gap-1 rounded-card border border-line bg-bg p-1 text-xs"
          >
            {ASSET_FILTERS.map((f) => {
              const active = filterType === f.id;
              return (
                <button
                  key={f.id}
                  role="radio"
                  aria-checked={active}
                  onClick={() => setFilterType(f.id)}
                  className={`rounded-control px-2.5 py-1 font-medium transition-colors cursor-pointer ${
                    active
                      ? 'bg-accent font-bold text-on-accent'
                      : 'text-muted hover:bg-surface-2 hover:text-fg-soft'
                  }`}
                >
                  {f.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Resource List */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filtered.map((res) => {
            const isDispatched = dispatchedList.includes(res.type + res.id) || dispatchedList.includes(res.id);

            return (
              <div
                key={res.id}
                className={`p-4 rounded-card border transition-colors space-y-3 ${
                  isDispatched
                    ? 'bg-bg border-risk-low/50 ring-1 ring-risk-low/20'
                    : 'bg-bg/80 border-line hover:border-line-strong'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center space-x-2">
                    <div className={`p-2 rounded-control ${
                      res.type === 'dewatering_pump' ? 'bg-accent/20 text-accent-soft' :
                      res.type === 'ndrf_boat_unit' ? 'bg-risk-high/20 text-risk-high-ink' :
                      res.type === 'sdrf_rescue_team' ? 'bg-risk-critical/20 text-risk-critical-ink' :
                      res.type === 'mobile_power_generator' ? 'bg-accent-2/20 text-accent-2' : 'bg-accent/20 text-accent-soft'
                    }`}>
                      {res.type === 'dewatering_pump' ? <Zap className="w-4 h-4" /> :
                       res.type === 'ndrf_boat_unit' ? <LifeBuoy className="w-4 h-4" /> :
                       res.type === 'mobile_power_generator' ? <Zap className="w-4 h-4" /> : <Truck className="w-4 h-4" />}
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-fg">{res.name}</h4>
                      <div className="flex items-center space-x-1.5 text-xs text-muted mt-0.5">
                        <MapPin className="w-3.5 h-3.5 text-accent" />
                        <span>{res.targetStreet}</span>
                      </div>
                    </div>
                  </div>

                  <span className={`px-2 py-0.5 rounded text-micro font-bold uppercase shrink-0 ${
                    res.priority === 'CRITICAL' ? 'bg-risk-critical/20 text-risk-critical-ink border border-risk-critical/40' :
                    res.priority === 'HIGH' ? 'bg-risk-severe/20 text-risk-severe-ink border border-risk-severe/40' : 'bg-accent/20 text-accent-soft'
                  }`}>
                    {res.priority}
                  </span>
                </div>

                <p className="text-xs text-fg-soft leading-relaxed bg-surface/60 p-2.5 rounded-control border border-line">
                  <strong className="text-fg-soft">Hydraulic Trigger:</strong> {res.reason}
                </p>

                <div className="flex items-center justify-between pt-1 text-xs">
                  <div className="text-muted">
                    Recommended Staging: <strong className="text-accent-soft">{res.recommendedUnits} Units</strong>
                  </div>

                  <button
                    onClick={() => handleToggleDispatch(res.id)}
                    className={`px-3 py-1.5 rounded-card font-bold text-xs flex items-center space-x-1.5 transition-colors ${
                      isDispatched
                        ? 'bg-risk-low text-on-accent shadow-md shadow-risk-low/20 font-bold'
                        : 'bg-surface-2 hover:bg-surface-3 text-fg-soft border border-line-strong'
                    }`}
                  >
                    {isDispatched ? (
                      <>
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Squad Operational</span>
                      </>
                    ) : (
                      <>
                        <Send className="w-3.5 h-3.5" />
                        <span>Dispatch Squad</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
