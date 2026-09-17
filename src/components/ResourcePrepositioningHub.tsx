import React, { useState } from 'react';
import { CityData, ZoneData, ResourcePrepositioning, SimulationParams } from '../types';
import { RESOURCE_PREPOSITIONS } from '../data/mockData';
import { ShieldAlert, Zap, Truck, Users, Send, CheckCircle2, AlertTriangle, LifeBuoy, MapPin, Sparkles, TrendingUp } from 'lucide-react';

interface Props {
  city: CityData;
  zones: ZoneData[];
  simulationParams: SimulationParams;
  onDispatchResource: (resourceId: string) => void;
}

export const ResourcePrepositioningHub: React.FC<Props> = ({
  city,
  zones,
  simulationParams,
}) => {
  const [resources, setResources] = useState<ResourcePrepositioning[]>(RESOURCE_PREPOSITIONS);
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
      <div className="p-5 md:p-6 bg-slate-900 border border-slate-800 rounded-2xl shadow-xl space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between pb-4 border-b border-slate-800 gap-3">
          <div>
            <div className="flex items-center space-x-2 text-cyan-400 font-bold text-xs uppercase tracking-wider">
              <ShieldAlert className="w-4 h-4" />
              <span>Disaster Response Resource Optimization</span>
            </div>
            <h2 className="text-xl md:text-2xl font-bold text-white mt-1">
              Municipal & NDRF Tactical Pre-Positioning Command
            </h2>
            <p className="text-slate-400 text-xs md:text-sm mt-0.5">
              Algorithmically positions heavy dewatering pumps, NDRF rescue dinghies, mobile gensets, and relief trucks hours before floodwaters peak.
            </p>
          </div>

          <div className="flex items-center space-x-2">
            <span className="px-3 py-1.5 rounded-xl bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 text-xs font-mono font-bold">
              {dispatchedList.length} of {resources.length} Squads Active
            </span>
          </div>
        </div>

        {/* Tactical Metric Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="p-3.5 bg-slate-950 border border-slate-800 rounded-xl">
            <div className="text-[11px] text-slate-400">Total Population at Risk</div>
            <div className="text-xl font-mono font-bold text-rose-400 mt-1">
              {totalImpactedPop.toLocaleString()} <span className="text-xs text-slate-400">citizens</span>
            </div>
            <div className="text-[10px] text-slate-500 mt-0.5">In &gt;30cm inundation zones</div>
          </div>

          <div className="p-3.5 bg-slate-950 border border-slate-800 rounded-xl">
            <div className="text-[11px] text-slate-400">Dewatering Pumps Deployed</div>
            <div className="text-xl font-mono font-bold text-cyan-400 mt-1">
              {totalDewateringPumpsNeeded} <span className="text-xs text-slate-400">Pumps (100 HP)</span>
            </div>
            <div className="text-[10px] text-slate-500 mt-0.5">Siphoning 12,000 LPS</div>
          </div>

          <div className="p-3.5 bg-slate-950 border border-slate-800 rounded-xl">
            <div className="text-[11px] text-slate-400">NDRF / SDRF Dinghy Squads</div>
            <div className="text-xl font-mono font-bold text-amber-400 mt-1">
              {totalRescueBoatsNeeded} <span className="text-xs text-slate-400">Boat Units</span>
            </div>
            <div className="text-[10px] text-slate-500 mt-0.5">Pre-staged at low bridges</div>
          </div>

          <div className="p-3.5 bg-slate-950 border border-slate-800 rounded-xl">
            <div className="text-[11px] text-slate-400">Critical Catchments</div>
            <div className="text-xl font-mono font-bold text-indigo-400 mt-1">
              {criticalZones.length} of {zones.length} <span className="text-xs text-slate-400">Wards</span>
            </div>
            <div className="text-[10px] text-slate-500 mt-0.5">Evacuation directives issued</div>
          </div>
        </div>
      </div>

      {/* Resource Inventory & Tactical Deployment Cards */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 md:p-6 shadow-xl space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-slate-800 gap-3">
          <div className="flex items-center space-x-2">
            <span className="text-xs font-bold text-white uppercase tracking-wider">
              Priority Asset Staging Recommendations
            </span>
          </div>

          {/* Filter Pills */}
          <div className="flex items-center space-x-1 bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs">
            <button
              onClick={() => setFilterType('all')}
              className={`px-2.5 py-1 rounded-lg font-medium transition-all ${
                filterType === 'all' ? 'bg-cyan-500 text-slate-950 font-bold' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              All Assets
            </button>
            <button
              onClick={() => setFilterType('dewatering_pump')}
              className={`px-2.5 py-1 rounded-lg font-medium transition-all ${
                filterType === 'dewatering_pump' ? 'bg-cyan-500 text-slate-950 font-bold' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Pumps
            </button>
            <button
              onClick={() => setFilterType('ndrf_boat_unit')}
              className={`px-2.5 py-1 rounded-lg font-medium transition-all ${
                filterType === 'ndrf_boat_unit' ? 'bg-cyan-500 text-slate-950 font-bold' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Boats
            </button>
            <button
              onClick={() => setFilterType('mobile_power_generator')}
              className={`px-2.5 py-1 rounded-lg font-medium transition-all ${
                filterType === 'mobile_power_generator' ? 'bg-cyan-500 text-slate-950 font-bold' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Power
            </button>
            <button
              onClick={() => setFilterType('food_relief_truck')}
              className={`px-2.5 py-1 rounded-lg font-medium transition-all ${
                filterType === 'food_relief_truck' ? 'bg-cyan-500 text-slate-950 font-bold' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Rations
            </button>
          </div>
        </div>

        {/* Resource List */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filtered.map((res) => {
            const isDispatched = dispatchedList.includes(res.type + res.id) || dispatchedList.includes(res.id);

            return (
              <div
                key={res.id}
                className={`p-4 rounded-xl border transition-all space-y-3 ${
                  isDispatched
                    ? 'bg-slate-950 border-emerald-500/50 ring-1 ring-emerald-500/20'
                    : 'bg-slate-950/80 border-slate-800 hover:border-slate-700'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center space-x-2">
                    <div className={`p-2 rounded-lg ${
                      res.type === 'dewatering_pump' ? 'bg-cyan-500/20 text-cyan-300' :
                      res.type === 'ndrf_boat_unit' ? 'bg-amber-500/20 text-amber-300' :
                      res.type === 'sdrf_rescue_team' ? 'bg-rose-500/20 text-rose-300' :
                      res.type === 'mobile_power_generator' ? 'bg-purple-500/20 text-purple-300' : 'bg-blue-500/20 text-blue-300'
                    }`}>
                      {res.type === 'dewatering_pump' ? <Zap className="w-4 h-4" /> :
                       res.type === 'ndrf_boat_unit' ? <LifeBuoy className="w-4 h-4" /> :
                       res.type === 'mobile_power_generator' ? <Zap className="w-4 h-4" /> : <Truck className="w-4 h-4" />}
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-white">{res.name}</h4>
                      <div className="flex items-center space-x-1.5 text-xs text-slate-400 mt-0.5">
                        <MapPin className="w-3.5 h-3.5 text-cyan-400" />
                        <span>{res.targetStreet}</span>
                      </div>
                    </div>
                  </div>

                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase shrink-0 ${
                    res.priority === 'CRITICAL' ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40' :
                    res.priority === 'HIGH' ? 'bg-orange-500/20 text-orange-300 border border-orange-500/40' : 'bg-blue-500/20 text-blue-300'
                  }`}>
                    {res.priority}
                  </span>
                </div>

                <p className="text-xs text-slate-300 leading-relaxed bg-slate-900/60 p-2.5 rounded-lg border border-slate-800">
                  <strong className="text-slate-200">Hydraulic Trigger:</strong> {res.reason}
                </p>

                <div className="flex items-center justify-between pt-1 text-xs">
                  <div className="text-slate-400">
                    Recommended Staging: <strong className="text-cyan-300">{res.recommendedUnits} Units</strong>
                  </div>

                  <button
                    onClick={() => handleToggleDispatch(res.id)}
                    className={`px-3 py-1.5 rounded-xl font-bold text-xs flex items-center space-x-1.5 transition-all ${
                      isDispatched
                        ? 'bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/20 font-bold'
                        : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700'
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
