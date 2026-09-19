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
import { DeviceDiscovery, SweepStatus } from '../services/bluetooth/DeviceDiscovery';
import { BluetoothSupport, DiscoverySource } from '../services/bluetooth/WebBluetoothScanner';
import { arm, isArmed, isMuted, isSupported, notifyIncoming, setMuted } from '../utils/alertSound';
import { NearbyLinkPanel } from './NearbyLinkPanel';
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
  Plus,
  SearchX,
  Volume2,
  VolumeX,
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
  const [support, setSupport] = useState<BluetoothSupport | null>(null);
  const [sweep, setSweep] = useState<SweepStatus | null>(null);
  const [scanNotice, setScanNotice] = useState<string | null>(null);
  const [isAddingDevice, setIsAddingDevice] = useState(false);
  const [soundMuted, setSoundMuted] = useState(isMuted);
  const [soundArmed, setSoundArmed] = useState(isArmed);
  // Ids already announced, so re-reading storage cannot re-ring old messages.
  const announcedRef = useRef<Set<string>>(new Set());
  const soundPrimedRef = useRef(false);
  // Re-renders the 'seen 3s ago' labels without touching the device list.
  const [, setTick] = useState(0);

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
        // A new conversation gets a clean slate, so its history is shown
        // rather than announced.
        soundPrimedRef.current = false;
        announcedRef.current.clear();
        loadMessagesForPeer(peer.id);
      }
    });

    const unsubDiscovery = DeviceDiscovery.addListener((devices) => {
      setDiscoveredDevices(devices);
      setIsScanning(DeviceDiscovery.getIsScanning());
    });

    const unsubSweep = DeviceDiscovery.addSweepListener((status) => {
      setSweep(status);
      setScanNotice(BluetoothService.getScanNotice());
    });

    const unsubSupport = BluetoothService.addSupportListener(setSupport);

    const unsubHealth = ConnectionManager.addHealthListener((metrics) => {
      setHealthMetrics(metrics);
    });

    return () => {
      unsubBT();
      unsubConn();
      unsubDiscovery();
      unsubSweep();
      unsubSupport();
      unsubHealth();
      // Leaving the page must release the radio, or the scan runs forever.
      void BluetoothService.stopScan();
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
  /**
   * Reads the stored thread and rings for anything new that came from a peer.
   *
   * This runs on a 600ms poll, so "new" has to mean "not announced before"
   * rather than "not in the previous render" - otherwise every poll would
   * re-ring the whole thread. The first load of a conversation is marked as
   * already-announced for the same reason: opening a chat should not replay
   * every alert it ever received.
   */
  const loadMessagesForPeer = (peerId: string) => {
    const msgs = OfflineStorage.getMessages(peerId);
    const seen = announcedRef.current;

    if (!soundPrimedRef.current) {
      for (const m of msgs) seen.add(m.id);
      soundPrimedRef.current = true;
    } else {
      let ring: 'sos' | 'message' | null = null;
      for (const m of msgs) {
        if (seen.has(m.id)) continue;
        seen.add(m.id);
        // Our own messages, delivery receipts and liveness probes are not
        // things a person needs to be alerted to.
        if (m.isSelf || m.type === 'ack' || m.type === 'ping' || m.type === 'pong') continue;
        if (m.type === 'sos' || m.priority === 'emergency') ring = 'sos';
        else if (!ring) ring = 'message';
      }
      if (ring) notifyIncoming(ring);
    }

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

  /*
   * The first touch anywhere on the page arms audio, and that can happen
   * outside this component, so the indicator is polled until it flips rather
   * than assuming a click on the toggle was the trigger.
   */
  useEffect(() => {
    if (soundArmed) return;
    const t = setInterval(() => {
      if (isArmed()) {
        setSoundArmed(true);
        clearInterval(t);
      }
    }, 500);
    return () => clearInterval(t);
  }, [soundArmed]);

  // Keeps the "last seen" labels honest while a scan is running.
  useEffect(() => {
    if (!isScanning) return;
    const t = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [isScanning]);

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
      void BluetoothService.stopScan();
      setIsScanning(false);
    } else {
      setScanNotice(null);
      void BluetoothService.startScan().then(() => setScanNotice(BluetoothService.getScanNotice()));
      setIsScanning(true);
    }
  };

  /**
   * Opens the browser chooser.
   *
   * Called straight from the click handler on purpose: requestDevice only
   * works inside a user gesture, so anything awaited before it would lose
   * the gesture and the chooser would refuse to open.
   */
  const handleAddDevice = async () => {
    setIsAddingDevice(true);
    setScanNotice(null);
    try {
      const result = await BluetoothService.addDeviceViaChooser();
      if (!result.ok && result.reason) setScanNotice(result.reason);
      if (result.ok && !isScanning) {
        void BluetoothService.startScan();
        setIsScanning(true);
      }
    } finally {
      setIsAddingDevice(false);
    }
  };

  const handleConnect = async (peer: BluetoothDevicePeer) => {
    setScanNotice(null);
    const ok = await BluetoothService.connectToDevice(peer);
    if (!ok) setScanNotice(BluetoothService.getScanNotice());
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

  const soundSupported = isSupported();

  /**
   * Turns the alert tone on or off.
   *
   * Arming has to happen inside this click: iOS only resumes a suspended
   * AudioContext from a real gesture handler, so doing it any later leaves
   * the chat permanently silent.
   */
  const handleToggleSound = () => {
    if (!soundArmed) {
      arm();
      setSoundArmed(isArmed());
      if (isMuted()) {
        setMuted(false);
        setSoundMuted(false);
      }
      notifyIncoming('message'); // Confirms it works, audibly.
      return;
    }
    const next = !soundMuted;
    setMuted(next);
    setSoundMuted(next);
    if (!next) notifyIncoming('message');
  };

  const isNative = BluetoothService.isNativeAvailable();
  const canUseChooser = !isNative && !!support?.hasApi;
  const realDevices = discoveredDevices.filter((d) => d.source !== 'demo');
  // "In range" means heard from in the last 12 seconds. A device you granted
  // access to once is not evidence that it is here now, so it is listed but
  // not counted.
  const inRangeDevices = realDevices.filter((d) => d.inRange);

  const secondsAgo = (t: number) => Math.max(0, Math.round((Date.now() - t) / 1000));

  /** Whether a chat can actually be opened to this device from here. */
  const canChatWith = (device: BluetoothDevicePeer) =>
    isNative || device.source === 'demo' || device.source === 'local-link';

  const SOURCE_LABEL: Record<DiscoverySource, { text: string; className: string }> = {
    native: { text: 'Phone radio', className: 'bg-emerald-500/15 border-emerald-400/30 text-emerald-300' },
    'web-scan': { text: 'Live scan', className: 'bg-cyan-500/15 border-cyan-400/30 text-cyan-300' },
    'web-remembered': { text: 'Allowed before', className: 'bg-blue-500/15 border-blue-400/30 text-blue-300' },
    'web-chooser': { text: 'You picked it', className: 'bg-indigo-500/15 border-indigo-400/30 text-indigo-300' },
    'local-link': {
      text: 'Wi-Fi direct',
      className: 'bg-emerald-500/15 border-emerald-400/40 text-emerald-300',
    },
    demo: { text: 'Demo - not real', className: 'bg-purple-500/20 border-purple-400/40 text-purple-300' },
  };

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
                    {/*
                      This said "Browser - no radio" on every browser, which
                      is now wrong in the common case: Chrome and Edge do
                      reach the radio. It reports what was actually found.
                    */}
                    <span>
                      {isSimMode
                        ? 'Walkthrough mode'
                        : !support
                        ? 'Checking radio'
                        : !support.hasApi
                        ? 'Browser - no radio'
                        : support.adapterAvailable === false
                        ? 'Bluetooth off'
                        : 'Browser radio - finding devices only'}
                    </span>
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
          {/*
            First, because it is the one route that actually carries a
            message between two phones in a browser. Bluetooth discovery
            below it can find devices but cannot chat to them.
          */}
          <NearbyLinkPanel />
          <div
            data-testid="nearby-panel"
            className="glass rounded-panel p-4 sm:p-5 border border-line-strong/60 shadow-xl flex flex-col gap-4"
          >
            <div className="flex items-center justify-between pb-3 border-b border-line-strong/50">
              <div className="flex items-center gap-2">
                <Radio className={`w-4 h-4 ${isScanning ? 'text-cyan-400 animate-spin' : 'text-muted'}`} />
                <h2 className="font-bold text-sm sm:text-base text-fg">Nearby FloodyPredict Users</h2>
              </div>
              {/* Demo peers are counted separately so the real number is never inflated. */}
              <span
                className="text-xs font-mono px-2 py-0.5 rounded bg-surface-2 text-cyan-300 border border-cyan-500/20"
                title="Devices actually heard from in the last 12 seconds"
                data-testid="device-count"
              >
                {inRangeDevices.length} in range
                {realDevices.length > inRangeDevices.length &&
                  ` + ${realDevices.length - inRangeDevices.length} allowed`}
                {discoveredDevices.length > realDevices.length &&
                  ` + ${discoveredDevices.length - realDevices.length} demo`}
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

              {canUseChooser && (
                <button
                  onClick={handleAddDevice}
                  disabled={isAddingDevice}
                  className="h-9 px-3 rounded-full bg-surface-2 hover:bg-surface-3 text-fg-soft border border-line-strong text-xs font-semibold flex items-center gap-1.5 transition-colors disabled:opacity-50 cursor-pointer"
                  title="Pick a device from the browser list. After this it is found automatically."
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Add device</span>
                </button>
              )}
            </div>

            {/*
              What this browser can actually do, in its own words. The old
              panel claimed "Web / PWA Bluetooth radio operational" on every
              browser including ones with no Bluetooth API, so a user on
              Firefox was told the radio was fine and left to wonder why
              nothing appeared.
            */}
            {support && (
              <p className="text-[11px] leading-relaxed text-muted bg-bg/50 border border-line/60 rounded-card px-3 py-2">
                {support.summary}
              </p>
            )}

            {scanNotice && (
              <p className="text-[11px] leading-relaxed text-amber-300 bg-amber-950/30 border border-amber-500/30 rounded-card px-3 py-2">
                {scanNotice}
              </p>
            )}

            {/* Proof the loop is running, and that it removes as well as adds. */}
            {isScanning && sweep && sweep.sweeps > 0 && (
              <div
                data-testid="sweep-status"
                className="flex items-center justify-between text-[10px] font-mono text-muted px-1"
              >
                <span>
                  Checked {sweep.sweeps}x &middot; {sweep.present} in range
                </span>
                <span>
                  {sweep.droppedForSilence > 0
                    ? `${sweep.droppedForSilence} went out of range`
                    : 'Re-checking every 2s'}
                </span>
              </div>
            )}

            {/* Discovered Devices List */}
            <div className="space-y-2.5 max-h-[420px] overflow-y-auto pr-1">
              {discoveredDevices.length === 0 ? (
                <div className="p-8 text-center bg-bg/50 rounded-card border border-dashed border-line-strong/60 flex flex-col items-center gap-3">
                  <div className="w-12 h-12 rounded-full bg-surface-2 flex items-center justify-center text-muted">
                    {isScanning ? (
                      <SearchX className="w-6 h-6" />
                    ) : (
                      <BluetoothOff className="w-6 h-6" />
                    )}
                  </div>
                  {/*
                    An empty list is a real answer, not a failure, so it says
                    what it means: nothing is in range. What it suggests next
                    depends on what this browser can do, because telling
                    someone to keep scanning on a browser that cannot scan is
                    worse than saying nothing.
                  */}
                  <div className="flex flex-col gap-1">
                    {!support?.hasApi && !isNative ? (
                      <>
                        <span className="text-xs font-bold text-fg">
                          This browser cannot reach a Bluetooth radio
                        </span>
                        <span className="text-[11px] text-muted max-w-sm leading-relaxed">
                          {support?.summary}
                        </span>
                      </>
                    ) : support?.adapterAvailable === false ? (
                      <>
                        <span className="text-xs font-bold text-fg">Bluetooth is switched off</span>
                        <span className="text-[11px] text-muted max-w-sm leading-relaxed">
                          Turn Bluetooth on for this device, then scan again.
                        </span>
                      </>
                    ) : isScanning ? (
                      <>
                        <span className="text-xs font-bold text-fg">
                          Listening &mdash; nothing in range yet
                        </span>
                        <span className="text-[11px] text-muted max-w-sm leading-relaxed">
                          Nearby devices appear here on their own as soon as they are heard,
                          and drop off after {Math.round(DeviceDiscovery.getPresenceTimeoutMs() / 1000)}{' '}
                          seconds of silence. Nothing is listed that was not actually detected.
                        </span>
                      </>
                    ) : (
                      <>
                        <span className="text-xs font-bold text-fg">Not scanning</span>
                        <span className="text-[11px] text-muted max-w-sm leading-relaxed">
                          Start a scan to see what is near you right now.
                        </span>
                      </>
                    )}
                  </div>

                  {/*
                    Phone-to-phone chat is a separate capability from finding
                    a device, and only the second one works in a browser.
                    Saying so here stops the empty list from being read as the
                    reason chat does not work.
                  */}
                  {!isNative && support?.hasApi && (
                    <span className="text-[10px] text-subtle max-w-sm leading-relaxed border-t border-line/50 pt-2">
                      A browser can find nearby devices but cannot open a chat to another
                      phone &mdash; that needs the Android app installed on both handsets.
                    </span>
                  )}

                  {!isSimMode && (
                    <button
                      onClick={handleToggleSimulation}
                      className="text-mini font-mono text-cyan-400 hover:underline mt-1 cursor-pointer"
                    >
                      Run the two-device walkthrough instead
                    </button>
                  )}
                </div>
              ) : (
                discoveredDevices.map((device) => {
                  const isCurrent = connectedPeer?.id === device.id;
                  // No reading means no claim. The old default of 'Good' was
                  // the most optimistic label available, applied precisely
                  // when nothing was known.
                  const signalStrength =
                    typeof device.rssi !== 'number'
                      ? 'unknown'
                      : device.rssi > -65
                      ? 'strong'
                      : device.rssi > -80
                      ? 'medium'
                      : 'weak';

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
                          <div className="flex flex-wrap items-center gap-1.5 mt-1">
                            {device.source && (
                              <span
                                className={`text-[9px] font-mono font-bold px-1.5 py-0.5 rounded border uppercase tracking-wide ${
                                  SOURCE_LABEL[device.source].className
                                }`}
                              >
                                {SOURCE_LABEL[device.source].text}
                              </span>
                            )}
                            {/*
                              An absent RSSI stays absent. It used to default
                              to -65 dBm, which put a measured-looking signal
                              strength on a device that had never reported one.
                            */}
                            {typeof device.rssi === 'number' && device.inRange ? (
                              <span className="text-[10px] font-mono text-cyan-400/80 bg-cyan-950/60 px-1.5 py-0.5 rounded border border-cyan-800/40">
                                {device.rssi} dBm &middot; {signalStrength}
                              </span>
                            ) : (
                              <span className="text-[10px] font-mono text-muted bg-surface-2 px-1.5 py-0.5 rounded border border-line">
                                no signal reading
                              </span>
                            )}
                            {device.inRange ? (
                              <span className="text-[10px] font-mono text-subtle">
                                heard {secondsAgo(device.lastHeardAt ?? device.lastSeen)}s ago
                              </span>
                            ) : (
                              <span className="text-[10px] font-mono text-amber-400/80">
                                allowed, not answering now
                              </span>
                            )}
                          </div>
                          <span className="text-[9px] font-mono text-subtle truncate mt-0.5">
                            {device.id}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {isCurrent ? (
                          <span className="px-2.5 py-1 rounded-full text-mini font-mono font-bold bg-cyan-500/20 border border-cyan-400/40 text-cyan-300">
                            Connected
                          </span>
                        ) : canChatWith(device) ? (
                          <button
                            onClick={() => handleConnect(device)}
                            disabled={connState === 'connecting'}
                            className="h-8 px-3.5 rounded-full bg-cyan-600/90 hover:bg-cyan-500 text-white text-xs font-bold transition-all disabled:opacity-50 cursor-pointer shadow"
                          >
                            Connect
                          </button>
                        ) : (
                          // Offering Connect here would be offering something
                          // that cannot happen; the button used to report
                          // success and send nothing.
                          <span
                            className="h-8 px-3 rounded-full border border-line bg-surface-2/70 text-muted text-[10px] font-semibold flex items-center"
                            title="A browser can find this device but cannot open a chat to it. Messaging needs the Android app on both phones."
                          >
                            Needs the app
                          </span>
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

              <div className="flex items-center gap-2 shrink-0">
                {/*
                  The alert tone is the whole reason this works from a pocket,
                  so its state is shown rather than assumed. Browsers refuse
                  to make a sound before the first touch, and an alert that
                  silently never fires is the worst failure this screen has.
                */}
                {soundSupported && (
                  <button
                    onClick={handleToggleSound}
                    data-testid="sound-toggle"
                    title={
                      soundMuted
                        ? 'Alert sound is off. Tap to turn it on.'
                        : soundArmed
                        ? 'Alert sound is on. Tap to mute.'
                        : 'Tap to turn the alert sound on for this device.'
                    }
                    className={`h-7 px-2.5 rounded-full border text-mini font-semibold flex items-center gap-1.5 transition-colors cursor-pointer ${
                      soundMuted || !soundArmed
                        ? 'bg-surface border-line-strong text-muted hover:text-fg'
                        : 'bg-emerald-950/50 border-emerald-500/40 text-emerald-300'
                    }`}
                  >
                    {soundMuted || !soundArmed ? (
                      <VolumeX className="w-3.5 h-3.5" />
                    ) : (
                      <Volume2 className="w-3.5 h-3.5" />
                    )}
                    <span className="hidden sm:inline">
                      {soundMuted ? 'Sound off' : soundArmed ? 'Sound on' : 'Enable sound'}
                    </span>
                  </button>
                )}
                {connectedPeer && (
                  <button
                    onClick={handleDisconnect}
                    className="h-7 px-2.5 rounded-full bg-surface hover:bg-rose-950/50 border border-line-strong hover:border-rose-500/40 text-fg-soft hover:text-rose-300 text-mini font-semibold transition-colors cursor-pointer"
                  >
                    Disconnect
                  </button>
                )}
              </div>
            </div>

            {soundSupported && !soundArmed && !soundMuted && (
              <button
                onClick={handleToggleSound}
                data-testid="sound-warning"
                className="w-full px-4 py-2 bg-amber-950/40 border-b border-amber-500/30 text-amber-200 text-[11px] leading-relaxed text-left cursor-pointer"
              >
                <strong>Tap here to turn on the alert sound.</strong> Until you do, this phone
                stays silent when a message arrives &mdash; phones block sound until you touch
                the page once.
              </button>
            )}

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
