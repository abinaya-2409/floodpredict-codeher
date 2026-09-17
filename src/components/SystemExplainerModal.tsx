import React from 'react';
import { X, CloudRain, Waves, ShieldAlert, Cpu, ArrowRight, CheckCircle2, History, AlertTriangle } from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export const SystemExplainerModal: React.FC<Props> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-200">
      <div 
        className="relative w-full max-w-4xl max-h-[90vh] overflow-y-auto bg-slate-900 border border-cyan-500/30 rounded-2xl shadow-2xl shadow-cyan-950/50 p-6 md:p-8 text-slate-200"
        id="system-explainer-modal"
      >
        <button
          onClick={onClose}
          className="absolute top-5 right-5 p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          aria-label="Close modal"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Title Header */}
        <div className="flex items-center space-x-3 mb-6">
          <div className="p-3 bg-cyan-500/10 border border-cyan-500/30 rounded-xl text-cyan-400">
            <Cpu className="w-6 h-6" />
          </div>
          <div>
            <div className="text-xs font-mono uppercase tracking-widest text-cyan-400">System Architecture & Concept</div>
            <h2 className="text-2xl font-bold text-white">How JalRakshak AI Predicts Floods Before They Happen</h2>
          </div>
        </div>

        {/* Plain Language Summary */}
        <div className="p-4 bg-slate-800/80 border border-slate-700/80 rounded-xl mb-6">
          <p className="text-slate-300 text-sm md:text-base leading-relaxed">
            <strong className="text-white">In plain terms:</strong> Instead of waiting for 911/1070 calls when roads are already underwater (reactive), 
            JalRakshak AI combines upcoming weather forecasts, terrain elevations, drain blockage levels, and past flood records to predict 
            <span className="text-cyan-300 font-semibold"> exactly which streets will flood, at what rainfall threshold, how many hours in advance</span>, 
            and sends tiered warnings so citizens can move vehicles and families before water rises.
          </p>
        </div>

        {/* The 4 Core Inputs Grid */}
        <div className="mb-6">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-400 mb-3 flex items-center">
            <span className="w-2 h-2 rounded-full bg-cyan-400 mr-2"></span>
            The 4 Critical Meteorological & Hydraulic Inputs
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="p-4 bg-slate-950/60 border border-slate-800 rounded-xl hover:border-cyan-500/40 transition-colors">
              <div className="flex items-center space-x-2 text-cyan-400 font-semibold text-sm mb-1">
                <CloudRain className="w-4 h-4 text-cyan-400" />
                <span>1. Rainfall Data & Intensity</span>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">
                Live millimeters-per-hour precipitation rates from automatic weather stations and rain gauges measuring exact water volume landing on urban catchments.
              </p>
            </div>

            <div className="p-4 bg-slate-950/60 border border-slate-800 rounded-xl hover:border-cyan-500/40 transition-colors">
              <div className="flex items-center space-x-2 text-blue-400 font-semibold text-sm mb-1">
                <Waves className="w-4 h-4 text-blue-400" />
                <span>2. Drainage Network & Blockages</span>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">
                Stormwater canal capacities, culverts, pumping stations, and silt/debris choke percentages. Even moderate rain creates a severe flood if the canal is blocked.
              </p>
            </div>

            <div className="p-4 bg-slate-950/60 border border-slate-800 rounded-xl hover:border-cyan-500/40 transition-colors">
              <div className="flex items-center space-x-2 text-indigo-400 font-semibold text-sm mb-1">
                <ShieldAlert className="w-4 h-4 text-indigo-400" />
                <span>3. High-Resolution Weather Forecasts</span>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">
                Doppler radar trends and 6h to 48h cyclonic squall projections, allowing authorities to forecast water accumulation hours before storm landfall.
              </p>
            </div>

            <div className="p-4 bg-slate-950/60 border border-slate-800 rounded-xl hover:border-cyan-500/40 transition-colors">
              <div className="flex items-center space-x-2 text-emerald-400 font-semibold text-sm mb-1">
                <History className="w-4 h-4 text-emerald-400" />
                <span>4. Historical Flood Benchmarks</span>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">
                Calibrated against real historical deluges (e.g. Chennai 2015 494mm & 2023 Cyclone Michaung 390mm) to validate water accumulation patterns.
              </p>
            </div>
          </div>
        </div>

        {/* What separates this winning build */}
        <div className="p-5 bg-gradient-to-br from-cyan-950/40 to-slate-900 border border-cyan-500/40 rounded-xl mb-6">
          <div className="flex items-center space-x-2 text-cyan-400 font-semibold text-sm mb-2">
            <CheckCircle2 className="w-4 h-4" />
            <span>Why This Is Actionable (Beyond a Basic Heatmap)</span>
          </div>
          <ul className="space-y-2 text-xs md:text-sm text-slate-300">
            <li className="flex items-start">
              <ArrowRight className="w-4 h-4 text-cyan-400 mr-2 shrink-0 mt-0.5" />
              <span><strong>Street-Level Vulnerability Thresholds:</strong> Tells an exact resident e.g., <em>"Your street (100ft Rd, Velachery) floods when rain exceeds 32mm/hr for 70 mins."</em></span>
            </li>
            <li className="flex items-start">
              <ArrowRight className="w-4 h-4 text-cyan-400 mr-2 shrink-0 mt-0.5" />
              <span><strong>"What-If" Hydraulic Simulator:</strong> Enables municipal engineers to simulate <em>"What if Velachery canal is 65% choked?"</em> and view instant flood footprint expansion and AI mitigation steps.</span>
            </li>
            <li className="flex items-start">
              <ArrowRight className="w-4 h-4 text-cyan-400 mr-2 shrink-0 mt-0.5" />
              <span><strong>3-Tier Proportional Alerting:</strong> Replaces panic sirens with targeted tiers: <strong>🟡 Watch (T-12h)</strong> → <strong>🟠 Warning (T-6h: Move Vehicles)</strong> → <strong>🔴 Evacuate (T-2h: Relocate)</strong> in local regional languages.</span>
            </li>
          </ul>
        </div>

        {/* Action Button */}
        <div className="flex justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2.5 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-sm rounded-xl transition-all shadow-lg shadow-cyan-500/20"
          >
            Explore Live Flood Predictor
          </button>
        </div>
      </div>
    </div>
  );
};
