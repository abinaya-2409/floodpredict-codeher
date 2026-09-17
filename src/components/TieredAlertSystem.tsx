import React, { useState } from 'react';
import { CityData, ZoneData, AlertTier, AlertBroadcast } from '../types';
import { BellRing, Send, Volume2, ShieldCheck, Smartphone, CheckCheck, Globe, Sparkles, MessageSquare, AlertTriangle } from 'lucide-react';

interface Props {
  city: CityData;
  zones: ZoneData[];
  selectedZone: ZoneData | null;
}

export const TieredAlertSystem: React.FC<Props> = ({
  city,
  zones,
  selectedZone,
}) => {
  const [selectedTier, setSelectedTier] = useState<AlertTier>('warning');
  const [selectedTargetZone, setSelectedTargetZone] = useState<string>(selectedZone?.id || 'all');
  const [selectedLanguage, setSelectedLanguage] = useState<'en' | 'ta' | 'hi' | 'te' | 'mr'>('ta');
  const [channel, setChannel] = useState<'SMS' | 'WhatsApp' | 'Sirens' | 'Cell Broadcast'>('SMS');
  const [isBroadcasting, setIsBroadcasting] = useState(false);
  const [audioSirenPlaying, setAudioSirenPlaying] = useState(false);

  const [broadcastLogs, setBroadcastLogs] = useState<AlertBroadcast[]>([
    {
      id: 'bc-1',
      timestamp: '15 mins ago',
      tier: 'evacuate',
      targetZoneIds: ['velachery', 'mudichur'],
      affectedStreets: ['100ft Bypass Road', 'Lakshmi Nagar Main Rd'],
      title: 'CRITICAL EVACUATION DIRECTIVE: Velachery & Mudichur',
      messageEn: 'URGENT: Flash inundation expected in 35 mins. Move ground floor residents to 1st floor or Velachery Community Camp immediately. NDRF boat teams deployed. Helpline: 1913.',
      messageLocal: 'அவசர எச்சரிக்கை: வேளச்சேரி மற்றும் முடிச்சூர் பகுதிகளில் அடுத்த 35 நிமிடங்களில் வெள்ளப்பெருக்கு அபாயம். உடனே மேல்தளத்திற்கு செல்லவும் அல்லது நிவாரண முகாமிற்கு வரவும்.',
      language: 'ta',
      actionChecklist: ['Move vehicles to elevated bridges', 'Turn off main MCB power', 'Call 1913 for rescue assistance'],
      channel: 'Cell Broadcast',
      status: 'dispatched'
    },
    {
      id: 'bc-2',
      timestamp: '45 mins ago',
      tier: 'warning',
      targetZoneIds: ['madipakkam', 'omr'],
      affectedStreets: ['Kuberan Nagar', 'Thoraipakkam 200ft Rd'],
      title: 'FLOOD WARNING: Move Vehicles to High Ground',
      messageEn: 'ADVISORY: Severe rainfall continuing. Move 2 & 4-wheelers to elevated MRTS or Mall parking decks before 18:00.',
      messageLocal: 'எச்சரிக்கை: கனமழை தொடர்வதால் உங்கள் வாகனங்களை உடனடியாக மேம்பாலம் அல்லது மாடி பார்க்கிங் பகுதிக்கு மாற்றவும்.',
      language: 'ta',
      actionChecklist: ['Relocate cars to multi-level decks', 'Store 72h dry ration & medicines'],
      channel: 'SMS',
      status: 'dispatched'
    }
  ]);

  const targetZoneObj = zones.find(z => z.id === selectedTargetZone);

  // Generate localized sample message based on parameters
  const generateMessage = () => {
    const zoneName = targetZoneObj ? targetZoneObj.name : `${city.name} Low-Lying Wards`;
    const depth = targetZoneObj ? targetZoneObj.predictedInundationDepthCm : 65;

    if (selectedLanguage === 'ta') {
      if (selectedTier === 'evacuate') {
        return `[ஜல்ரக்ஷக் - அவசர வெளியேற்ற எச்சரிக்கை] ${zoneName} பகுதியில் ${depth}செ.மீ வரை வெள்ள நீர் உயர வாய்ப்புள்ளது. தரைதளத்தில் உள்ளவர்கள் உடனடியாக நிவாரண முகாமுக்கு செல்லவும். உதவிக்கு: 1913 / 1070.`;
      } else if (selectedTier === 'warning') {
        return `[ஜல்ரக்ஷக் - வெள்ள எச்சரிக்கை] ${zoneName} பகுதியில் கனமழை தொடர்வதால் வாகனங்களை மேடான பகுதிக்கு மாற்றவும். மின் இணைப்பை சரிபார்க்கவும்.`;
      }
      return `[ஜல்ரக்ஷக் - கண்காணிப்பு அறிக்கை] ${zoneName} பகுதியில் அடுத்த 6 மணி நேரத்திற்கு மிதமான மழை பெய்ய வாய்ப்புள்ளது. கழிவுநீர் வடிகால்கள் கண்காணிக்கப்படுகின்றன.`;
    }

    if (selectedLanguage === 'hi') {
      if (selectedTier === 'evacuate') {
        return `[जल रक्षक - तत्काल निकासी चेतावनी] ${zoneName} में जलस्तर ${depth}cm तक बढ़ने का अनुमान है। भूतल निवासी तुरंत नजदीकी राहत शिविर में जाएं। हेल्पलाइन: 1070.`;
      }
      return `[जल रक्षक - बाढ़ चेतावनी] ${zoneName} में भारी बारिश का अनुमान। वाहन सुरक्षित ऊंचे स्थान पर पार्क करें और मुख्य बिजली स्विच बंद रखें।`;
    }

    // Default English
    if (selectedTier === 'evacuate') {
      return `[JALRAKSHAK TIER-3 EVACUATE] Immediate flash flood risk for ${zoneName}. Est depth: ${depth}cm within 45 mins. Evacuate ground floors to designated community centers. Emergency: 1070 / 1913.`;
    } else if (selectedTier === 'warning') {
      return `[JALRAKSHAK TIER-2 WARNING] High flood risk in ${zoneName}. Rainfall exceeding drain discharge capacity. Relocate vehicles to elevated parking decks now.`;
    }
    return `[JALRAKSHAK TIER-1 WATCH] Heavy rainfall band approaching ${zoneName}. Municipal desilting teams active. Monitor local alerts.`;
  };

  const handleDispatchAlert = () => {
    setIsBroadcasting(true);
    setTimeout(() => {
      const newBroadcast: AlertBroadcast = {
        id: `bc-${Date.now()}`,
        timestamp: 'Just now',
        tier: selectedTier,
        targetZoneIds: selectedTargetZone === 'all' ? zones.map(z => z.id) : [selectedTargetZone],
        affectedStreets: targetZoneObj ? targetZoneObj.keyStreets.map(s => s.name) : ['All Critical Corridors'],
        title: `${selectedTier.toUpperCase()} Alert Broadcast: ${targetZoneObj ? targetZoneObj.name : city.name}`,
        messageEn: generateMessage(),
        messageLocal: generateMessage(),
        language: selectedLanguage,
        actionChecklist: [
          'Relocate ground vehicles to designated elevated structures',
          'Disconnect sensitive electrical appliances',
          'Check in on elderly neighbors'
        ],
        channel,
        status: 'dispatched'
      };

      setBroadcastLogs([newBroadcast, ...broadcastLogs]);
      setIsBroadcasting(false);
    }, 600);
  };

  const playSirenSimulation = () => {
    setAudioSirenPlaying(true);
    // Simple Web Audio oscillator siren synthesis
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(440, audioCtx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(880, audioCtx.currentTime + 0.5);
      osc.frequency.exponentialRampToValueAtTime(440, audioCtx.currentTime + 1.0);
      osc.frequency.exponentialRampToValueAtTime(880, audioCtx.currentTime + 1.5);
      osc.frequency.exponentialRampToValueAtTime(440, audioCtx.currentTime + 2.0);

      gain.gain.setValueAtTime(0.2, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 2.2);

      osc.connect(gain);
      gain.connect(audioCtx.destination);

      osc.start();
      osc.stop(audioCtx.currentTime + 2.3);

      setTimeout(() => {
        setAudioSirenPlaying(false);
      }, 2300);
    } catch (e) {
      setTimeout(() => setAudioSirenPlaying(false), 2000);
    }
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 md:p-6 shadow-xl space-y-6" id="tiered-alert-center">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between pb-5 border-b border-slate-800 gap-4">
        <div>
          <div className="flex items-center space-x-2 text-cyan-400 font-bold text-xs uppercase tracking-wider">
            <BellRing className="w-4 h-4" />
            <span>Proportional Tiered Early Warning Hub</span>
          </div>
          <h2 className="text-xl md:text-2xl font-bold text-white mt-1">
            Tiered Multi-Channel Alert & Broadcast Engine
          </h2>
          <p className="text-slate-400 text-xs md:text-sm mt-0.5">
            Replaces generic panic sirens with proportional, lead-time targeted alerts (Watch → Warning → Evacuate) in regional languages.
          </p>
        </div>

        {/* Siren Test Button */}
        <button
          onClick={playSirenSimulation}
          className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center space-x-2 border transition-all ${
            audioSirenPlaying
              ? 'bg-rose-500 text-white border-rose-400 animate-bounce'
              : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700'
          }`}
        >
          <Volume2 className="w-4 h-4" />
          <span>{audioSirenPlaying ? 'Siren Sounding...' : 'Test Emergency Siren'}</span>
        </button>
      </div>

      {/* 3-Tier Matrix Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Tier 1: Watch */}
        <div
          onClick={() => setSelectedTier('watch')}
          className={`p-4 rounded-xl border cursor-pointer transition-all ${
            selectedTier === 'watch'
              ? 'bg-yellow-950/40 border-yellow-500 ring-2 ring-yellow-500/20 shadow-lg shadow-yellow-950/50'
              : 'bg-slate-950 border-slate-800 hover:border-yellow-500/40'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase bg-yellow-500/20 text-yellow-300 border border-yellow-500/40">
              Tier 1 • T - 12 to 6 Hours
            </span>
            <span className="text-xs font-mono text-slate-400">30-60mm</span>
          </div>
          <div className="text-base font-bold text-white mt-2">WATCH (Preparedness)</div>
          <p className="text-xs text-slate-300 mt-1 leading-relaxed">
            Municipal desilting teams active, trash racks cleared at sluice gates, relief center keys unlocked.
          </p>
        </div>

        {/* Tier 2: Warning */}
        <div
          onClick={() => setSelectedTier('warning')}
          className={`p-4 rounded-xl border cursor-pointer transition-all ${
            selectedTier === 'warning'
              ? 'bg-orange-950/40 border-orange-500 ring-2 ring-orange-500/20 shadow-lg shadow-orange-950/50'
              : 'bg-slate-950 border-slate-800 hover:border-orange-500/40'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase bg-orange-500/20 text-orange-300 border border-orange-500/40">
              Tier 2 • T - 6 to 2 Hours
            </span>
            <span className="text-xs font-mono text-slate-400">60-120mm</span>
          </div>
          <div className="text-base font-bold text-white mt-2">WARNING (Asset Protection)</div>
          <p className="text-xs text-slate-300 mt-1 leading-relaxed">
            Residents directed to move vehicles to multi-deck parking and bridges; ground-floor electrical isolation.
          </p>
        </div>

        {/* Tier 3: Evacuation */}
        <div
          onClick={() => setSelectedTier('evacuate')}
          className={`p-4 rounded-xl border cursor-pointer transition-all ${
            selectedTier === 'evacuate'
              ? 'bg-rose-950/40 border-rose-500 ring-2 ring-rose-500/20 shadow-lg shadow-rose-950/50'
              : 'bg-slate-950 border-slate-800 hover:border-rose-500/40'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase bg-rose-500/20 text-rose-300 border border-rose-500/40 animate-pulse">
              Tier 3 • T - 2 to 0 Hours
            </span>
            <span className="text-xs font-mono text-slate-400">&gt;120mm / Overflow</span>
          </div>
          <div className="text-base font-bold text-white mt-2">EVACUATE (Life Safety)</div>
          <p className="text-xs text-slate-300 mt-1 leading-relaxed">
            Immediate relocation of ground-dwelling citizens to dry relief camps. NDRF dinghies & SDRF teams mobilized.
          </p>
        </div>
      </div>

      {/* Broadcast Dispatch Controller */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Dispatch Controls */}
        <div className="lg:col-span-6 bg-slate-950 border border-slate-800 rounded-xl p-5 space-y-4">
          <div className="flex items-center space-x-2 text-xs font-bold text-white uppercase tracking-wider pb-2 border-b border-slate-800">
            <Send className="w-4 h-4 text-cyan-400" />
            <span>Targeted Geo-Fenced Dispatch Console</span>
          </div>

          {/* Zone Selector */}
          <div>
            <label className="text-xs font-medium text-slate-400 block mb-1">Target Vulnerability Zone</label>
            <select
              value={selectedTargetZone}
              onChange={(e) => setSelectedTargetZone(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-cyan-500"
            >
              <option value="all">Entire City Metro Basin (All Wards)</option>
              {zones.map((z) => (
                <option key={z.id} value={z.id}>
                  {z.name} ({z.predictedInundationDepthCm}cm • {z.currentRisk.toUpperCase()})
                </option>
              ))}
            </select>
          </div>

          {/* Language Selector */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-slate-400 block mb-1">Broadcast Language</label>
              <select
                value={selectedLanguage}
                onChange={(e) => setSelectedLanguage(e.target.value as any)}
                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-cyan-500"
              >
                <option value="ta">Tamil (தமிழ் - சென்னை)</option>
                <option value="en">English (Official)</option>
                <option value="hi">Hindi (हिन्दी)</option>
                <option value="mr">Marathi (मराठी - मुंबई)</option>
                <option value="te">Telugu (తెలుగు)</option>
              </select>
            </div>

            <div>
              <label className="text-xs font-medium text-slate-400 block mb-1">Broadcast Channel</label>
              <select
                value={channel}
                onChange={(e) => setChannel(e.target.value as any)}
                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-cyan-500"
              >
                <option value="Cell Broadcast">Cell Broadcast (CAP/NDMA)</option>
                <option value="SMS">Targeted SMS Gateway</option>
                <option value="WhatsApp">WhatsApp Disaster Bot</option>
                <option value="Sirens">City Public Address System</option>
              </select>
            </div>
          </div>

          {/* Message Preview Box */}
          <div>
            <label className="text-xs font-medium text-slate-400 block mb-1">Synthesized Broadcast Payload</label>
            <div className="p-3 bg-slate-900 border border-slate-800 rounded-xl text-xs text-slate-200 leading-relaxed font-sans">
              {generateMessage()}
            </div>
          </div>

          {/* Action Dispatch Button */}
          <button
            onClick={handleDispatchAlert}
            disabled={isBroadcasting}
            className={`w-full py-3 rounded-xl font-bold text-xs flex items-center justify-center space-x-2 transition-all shadow-lg ${
              selectedTier === 'evacuate'
                ? 'bg-rose-600 hover:bg-rose-500 text-white shadow-rose-600/30'
                : selectedTier === 'warning'
                ? 'bg-orange-600 hover:bg-orange-500 text-white shadow-orange-600/30'
                : 'bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-bold shadow-cyan-600/30'
            }`}
          >
            <Send className="w-4 h-4" />
            <span>{isBroadcasting ? 'Broadcasting via NDMA Gateway...' : `Dispatch ${selectedTier.toUpperCase()} to Citizens`}</span>
          </button>
        </div>

        {/* Right Column: Citizen Smartphone Mock Preview & Logs */}
        <div className="lg:col-span-6 space-y-4">
          {/* Smartphone Notification Preview */}
          <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl">
            <div className="text-xs font-bold text-slate-400 mb-3 flex items-center justify-between">
              <span className="flex items-center space-x-1.5">
                <Smartphone className="w-4 h-4 text-cyan-400" />
                <span>Citizen Smartphone Lock Screen Preview</span>
              </span>
              <span className="text-[10px] font-mono text-emerald-400">● 4G/5G Broadcast Active</span>
            </div>

            {/* Notification Card */}
            <div className="p-3.5 bg-slate-900/90 border border-slate-700/80 rounded-xl shadow-lg space-y-2">
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center space-x-2">
                  <span className="p-1 rounded-md bg-cyan-500/20 text-cyan-400">
                    <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />
                  </span>
                  <span className="font-bold text-white text-xs">DISASTER MANAGEMENT AUTHORITY</span>
                </div>
                <span className="text-[10px] text-slate-400">Now</span>
              </div>
              <p className="text-xs text-slate-200 font-medium leading-relaxed">
                {generateMessage()}
              </p>
              <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-[10px] text-slate-400">
                <span>Action: Tap for Dry Evacuation Route</span>
                <span className="text-cyan-400 font-bold">1913 Helpline</span>
              </div>
            </div>
          </div>

          {/* Broadcast Activity Log */}
          <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl">
            <div className="text-xs font-bold text-white mb-2 flex items-center justify-between">
              <span>Recent Emergency Broadcast Dispatch Logs</span>
              <span className="text-[10px] text-slate-500 font-mono">{broadcastLogs.length} transmissions</span>
            </div>
            <div className="space-y-2 max-h-48 overflow-y-auto pr-1 scrollbar-thin">
              {broadcastLogs.map((log) => (
                <div key={log.id} className="p-2.5 rounded-lg bg-slate-900 border border-slate-800 text-xs">
                  <div className="flex items-center justify-between">
                    <span className={`px-2 py-0.2 rounded text-[10px] font-bold uppercase ${
                      log.tier === 'evacuate' ? 'bg-rose-500/20 text-rose-300' : 'bg-orange-500/20 text-orange-300'
                    }`}>
                      {log.tier} • {log.channel}
                    </span>
                    <span className="text-[10px] text-slate-400 font-mono">{log.timestamp}</span>
                  </div>
                  <div className="text-slate-200 font-medium text-xs mt-1 truncate">{log.title}</div>
                  <div className="text-[11px] text-slate-400 mt-0.5 truncate">{log.messageEn}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
