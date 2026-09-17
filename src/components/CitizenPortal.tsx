import React, { useState } from 'react';
import { CityData, ZoneData, ReliefShelter, CitizenReport } from '../types';
import { ShieldCheck, Navigation, MapPin, AlertTriangle, Phone, CheckCircle2, Send, Plus, Users, Zap, HeartPulse, Building } from 'lucide-react';

interface Props {
  city: CityData;
  zones: ZoneData[];
  shelters: ReliefShelter[];
  citizenReports: CitizenReport[];
  onAddCitizenReport: (report: CitizenReport) => void;
}

export const CitizenPortal: React.FC<Props> = ({
  city,
  zones,
  shelters,
  citizenReports,
  onAddCitizenReport,
}) => {
  const [selectedUserZone, setSelectedUserZone] = useState<string>(zones[0]?.id || 'velachery');
  const [reportStreet, setReportStreet] = useState('');
  const [reportDepth, setReportDepth] = useState<number>(30);
  const [reportPassable, setReportPassable] = useState(false);
  const [reportClogged, setReportClogged] = useState(true);
  const [reportPower, setReportPower] = useState(true);
  const [reportDesc, setReportDesc] = useState('');
  const [reportSubmitted, setReportSubmitted] = useState(false);

  const currentZone = zones.find(z => z.id === selectedUserZone) || zones[0];
  const nearestShelters = shelters.filter(s => s.zoneId === selectedUserZone || s.isAccessible);

  const handleSubmitReport = (e: React.FormEvent) => {
    e.preventDefault();
    if (!reportStreet) return;

    const newReport: CitizenReport = {
      id: `rep-${Date.now()}`,
      timestamp: 'Just now',
      zoneId: selectedUserZone,
      streetName: reportStreet,
      waterDepthCm: reportDepth,
      isPassableForVehicles: reportPassable,
      drainCloggedNotice: reportClogged,
      powerOutage: reportPower,
      description: reportDesc || 'Citizen waterlogging report submitted via JalRakshak Portal.',
      verifiedByAuthority: false,
    };

    onAddCitizenReport(newReport);
    setReportStreet('');
    setReportDesc('');
    setReportSubmitted(true);
    setTimeout(() => setReportSubmitted(false), 3000);
  };

  return (
    <div className="space-y-6" id="citizen-safety-portal">
      {/* Top Banner: Location Quick Check */}
      <div className="p-5 md:p-6 bg-slate-900 border border-slate-800 rounded-2xl shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2 text-cyan-400 font-bold text-xs uppercase tracking-wider">
            <ShieldCheck className="w-4 h-4" />
            <span>Citizen Safe Zone & Dry Route Portal</span>
          </div>
          <h2 className="text-xl md:text-2xl font-bold text-white mt-1">
            Is Your Street Safe Right Now?
          </h2>
          <p className="text-slate-400 text-xs md:text-sm mt-0.5">
            Check real-time inundation forecasts for your neighbourhood, locate verified elevated shelters, and report local waterlogging.
          </p>
        </div>

        {/* Location Dropdown */}
        <div className="w-full md:w-64">
          <label className="text-xs text-slate-400 font-medium block mb-1">Select Your Neighbourhood</label>
          <select
            value={selectedUserZone}
            onChange={(e) => setSelectedUserZone(e.target.value)}
            className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white font-semibold focus:outline-none focus:border-cyan-500"
          >
            {zones.map((z) => (
              <option key={z.id} value={z.id}>
                {z.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Immediate Status for Selected Zone */}
      {currentZone && (
        <div className={`p-5 rounded-2xl border ${
          currentZone.alertTier === 'evacuate' ? 'bg-rose-950/40 border-rose-500/50' :
          currentZone.alertTier === 'warning' ? 'bg-orange-950/40 border-orange-500/50' :
          currentZone.alertTier === 'watch' ? 'bg-yellow-950/40 border-yellow-500/50' : 'bg-slate-900 border-slate-800'
        }`}>
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-start space-x-3">
              <div className={`p-2.5 rounded-xl mt-0.5 ${
                currentZone.alertTier === 'evacuate' ? 'bg-rose-500 text-white' :
                currentZone.alertTier === 'warning' ? 'bg-orange-500 text-white' : 'bg-yellow-500 text-slate-950'
              }`}>
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <div className="text-xs font-mono font-bold uppercase tracking-wider text-slate-300">
                  {currentZone.name} Advisory Status
                </div>
                <div className="text-lg md:text-xl font-bold text-white mt-0.5">
                  Tier {currentZone.alertTier.toUpperCase()} Alert Active • {currentZone.predictedInundationDepthCm} cm Est. Water
                </div>
                <p className="text-xs text-slate-300 mt-1">
                  {currentZone.alertTier === 'evacuate'
                    ? 'Immediate evacuation recommended for ground-floor homes. Water depth expected to rise above doorstep.'
                    : currentZone.alertTier === 'warning'
                    ? 'Move vehicles to elevated parking decks and bridges. Isolate ground floor inverters.'
                    : 'Watch for rapid water buildup during high tide. Keep emergency torches and medicines ready.'}
                </p>
              </div>
            </div>

            <div className="flex items-center space-x-2 shrink-0">
              <a
                href="tel:1913"
                className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-bold flex items-center space-x-1.5 transition-colors shadow-lg shadow-rose-600/30"
              >
                <Phone className="w-4 h-4" />
                <span>Call Emergency (1913 / 1070)</span>
              </a>
            </div>
          </div>
        </div>
      )}

      {/* Two Column Layout: Nearest Shelters & Crowdsource Report */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Nearest Verified Dry Shelters */}
        <div className="lg:col-span-7 bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800">
            <div className="flex items-center space-x-2 text-cyan-400 font-bold text-xs uppercase tracking-wider">
              <Building className="w-4 h-4" />
              <span>Verified Elevated Relief Camps & Shelters</span>
            </div>
            <span className="text-[10px] text-emerald-400 font-mono">● High Ground (Dry Guaranteed)</span>
          </div>

          <div className="space-y-3">
            {nearestShelters.map((shelter) => (
              <div key={shelter.id} className="p-4 bg-slate-950 border border-slate-800 rounded-xl space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h4 className="text-sm font-bold text-white">{shelter.name}</h4>
                    <p className="text-xs text-slate-400 mt-0.5">{shelter.address}</p>
                  </div>
                  <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-cyan-500/20 text-cyan-300 shrink-0">
                    {shelter.elevationM}m MSL Elevation
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-800/80 text-[11px]">
                  <div className="flex items-center space-x-1 text-slate-300">
                    <Users className="w-3.5 h-3.5 text-cyan-400" />
                    <span>Cap: {shelter.currentOccupancyPersons}/{shelter.capacityPersons}</span>
                  </div>
                  <div className="flex items-center space-x-1 text-emerald-400">
                    <Zap className="w-3.5 h-3.5" />
                    <span>Generator Backup</span>
                  </div>
                  <div className="flex items-center space-x-1 text-blue-400">
                    <HeartPulse className="w-3.5 h-3.5" />
                    <span>Medical Post</span>
                  </div>
                </div>

                <div className="pt-2 flex items-center justify-between text-xs">
                  <span className="text-slate-400">Contact: <strong className="text-slate-200">{shelter.contactNumber}</strong></span>
                  <a
                    href={`https://maps.google.com/?q=${encodeURIComponent(shelter.name + ' ' + city.name)}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-cyan-400 hover:text-cyan-300 font-semibold flex items-center space-x-1"
                  >
                    <span>Get Directions</span>
                    <Navigation className="w-3.5 h-3.5" />
                  </a>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right Column: Crowdsource Waterlogging Beacon */}
        <div className="lg:col-span-5 bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
          <div className="flex items-center space-x-2 text-cyan-400 font-bold text-xs uppercase tracking-wider pb-3 border-b border-slate-800">
            <Plus className="w-4 h-4" />
            <span>Crowdsource Street Waterlogging Beacon</span>
          </div>

          <form onSubmit={handleSubmitReport} className="space-y-3 text-xs">
            <div>
              <label className="text-slate-400 block mb-1 font-medium">Street Name / Landmark *</label>
              <input
                type="text"
                required
                placeholder="e.g. 5th Main Road, Vijaya Nagar"
                value={reportStreet}
                onChange={(e) => setReportStreet(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-slate-400 block mb-1 font-medium">Water Depth (cm)</label>
                <input
                  type="number"
                  min="5"
                  max="200"
                  value={reportDepth}
                  onChange={(e) => setReportDepth(Number(e.target.value))}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-slate-200 focus:outline-none focus:border-cyan-500 font-mono"
                />
              </div>

              <div>
                <label className="text-slate-400 block mb-1 font-medium">Vehicle Passable?</label>
                <select
                  value={reportPassable ? 'yes' : 'no'}
                  onChange={(e) => setReportPassable(e.target.value === 'yes')}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-slate-200 focus:outline-none focus:border-cyan-500"
                >
                  <option value="no">No - Cars Stalling</option>
                  <option value="yes">Yes - Slow Movement</option>
                </select>
              </div>
            </div>

            <div className="flex items-center space-x-4 pt-1">
              <label className="flex items-center space-x-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={reportClogged}
                  onChange={(e) => setReportClogged(e.target.checked)}
                  className="rounded border-slate-700 text-cyan-500 focus:ring-cyan-500"
                />
                <span className="text-slate-300">Drain is Clogged/Blocked</span>
              </label>

              <label className="flex items-center space-x-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={reportPower}
                  onChange={(e) => setReportPower(e.target.checked)}
                  className="rounded border-slate-700 text-cyan-500 focus:ring-cyan-500"
                />
                <span className="text-slate-300">Power Outage</span>
              </label>
            </div>

            <div>
              <label className="text-slate-400 block mb-1 font-medium">Description / Observations</label>
              <textarea
                rows={2}
                placeholder="Water rising rapidly, drains overflowing, need assistance..."
                value={reportDesc}
                onChange={(e) => setReportDesc(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500"
              />
            </div>

            <button
              type="submit"
              className="w-full py-2.5 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold rounded-xl flex items-center justify-center space-x-2 transition-all shadow-md shadow-cyan-500/20"
            >
              <Send className="w-3.5 h-3.5" />
              <span>Submit Live Beacon to Authority Hub</span>
            </button>

            {reportSubmitted && (
              <div className="p-2.5 bg-emerald-950/60 border border-emerald-500/50 rounded-xl text-emerald-300 text-xs flex items-center space-x-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                <span>Beacon sent! Dispatched to municipal flood control room.</span>
              </div>
            )}
          </form>

          {/* Recent Live Citizen Reports List */}
          <div className="pt-3 border-t border-slate-800">
            <div className="text-xs font-bold text-slate-300 mb-2">Live Community Waterlogging Feed</div>
            <div className="space-y-2 max-h-40 overflow-y-auto pr-1 scrollbar-thin">
              {citizenReports.map((r) => (
                <div key={r.id} className="p-2.5 rounded-lg bg-slate-950 border border-slate-800 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-white truncate">{r.streetName}</span>
                    <span className="font-mono text-cyan-300 font-bold">{r.waterDepthCm} cm</span>
                  </div>
                  <p className="text-slate-400 text-[11px] mt-0.5">{r.description}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
