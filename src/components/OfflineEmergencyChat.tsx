import React, { useState, useEffect, useRef } from 'react';
import {
  BluetoothDevicePeer,
  BluetoothState,
  BluetoothUserIdentity,
  ConnectionHealthMetrics,
  ConnectionState,
  DiagnosticSummary,
  EMERGENCY_QUICK_PRESETS,
  StoredMessage,
} from '../services/bluetooth/BluetoothTypes';
import { BluetoothService } from '../services/bluetooth/BluetoothService';
import { ConnectionManager } from '../services/bluetooth/ConnectionManager';
import { DeviceDiscovery } from '../services/bluetooth/DeviceDiscovery';
import { OfflineStorage } from '../services/bluetooth/OfflineStorage';
import {
  Bluetooth,
  BluetoothOff,
  Radio,
  WifiOff,
  Send,
  AlertTriangle,
  ShieldAlert,
  ShieldCheck,
  RefreshCw,
  Trash2,
  Lock,
  UserCheck,
  Edit2,
  Check,
  CheckCheck,
  Clock,
  Ban,
  Activity,
  Zap,
  Info,
  Smartphone,
  CheckCircle2,
  XCircle,
  Cpu,
  Layers,
  Gauge,
} from 'lucide-react';

interface Props {
  onBackToDashboard?: () => void;
}

export const OfflineEmergencyChat: React.FC<Props> = ({ onBackToDashboard }) => {
  const [identity, setIdentity] = useState<BluetoothUserIdentity>(() => BluetoothService.getIdentity());
  const [isEditingNick, setIsEditingNick] = useState(false);
  const [nicknameInput, setNicknameInput] = useState(identity.nickname);

  const [bluetoothState, setBluetoothState] = useState<BluetoothState>('unknown');
  const [connState, setConnState] = useState<ConnectionState>('disconnected');
  const [connectedPeer, setConnectedPeer] = useState<BluetoothDevicePeer | null>(null);
  const [healthMetrics, setHealthMetrics] = useState<ConnectionHealthMetrics>(() => ConnectionManager.getHealthMetrics());

  const [discoveredDevices, setDiscoveredDevices] = useState<BluetoothDevicePeer[]>([]);
  const [isScanning, setIsScanning] = useState(false);

  const [messages, setMessages] = useState<StoredMessage[]>([]);
  const [messageInput, setMessageInput] = useState('');
  const [isSending, setIsSending] = useState(false);

  const [isSimMode, setIsSimMode] = useState<boolean>(() => BluetoothService.isSimulationMode());
  const [showSosModal, setShowSosModal] = useState(false);
  const [sosHoldProgress, setSosHoldProgress] = useState(0);
  const sosHoldTimer = useRef<any>(null);

  const [showDiagnosticModal, setShowDiagnosticModal] = useState(false);
  const [diagnosticSummary, setDiagnosticSummary] = useState<DiagnosticSummary | null>(null);
  const [isRunningDiagnostic, setIsRunningDiagnostic] = useState(false);
  const [isContinuousLoopActive, setIsContinuousLoopActive] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Initialize service on mount
  useEffect(() => {
    BluetoothService.initialize();

    const unsubBT = BluetoothService.addBluetoothStateListener((state) => {
      setBluetoothState(state);
    });

    const unsubConn = ConnectionManager.addListener((state, peer) => {
      setConnState(state);
      setConnectedPeer(peer);
      if (peer) {
        loadMessagesForPeer(peer.id);
      }
    });

    const unsubDiscovery = DeviceDiscovery.addListener((devices) => {
      setDiscoveredDevices(devices);
      setIsScanning(DeviceDiscovery.getIsScanning());
    });

    const unsubHealth = ConnectionManager.addHealthListener((metrics) => {
      setHealthMetrics(metrics);
    });

    return () => {
      unsubBT();
      unsubConn();
      unsubDiscovery();
      unsubHealth();
      BluetoothService.stopContinuousHealthLoop();
    };
  }, []);

  // Diagnostic Loop Execution
  const handleRunDiagnosticLoop = async () => {
    setIsRunningDiagnostic(true);
    setShowDiagnosticModal(true);
    try {
      const summary = await BluetoothService.runDiagnosticLoop();
      setDiagnosticSummary(summary);
    } catch (err) {
      console.error('[OfflineChat] Diagnostic execution error:', err);
    } finally {
      setIsRunningDiagnostic(false);
    }
  };

  const handleToggleContinuousLoop = () => {
    if (isContinuousLoopActive) {
      BluetoothService.stopContinuousHealthLoop();
      setIsContinuousLoopActive(false);
    } else {
      setIsContinuousLoopActive(true);
      BluetoothService.startContinuousHealthLoop(15000, (summary) => {
        setDiagnosticSummary(summary);
      });
    }
  };

  // Poll / sync messages on connection or message updates
  const loadMessagesForPeer = (peerId: string) => {
    const msgs = OfflineStorage.getMessages(peerId);
    setMessages([...msgs]);
  };

  useEffect(() => {
    const interval = setInterval(() => {
      if (connectedPeer) {
        loadMessagesForPeer(connectedPeer.id);
      }
    }, 600);
    return () => clearInterval(interval);
  }, [connectedPeer]);

  // Scroll to latest message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSaveNickname = () => {
    if (!nicknameInput.trim()) return;
    const updated = BluetoothService.updateNickname(nicknameInput.trim());
    setIdentity(updated);
    setIsEditingNick(false);
  };

  const handleToggleScan = () => {
    if (isScanning) {
      BluetoothService.stopScan();
      setIsScanning(false);
    } else {
      BluetoothService.startScan();
      setIsScanning(true);
    }
  };

  const handleConnect = async (peer: BluetoothDevicePeer) => {
    await BluetoothService.connectToDevice(peer);
  };

  const handleDisconnect = async () => {
    await BluetoothService.disconnect();
    setMessages([]);
  };

  const handleSendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!messageInput.trim() || isSending || !connectedPeer) return;

    const text = messageInput.trim();
    setMessageInput('');
    setIsSending(true);

    try {
      await BluetoothService.sendMessage(text, 'normal', 'msg');
      if (connectedPeer) loadMessagesForPeer(connectedPeer.id);
    } catch (err) {
      console.error('Send error:', err);
    } finally {
      setIsSending(false);
    }
  };

  const handleSendQuick = async (presetId: string) => {
    if (!connectedPeer) return;
    try {
      await BluetoothService.sendQuickMessage(presetId);
      if (connectedPeer) loadMessagesForPeer(connectedPeer.id);
    } catch (err) {
      console.error('Quick send error:', err);
    }
  };

  const handleTriggerSOS = async () => {
    setShowSosModal(false);
    setSosHoldProgress(0);
    if (!connectedPeer) return;

    try {
      await BluetoothService.sendSOS();
      if (connectedPeer) loadMessagesForPeer(connectedPeer.id);
    } catch (err) {
      console.error('SOS send error:', err);
    }
  };

  const handleSosMouseDown = () => {
    setSosHoldProgress(0);
    const startTime = Date.now();
    const duration = 1500; // 1.5 second hold

    sosHoldTimer.current = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(100, Math.round((elapsed / duration) * 100));
      setSosHoldProgress(progress);

      if (elapsed >= duration) {
        clearInterval(sosHoldTimer.current);
        handleTriggerSOS();
      }
    }, 40);
  };

  const handleSosMouseUp = () => {
    if (sosHoldTimer.current) {
      clearInterval(sosHoldTimer.current);
      sosHoldTimer.current = null;
    }
    if (sosHoldProgress < 100) {
      setSosHoldProgress(0);
    }
  };

  const handleClearHistory = () => {
    if (window.confirm('Clear all offline emergency message history stored on this device?')) {
      OfflineStorage.clearAllOfflineData();
      setMessages([]);
    }
  };

  const handleToggleSimulation = () => {
    const next = !isSimMode;
    setIsSimMode(next);
    BluetoothService.setSimulationMode(next);
  };

  const isNative = BluetoothService.isNativeAvailable();

  return (
    <div className="space-y-6 max-w-7xl mx-auto px-2 sm:px-4">
      {/* Top Banner: Direct Offline Bluetooth Emergency Chat Header */}
      <div className="p-5 md:p-6 bg-surface/90 border border-line-strong/80 rounded-panel shadow-2xl relative overflow-hidden backdrop-blur-xl">
        <div className="absolute -right-16 -top-16 w-64 h-64 rounded-full bg-cyan-500/10 blur-3xl pointer-events-none" />
        <div className="absolute -left-16 -bottom-16 w-64 h-64 rounded-full bg-indigo-500/10 blur-3xl pointer-events-none" />

        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 relative z-10">
          <div className="flex items-start gap-3.5">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-cyan-500/20 to-blue-600/30 border border-cyan-400/40 flex items-center justify-center text-cyan-300 shadow-inner shrink-0 mt-0.5">
              <Bluetooth className="w-6 h-6 animate-pulse" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="px-2.5 py-0.5 rounded-full text-mini font-mono font-bold bg-cyan-500/15 border border-cyan-400/30 text-cyan-300 uppercase tracking-wider flex items-center gap-1.5">
                  <WifiOff className="w-3 h-3 text-cyan-400" />
                  <span>Zero-Internet P2P Radio</span>
                </span>

                {isNative ? (
                  <span className="px-2 py-0.5 rounded-full text-mini font-mono font-bold bg-emerald-500/15 border border-emerald-400/30 text-emerald-300 flex items-center gap-1">
                    <Smartphone className="w-3 h-3" />
                    <span>Android BLE Hardware Active</span>
                  </span>
                ) : (
                  <span className="px-2 py-0.5 rounded-full text-mini font-mono font-bold bg-amber-500/15 border border-amber-400/30 text-amber-300 flex items-center gap-1">
                    <Activity className="w-3 h-3" />
                    <span>{isSimMode ? 'Simulated demo' : 'Browser - no radio'}</span>
                  </span>
                )}
              </div>

              <h1 className="text-xl md:text-2xl font-extrabold text-fg tracking-tight mt-1 flex items-center gap-2">
                <span>FloodyPredict Offline Emergency Chat</span>
              </h1>
              <p className="text-xs sm:text-sm text-fg-soft mt-0.5">
                Communicate directly with nearby FloodyPredict users over 2.4GHz Bluetooth when cellular towers, power grids, and Wi-Fi networks fail.
              </p>
            </div>
          </div>

          {/* Identity & Status Pill */}
          <div className="flex flex-wrap items-center gap-2.5 bg-bg/80 border border-line-strong/60 rounded-card p-3 shadow-inner">
            <div className="flex flex-col">
              <span className="text-[10px] font-mono text-muted uppercase tracking-wider">Your Device Identity</span>
              {isEditingNick ? (
                <div className="flex items-center gap-1 mt-1">
                  <input
                    type="text"
                    value={nicknameInput}
                    onChange={(e) => setNicknameInput(e.target.value)}
                    maxLength={32}
                    className="h-7 px-2 text-xs bg-surface border border-accent rounded text-fg focus:outline-none"
                    placeholder="Enter nickname"
                  />
                  <button
                    onClick={handleSaveNickname}
                    className="h-7 px-2 bg-accent text-slate-900 rounded font-bold text-xs hover:bg-accent-soft cursor-pointer"
                  >
                    <Check className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span className="font-mono font-bold text-sm text-cyan-300">{identity.nickname}</span>
                  <button
                    onClick={() => setIsEditingNick(true)}
                    className="text-muted hover:text-cyan-300 transition-colors cursor-pointer"
                    title="Edit Nickname"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
              <span className="text-[10px] font-mono text-subtle">{identity.id} (Ephemeral)</span>
            </div>

            <div className="border-l border-line-strong/60 pl-3 ml-1 flex flex-col justify-center">
              <span className="text-[10px] font-mono text-muted uppercase">Radio State</span>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span
                  className={`w-2 h-2 rounded-full ${
                    connState === 'connected'
                      ? 'bg-blue-400 animate-ping'
                      : connState === 'connecting'
                      ? 'bg-amber-400 animate-pulse'
                      : 'bg-emerald-400'
                  }`}
                />
                <span className="text-xs font-semibold font-mono text-fg capitalize">
                  {connState === 'connected' ? '🔵 BT Connected' : connState === 'connecting' ? '🟡 Linking...' : '🟢 Radio Ready'}
                </span>
              </div>
            </div>

            {/* Live Link Quality & Latency RTT */}
            {connState === 'connected' && (
              <div className="border-l border-line-strong/60 pl-3 ml-1 flex flex-col justify-center">
                <span className="text-[10px] font-mono text-muted uppercase">Heartbeat Latency</span>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span
                    className={`w-2 h-2 rounded-full ${
                      healthMetrics.linkQuality === 'excellent'
                        ? 'bg-emerald-400'
                        : healthMetrics.linkQuality === 'good'
                        ? 'bg-cyan-400'
                        : healthMetrics.linkQuality === 'fair'
                        ? 'bg-amber-400'
                        : 'bg-rose-400'
                    }`}
                  />
                  <span className="text-xs font-mono font-bold text-fg">
                    {healthMetrics.rttMs > 0 ? `${healthMetrics.rttMs}ms RTT` : '<50ms'} ({healthMetrics.linkQuality.toUpperCase()})
                  </span>
                </div>
              </div>
            )}

            {/* Diagnostic Loop Self-Test Button */}
            <button
              onClick={handleRunDiagnosticLoop}
              disabled={isRunningDiagnostic}
              className="text-[11px] font-mono px-3 py-1.5 rounded-full border border-cyan-500/40 bg-gradient-to-r from-cyan-950/80 to-blue-950/80 hover:from-cyan-900/90 hover:to-blue-900/90 text-cyan-300 font-bold flex items-center gap-1.5 transition-all cursor-pointer shadow-sm hover:shadow-cyan-500/20"
              title="Run Automated Diagnostic Self-Test Loop to verify Bluetooth radio, chunking, and persistence"
            >
              <Activity className={`w-3.5 h-3.5 text-cyan-400 ${isRunningDiagnostic ? 'animate-spin' : ''}`} />
              <span>{isRunningDiagnostic ? 'Testing Loops...' : 'Diagnostic Loop'}</span>
            </button>

            {/* Simulation Toggle */}
            <button
              onClick={handleToggleSimulation}
              className={`text-[11px] font-mono px-2.5 py-1 rounded-full border transition-all cursor-pointer ${
                isSimMode
                  ? 'bg-purple-950/70 border-purple-500/50 text-purple-300'
                  : 'bg-surface border-line text-muted hover:text-fg'
              }`}
              title="Toggle Dev Simulation Lab for testing peer interactions in browser"
            >
              Sim Mode: {isSimMode ? 'ON' : 'OFF'}
            </button>
          </div>
        </div>
      </div>

      {/* Main Grid: Device Discovery List vs Active Chat */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column (5 cols): Device Discovery & Nearby Floody Users */}
        <div className="lg:col-span-5 space-y-4">
          <div className="glass rounded-panel p-4 sm:p-5 border border-line-strong/60 shadow-xl flex flex-col gap-4">
            <div className="flex items-center justify-between pb-3 border-b border-line-strong/50">
              <div className="flex items-center gap-2">
                <Radio className={`w-4 h-4 ${isScanning ? 'text-cyan-400 animate-spin' : 'text-muted'}`} />
                <h2 className="font-bold text-sm sm:text-base text-fg">Nearby FloodyPredict Users</h2>
              </div>
              <span className="text-xs font-mono px-2 py-0.5 rounded bg-surface-2 text-cyan-300 border border-cyan-500/20">
                {discoveredDevices.length} Found
              </span>
            </div>

            {/* Scan Controls */}
            <div className="flex items-center gap-2">
              <button
                onClick={handleToggleScan}
                className={`flex-1 h-9 px-4 rounded-full text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer shadow-md ${
                  isScanning
                    ? 'bg-rose-950/80 hover:bg-rose-900 border border-rose-500/50 text-rose-300'
                    : 'bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white border border-cyan-400/40'
                }`}
              >
                {isScanning ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Stop Scan</span>
                  </>
                ) : (
                  <>
                    <Radio className="w-3.5 h-3.5" />
                    <span>Scan for Devices</span>
                  </>
                )}
              </button>

              <button
                onClick={() => {
                  BluetoothService.startScan();
                  setIsScanning(true);
                }}
                disabled={isScanning}
                className="h-9 px-3 rounded-full bg-surface-2 hover:bg-surface-3 text-fg-soft border border-line-strong text-xs font-semibold flex items-center gap-1.5 transition-colors disabled:opacity-50 cursor-pointer"
                title="Scan Again"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Refresh</span>
              </button>
            </div>

            {/* Discovered Devices List */}
            <div className="space-y-2.5 max-h-[420px] overflow-y-auto pr-1">
              {discoveredDevices.length === 0 ? (
                <div className="p-8 text-center bg-bg/50 rounded-card border border-dashed border-line-strong/60 flex flex-col items-center gap-3">
                  <div className="w-12 h-12 rounded-full bg-surface-2 flex items-center justify-center text-muted">
                    <BluetoothOff className="w-6 h-6" />
                  </div>
                  {/*
                    What the empty state says depends on whether there is a
                    radio to talk to at all. It used to say "make sure nearby
                    Android phones have Bluetooth turned ON" in every case,
                    including in a browser - where no amount of switching
                    Bluetooth on can help, because a web page has no way to
                    reach the adapter. Telling someone to keep trying
                    something that cannot work is worse than saying nothing.
                  */}
                  <div className="flex flex-col gap-1">
                    {isNative ? (
                      <>
                        <span className="text-xs font-bold text-fg">
                          No nearby FloodyPredict devices detected
                        </span>
                        <span className="text-[11px] text-muted max-w-sm leading-relaxed">
                          Make sure nearby Android phones have Bluetooth and Location
                          switched on, with FloodyPredict open on this screen. Android
                          requires Location to be enabled for Bluetooth scanning.
                        </span>
                      </>
                    ) : (
                      <>
                        <span className="text-xs font-bold text-fg">
                          This browser cannot reach a Bluetooth radio
                        </span>
                        <span className="text-[11px] text-muted max-w-sm leading-relaxed">
                          Peer-to-peer chat pairs two phones directly, which needs the
                          installed Android app on both. A web page has no API that can
                          discover or connect to another phone over Bluetooth, so nothing
                          will appear here however long you scan &mdash; this is a limit of
                          the browser, not a fault in the pairing.
                        </span>
                      </>
                    )}
                  </div>
                  {!isSimMode && (
                    <button
                      onClick={handleToggleSimulation}
                      className="text-mini font-mono text-cyan-400 hover:underline mt-1 cursor-pointer"
                    >
                      Run the simulated two-device demo instead
                    </button>
                  )}
                </div>
              ) : (
                discoveredDevices.map((device) => {
                  const isCurrent = connectedPeer?.id === device.id;
                  const signalStrength = device.rssi
                    ? device.rssi > -65
                      ? 'Strong'
                      : device.rssi > -80
                      ? 'Medium'
                      : 'Weak'
                    : 'Good';

                  return (
                    <div
                      key={device.id}
                      className={`p-3.5 rounded-card border transition-all flex items-center justify-between gap-3 ${
                        isCurrent
                          ? 'bg-cyan-950/40 border-cyan-400/60 shadow-[0_0_15px_rgba(6,182,212,0.15)]'
                          : 'bg-surface/80 border-line-strong/60 hover:border-line-strong hover:bg-surface-2/60'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div
                          className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 border ${
                            isCurrent
                              ? 'bg-cyan-500/20 border-cyan-400 text-cyan-300'
                              : 'bg-surface-2 border-line text-muted'
                          }`}
                        >
                          <Smartphone className="w-4 h-4" />
                        </div>
                        <div className="flex flex-col min-w-0">
                          <span className="text-xs font-bold text-fg truncate">
                            {device.nickname || device.name}
                          </span>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-[10px] font-mono text-muted truncate">{device.id}</span>
                            <span className="text-[10px] font-mono text-cyan-400/80 bg-cyan-950/60 px-1.5 py-0.2 rounded border border-cyan-800/40">
                              {device.rssi ? `${device.rssi} dBm` : signalStrength}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {isCurrent ? (
                          <span className="px-2.5 py-1 rounded-full text-mini font-mono font-bold bg-cyan-500/20 border border-cyan-400/40 text-cyan-300">
                            Connected
                          </span>
                        ) : (
                          <button
                            onClick={() => handleConnect(device)}
                            disabled={connState === 'connecting'}
                            className="h-8 px-3.5 rounded-full bg-cyan-600/90 hover:bg-cyan-500 text-white text-xs font-bold transition-all disabled:opacity-50 cursor-pointer shadow"
                          >
                            Connect
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Offline Storage & Safety Notice */}
            <div className="pt-3 border-t border-line-strong/50 flex items-center justify-between text-mini text-muted">
              <div className="flex items-center gap-1.5">
                <Lock className="w-3 h-3 text-emerald-400" />
                <span>Zero Cloud Storage</span>
              </div>
              <button
                onClick={handleClearHistory}
                className="hover:text-rose-400 transition-colors flex items-center gap-1 text-mini font-semibold cursor-pointer"
                title="Clear local messages"
              >
                <Trash2 className="w-3 h-3" />
                <span>Clear Offline History</span>
              </button>
            </div>
          </div>
        </div>

        {/* Right Column (7 cols): Active Offline Emergency Chat */}
        <div className="lg:col-span-7">
          <div className="glass rounded-panel border border-line-strong/70 shadow-2xl flex flex-col h-[620px] overflow-hidden">
            {/* Active Chat Header */}
            <div className="p-3.5 sm:p-4 bg-surface-2/90 border-b border-line-strong/70 flex items-center justify-between gap-3 shrink-0">
              <div className="flex items-center gap-3 min-w-0">
                <div
                  className={`w-3.5 h-3.5 rounded-full shrink-0 ${
                    connState === 'connected'
                      ? 'bg-blue-400 animate-pulse ring-4 ring-blue-500/20'
                      : connState === 'connecting'
                      ? 'bg-amber-400 animate-ping'
                      : 'bg-slate-600'
                  }`}
                />
                <div className="flex flex-col min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs sm:text-sm font-bold text-fg truncate">
                      {connectedPeer ? connectedPeer.nickname || connectedPeer.name : 'No Active Peer Connected'}
                    </span>
                    {connectedPeer && (
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-blue-950/80 border border-blue-500/40 text-blue-300">
                        🔵 Connected via Bluetooth
                      </span>
                    )}
                  </div>
                  <span className="text-[10px] font-mono text-muted truncate">
                    {connectedPeer
                      ? `Peer ID: ${connectedPeer.id} • Radio 2.4GHz Direct P2P`
                      : 'Select a discovered Floody device on the left to start communicating'}
                  </span>
                </div>
              </div>

              {connectedPeer && (
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={handleDisconnect}
                    className="h-7 px-2.5 rounded-full bg-surface hover:bg-rose-950/50 border border-line-strong hover:border-rose-500/40 text-fg-soft hover:text-rose-300 text-mini font-semibold transition-colors cursor-pointer"
                  >
                    Disconnect
                  </button>
                </div>
              )}
            </div>

            {/* Chat Body Message Stream */}
            <div className="flex-1 p-4 overflow-y-auto space-y-3.5 bg-bg/40">
              {!connectedPeer ? (
                <div className="h-full flex flex-col items-center justify-center text-center p-6 text-muted space-y-3">
                  <div className="w-16 h-16 rounded-full bg-surface-2 border border-line flex items-center justify-center text-cyan-400/60 shadow-inner">
                    <Radio className="w-8 h-8" />
                  </div>
                  <div className="max-w-md space-y-1">
                    <h3 className="text-sm font-bold text-fg">Direct Offline Emergency Messaging</h3>
                    <p className="text-xs text-muted leading-relaxed">
                      Connect to a nearby resident, volunteer, or rescue officer in your sector. All communications operate directly over device Bluetooth radios without cellular towers or internet servers.
                    </p>
                  </div>
                </div>
              ) : messages.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center p-6 text-muted space-y-2">
                  <span className="text-xs font-mono text-cyan-300">Direct Bluetooth Connection Established</span>
                  <p className="text-xs text-muted max-w-sm">
                    Say hello or select a quick emergency distress message below. Messages are verified with delivery acknowledgements (ACK).
                  </p>
                </div>
              ) : (
                messages.map((msg) => {
                  const isEmergency = msg.priority === 'emergency' || msg.type === 'sos';
                  const timeFormatted = new Date(msg.timestamp).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                  });

                  return (
                    <div
                      key={msg.id}
                      className={`flex flex-col ${msg.isSelf ? 'items-end' : 'items-start'} space-y-1`}
                    >
                      <div className="flex items-center gap-1.5 text-[10px] font-mono text-muted px-1">
                        <span>{msg.isSelf ? 'You' : msg.senderNick || msg.senderId}</span>
                        <span>•</span>
                        <span>{timeFormatted}</span>
                      </div>

                      <div
                        className={`max-w-[85%] sm:max-w-[75%] rounded-2xl p-3 text-xs leading-relaxed shadow-lg relative ${
                          isEmergency
                            ? 'bg-gradient-to-br from-rose-950/90 to-red-900/90 border-2 border-rose-500 text-white shadow-[0_0_20px_rgba(244,63,94,0.3)] animate-pulse'
                            : msg.isSelf
                            ? 'bg-gradient-to-br from-cyan-600/90 to-blue-700/90 text-white border border-cyan-400/40 rounded-tr-none'
                            : 'bg-surface-2 border border-line-strong/80 text-fg rounded-tl-none'
                        }`}
                      >
                        {isEmergency && (
                          <div className="flex items-center gap-1 text-[10px] font-mono font-bold uppercase tracking-wider text-rose-300 pb-1 mb-1 border-b border-rose-500/40">
                            <ShieldAlert className="w-3 h-3 text-rose-400" />
                            <span>Emergency Priority Distress</span>
                          </div>
                        )}

                        <p className="whitespace-pre-wrap break-words">{msg.content}</p>

                        {/* Delivery Status Indicator for Self Messages */}
                        {msg.isSelf && (
                          <div className="flex items-center justify-end gap-1 mt-1 text-[10px] font-mono text-cyan-200/80">
                            {msg.status === 'delivered' ? (
                              <span className="flex items-center gap-1 text-emerald-300 font-bold">
                                <CheckCheck className="w-3 h-3" />
                                <span>Delivered ✓</span>
                              </span>
                            ) : msg.status === 'sent' ? (
                              <span className="flex items-center gap-1 text-cyan-200">
                                <Check className="w-3 h-3" />
                                <span>Sent</span>
                              </span>
                            ) : msg.status === 'failed' ? (
                              <span className="flex items-center gap-1 text-rose-400">
                                <AlertTriangle className="w-3 h-3" />
                                <span>Failed</span>
                              </span>
                            ) : (
                              <span className="flex items-center gap-1 text-amber-300">
                                <Clock className="w-3 h-3 animate-spin" />
                                <span>Pending...</span>
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Quick Emergency Messages Strip */}
            {connectedPeer && (
              <div className="px-3 py-2 bg-surface-2/60 border-t border-line-strong/50 overflow-x-auto flex items-center gap-1.5 no-scrollbar">
                <span className="text-[10px] font-mono text-muted uppercase shrink-0 pr-1">Quick:</span>
                {EMERGENCY_QUICK_PRESETS.map((preset) => (
                  <button
                    key={preset.id}
                    onClick={() => handleSendQuick(preset.id)}
                    className="h-6 px-2.5 rounded-full bg-surface border border-line-strong hover:border-accent/50 text-[11px] font-medium text-fg-soft hover:text-white whitespace-nowrap flex items-center gap-1 transition-all cursor-pointer shrink-0 shadow-sm"
                  >
                    <span>{preset.icon}</span>
                    <span>{preset.label}</span>
                  </button>
                ))}
              </div>
            )}

            {/* Bottom Controls: SOS Button & Text Input */}
            <div className="p-3 sm:p-4 bg-surface-2/90 border-t border-line-strong/70 flex flex-col gap-2.5 shrink-0">
              <div className="flex items-center gap-2">
                {/* Prominent High-Priority 🆘 SOS Button with Hold Protection */}
                <div className="relative shrink-0">
                  <button
                    disabled={!connectedPeer}
                    onMouseDown={handleSosMouseDown}
                    onMouseUp={handleSosMouseUp}
                    onTouchStart={handleSosMouseDown}
                    onTouchEnd={handleSosMouseUp}
                    onClick={() => {
                      if (sosHoldProgress === 0) setShowSosModal(true);
                    }}
                    className={`h-11 px-4 rounded-xl font-extrabold text-xs tracking-wider uppercase transition-all shadow-lg flex items-center gap-1.5 cursor-pointer relative overflow-hidden select-none disabled:opacity-40 ${
                      connectedPeer
                        ? 'bg-gradient-to-r from-rose-600 to-red-600 hover:from-rose-500 hover:to-red-500 text-white border border-rose-400/60 shadow-[0_0_15px_rgba(225,29,72,0.4)]'
                        : 'bg-surface-3 text-muted border border-line'
                    }`}
                    title="Click for SOS Modal, or Hold 1.5s to Instantly Transmit Distress Signal"
                  >
                    {/* Hold Progress Fill Bar */}
                    {sosHoldProgress > 0 && (
                      <div
                        className="absolute inset-0 bg-rose-400/50 transition-all pointer-events-none"
                        style={{ width: `${sosHoldProgress}%` }}
                      />
                    )}
                    <span className="relative z-10 flex items-center gap-1">
                      <span className="text-base">🆘</span>
                      <span>SOS Alert</span>
                    </span>
                  </button>
                </div>

                {/* Standard Message Form */}
                <form onSubmit={handleSendMessage} className="flex-1 flex items-center gap-2">
                  <div className="relative flex-1">
                    <input
                      type="text"
                      disabled={!connectedPeer || isSending}
                      value={messageInput}
                      onChange={(e) => setMessageInput(e.target.value.slice(0, 500))}
                      placeholder={
                        connectedPeer
                          ? 'Type offline emergency message (Max 500 chars)...'
                          : 'Connect to a nearby device to chat...'
                      }
                      className="w-full h-11 px-3.5 text-xs bg-bg/90 border border-line-strong/80 rounded-xl text-fg placeholder:text-muted focus:outline-none focus:border-cyan-400 disabled:opacity-50 pr-14"
                    />
                    <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] font-mono text-muted pointer-events-none">
                      {messageInput.length}/500
                    </span>
                  </div>

                  <button
                    type="submit"
                    disabled={!connectedPeer || !messageInput.trim() || isSending}
                    className="h-11 px-4 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-bold text-xs flex items-center gap-1.5 transition-all disabled:opacity-40 cursor-pointer shadow-md"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Send</span>
                  </button>
                </form>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* SOS Confirmation Modal (if not triggered via press-and-hold) */}
      {showSosModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fadeIn">
          <div className="glass max-w-md w-full p-6 rounded-panel border-2 border-rose-500 shadow-[0_0_40px_rgba(244,63,94,0.4)] space-y-4 text-center">
            <div className="w-16 h-16 rounded-full bg-rose-500/20 border border-rose-400/50 flex items-center justify-center text-rose-400 mx-auto animate-bounce">
              <ShieldAlert className="w-8 h-8" />
            </div>

            <div className="space-y-1.5">
              <h3 className="text-xl font-extrabold text-white">Broadcast Emergency SOS?</h3>
              <p className="text-xs text-rose-200 leading-relaxed">
                This will transmit a high-priority distress signal directly to connected Bluetooth peers:
                <br />
                <strong className="text-white font-mono mt-1 block">"🆘 SOS: Immediate assistance required."</strong>
              </p>
            </div>

            <div className="flex items-center justify-center gap-3 pt-2">
              <button
                onClick={() => setShowSosModal(false)}
                className="px-4 py-2.5 rounded-full bg-surface-2 hover:bg-surface-3 text-fg text-xs font-semibold border border-line-strong transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleTriggerSOS}
                className="px-6 py-2.5 rounded-full bg-gradient-to-r from-rose-600 to-red-600 hover:from-rose-500 hover:to-red-500 text-white text-xs font-extrabold shadow-lg shadow-rose-900/50 border border-rose-400 transition-all cursor-pointer"
              >
                Confirm &amp; Send SOS
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Automated Diagnostic Self-Test Loop Modal */}
      {showDiagnosticModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-fadeIn">
          <div className="glass max-w-2xl w-full p-5 sm:p-6 rounded-panel border border-cyan-500/50 shadow-[0_0_50px_rgba(6,182,212,0.25)] space-y-5 max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between border-b border-line-strong/60 pb-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-cyan-500/20 border border-cyan-400/40 flex items-center justify-center text-cyan-300">
                  <Activity className="w-5 h-5 animate-pulse" />
                </div>
                <div>
                  <h3 className="text-base sm:text-lg font-extrabold text-fg flex items-center gap-2">
                    <span>Bluetooth Diagnostic Self-Test Loop</span>
                  </h3>
                  <p className="text-xs text-muted">
                    Automated loop verification for adapter radio, serialization, 160-byte chunking, and storage.
                  </p>
                </div>
              </div>

              <button
                onClick={() => setShowDiagnosticModal(false)}
                className="text-muted hover:text-fg text-sm font-mono px-2 py-1 rounded-md hover:bg-surface-2 transition-colors cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Diagnostic Control Bar */}
            <div className="flex flex-wrap items-center justify-between gap-2.5 bg-bg/80 border border-line-strong/60 rounded-card p-3">
              <div className="flex items-center gap-2">
                <button
                  onClick={handleRunDiagnosticLoop}
                  disabled={isRunningDiagnostic}
                  className="px-3.5 py-1.5 rounded-full bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-bold text-xs flex items-center gap-1.5 transition-all disabled:opacity-50 cursor-pointer shadow-md"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isRunningDiagnostic ? 'animate-spin' : ''}`} />
                  <span>{isRunningDiagnostic ? 'Running Loops...' : 'Run Test Loop Again'}</span>
                </button>

                <button
                  onClick={handleToggleContinuousLoop}
                  className={`px-3 py-1.5 rounded-full text-xs font-mono font-semibold border transition-all cursor-pointer flex items-center gap-1.5 ${
                    isContinuousLoopActive
                      ? 'bg-emerald-950/80 border-emerald-500/50 text-emerald-300'
                      : 'bg-surface border-line text-muted hover:text-fg'
                  }`}
                >
                  <span className={`w-2 h-2 rounded-full ${isContinuousLoopActive ? 'bg-emerald-400 animate-ping' : 'bg-muted'}`} />
                  <span>Auto-Loop (15s): {isContinuousLoopActive ? 'ACTIVE' : 'OFF'}</span>
                </button>
              </div>

              {diagnosticSummary && (
                <span className="text-[11px] font-mono text-cyan-300">
                  Last checked: {new Date(diagnosticSummary.timestamp).toLocaleTimeString()}
                </span>
              )}
            </div>

            {/* Diagnostic Check Cards */}
            <div className="space-y-2.5">
              {isRunningDiagnostic && !diagnosticSummary && (
                <div className="p-8 text-center space-y-3">
                  <RefreshCw className="w-8 h-8 animate-spin text-cyan-400 mx-auto" />
                  <p className="text-xs font-mono text-cyan-300">Executing multi-layer diagnostic loops...</p>
                </div>
              )}

              {diagnosticSummary &&
                diagnosticSummary.checks.map((check) => (
                  <div
                    key={check.id}
                    className={`p-3 rounded-xl border flex items-start justify-between gap-3 transition-all ${
                      check.status === 'passed'
                        ? 'bg-emerald-950/20 border-emerald-500/30'
                        : 'bg-rose-950/20 border-rose-500/40'
                    }`}
                  >
                    <div className="flex items-start gap-2.5">
                      {check.status === 'passed' ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                      ) : (
                        <XCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                      )}
                      <div>
                        <h4 className="text-xs font-bold text-fg">{check.name}</h4>
                        <p className="text-[11px] text-muted mt-0.5 leading-relaxed">{check.details}</p>
                      </div>
                    </div>

                    <div className="flex flex-col items-end shrink-0">
                      <span
                        className={`text-[10px] font-mono uppercase font-bold px-2 py-0.5 rounded ${
                          check.status === 'passed'
                            ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                            : 'bg-rose-500/15 text-rose-300 border border-rose-500/30'
                        }`}
                      >
                        {check.status}
                      </span>
                      {typeof check.durationMs === 'number' && (
                        <span className="text-[10px] font-mono text-muted mt-1">{check.durationMs}ms</span>
                      )}
                    </div>
                  </div>
                ))}
            </div>

            {/* Summary Banner */}
            {diagnosticSummary && (
              <div
                className={`p-3.5 rounded-xl border flex items-center justify-between text-xs font-semibold ${
                  diagnosticSummary.overallHealthy
                    ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-200'
                    : 'bg-rose-500/15 border-rose-500/40 text-rose-200'
                }`}
              >
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 shrink-0 text-emerald-400" />
                  <span>{diagnosticSummary.summary}</span>
                </div>
                <button
                  onClick={() => setShowDiagnosticModal(false)}
                  className="px-3 py-1 rounded-md bg-white/10 hover:bg-white/20 text-white text-[11px] transition-colors cursor-pointer shrink-0 ml-2"
                >
                  Close
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
