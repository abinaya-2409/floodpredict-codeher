/**
 * FloodyPredict - Nearby device register and presence loop.
 *
 * The register holds what the radio has actually heard from, recently. Two
 * properties follow from that and both are deliberate:
 *
 *   - Nothing is ever added that a radio did not report. The old version
 *     accepted any peer whose id was longer than zero characters, which is
 *     every peer, and was fed three invented ones on every scan.
 *   - Devices leave. A sweep runs on a timer and drops anything not heard
 *     from within PRESENCE_TIMEOUT_MS, so walking out of range empties the
 *     list on its own. A list that only ever grows is not a list of what is
 *     nearby, it is a list of what was once nearby.
 *
 * The connected peer is exempt from the sweep. An open connection is better
 * evidence of presence than an advertisement, and BLE peripherals commonly
 * stop advertising once connected.
 */

import { BluetoothDevicePeer } from './BluetoothTypes';
import { DiscoverySource, RadioDevice } from './WebBluetoothScanner';
import { OfflineStorage } from './OfflineStorage';

export type DeviceListListener = (devices: BluetoothDevicePeer[]) => void;

export interface SweepStatus {
  /** How many sweeps have run this scan session. */
  sweeps: number;
  /** Devices currently held. */
  present: number;
  /** Dropped for going quiet, this session. */
  droppedForSilence: number;
  lastSweepAt: number;
}

export type SweepListener = (status: SweepStatus) => void;

/**
 * How long a device may go unheard before it is dropped.
 *
 * BLE advertising intervals are typically 100ms-2s, so 12s is many missed
 * advertisements rather than one unlucky gap. Too short and devices flicker
 * in and out of the list; too long and the list lies about what is in range.
 */
const PRESENCE_TIMEOUT_MS = 12000;

/** How often presence is re-checked. */
const SWEEP_INTERVAL_MS = 2000;

class DeviceDiscoveryService {
  private discoveredDevices = new Map<string, BluetoothDevicePeer>();
  private listeners = new Set<DeviceListListener>();
  private sweepListeners = new Set<SweepListener>();
  private isScanning = false;

  private sweepTimer: ReturnType<typeof setInterval> | null = null;
  private status: SweepStatus = { sweeps: 0, present: 0, droppedForSilence: 0, lastSweepAt: 0 };

  /** Set by BluetoothService so the sweep can spare the connected peer. */
  private isConnectedPeer: (id: string) => boolean = () => false;

  public setConnectedPeerCheck(fn: (id: string) => boolean): void {
    this.isConnectedPeer = fn;
  }

  public addListener(listener: DeviceListListener): () => void {
    this.listeners.add(listener);
    listener(this.getDiscoveredDevices());
    return () => {
      this.listeners.delete(listener);
    };
  }

  public addSweepListener(listener: SweepListener): () => void {
    this.sweepListeners.add(listener);
    listener(this.status);
    return () => {
      this.sweepListeners.delete(listener);
    };
  }

  public getDiscoveredDevices(): BluetoothDevicePeer[] {
    const blocked = OfflineStorage.getBlockedDevices();
    const now = Date.now();
    return Array.from(this.discoveredDevices.values())
      .map((device) => ({
        ...device,
        isBlocked: blocked.includes(device.id),
        inRange: this.inRange(device, now),
      }))
      // Devices actually in range come first; a standing grant that is not
      // answering belongs below them.
      .sort((a, b) => Number(b.inRange) - Number(a.inRange))
      // Strongest signal first, then most recently heard. A device with no
      // RSSI sorts below one with a reading rather than above everything.
      .sort((a, b) => (b.rssi ?? -127) - (a.rssi ?? -127) || b.lastSeen - a.lastSeen);
  }

  /**
   * Records that a radio heard from a device.
   *
   * Callers pass what the radio gave them. Nothing is invented here: an
   * absent RSSI stays absent rather than becoming a plausible -65, because a
   * made-up signal strength is indistinguishable from a measured one once it
   * reaches the screen.
   */
  public registerDiscoveredPeer(peer: {
    id: string;
    name: string;
    nickname?: string;
    rssi?: number;
    isConnected?: boolean;
    source?: DiscoverySource;
    /** False for a permission grant, which says nothing about being in range. */
    heard?: boolean;
  }): void {
    if (!peer.id) return;

    const existing = this.discoveredDevices.get(peer.id);
    const now = Date.now();
    // Default true: every radio path reports sightings. Only the grant list
    // passes false, and it has to say so explicitly.
    const heard = peer.heard !== false;

    this.discoveredDevices.set(peer.id, {
      id: peer.id,
      name: peer.name || existing?.name || 'Unnamed device',
      nickname: peer.nickname ?? existing?.nickname,
      rssi: typeof peer.rssi === 'number' ? peer.rssi : existing?.rssi,
      source: peer.source ?? existing?.source,
      firstSeen: existing?.firstSeen ?? now,
      lastSeen: now,
      lastHeardAt: heard ? now : existing?.lastHeardAt,
      isConnected: peer.isConnected ?? existing?.isConnected ?? false,
    });

    this.notifyListeners();
  }

  /** Heard from recently enough to call it present. */
  private inRange(device: BluetoothDevicePeer, now: number): boolean {
    if (device.isConnected || this.isConnectedPeer(device.id)) return true;
    return !!device.lastHeardAt && now - device.lastHeardAt <= PRESENCE_TIMEOUT_MS;
  }

  /** Convenience for the scanner, which speaks RadioDevice. */
  public registerRadioDevice(device: RadioDevice): void {
    this.registerDiscoveredPeer(device);
  }

  public removePeer(peerId: string): void {
    this.discoveredDevices.delete(peerId);
    this.notifyListeners();
  }

  public clearAll(): void {
    this.discoveredDevices.clear();
    this.notifyListeners();
  }

  /** Drops only the entries a given source contributed. */
  public clearSource(source: DiscoverySource): void {
    let changed = false;
    for (const [id, device] of this.discoveredDevices) {
      if (device.source === source) {
        this.discoveredDevices.delete(id);
        changed = true;
      }
    }
    if (changed) this.notifyListeners();
  }

  /**
   * Starts the presence loop.
   *
   * Unlike the previous version this has no scan duration and no auto-stop.
   * Discovery that switches itself off after twenty seconds is the reason a
   * device that arrives in the twenty-first second is never seen. It runs
   * until it is stopped.
   */
  public startScanSession(): void {
    this.isScanning = true;
    const now = Date.now();
    this.status = {
      sweeps: 0,
      present: Array.from(this.discoveredDevices.values()).filter((d) => this.inRange(d, now)).length,
      droppedForSilence: 0,
      lastSweepAt: 0,
    };

    if (this.sweepTimer) clearInterval(this.sweepTimer);
    this.sweepTimer = setInterval(() => this.sweep(), SWEEP_INTERVAL_MS);
    this.notifySweep();
  }

  public stopScanSession(): void {
    this.isScanning = false;
    if (this.sweepTimer) {
      clearInterval(this.sweepTimer);
      this.sweepTimer = null;
    }
  }

  /**
   * One pass of the presence loop: drop whatever has gone quiet.
   *
   * Exposed rather than private so a test can run a sweep without waiting
   * two seconds of wall clock for the timer.
   */
  public sweep(now: number = Date.now()): SweepStatus {
    let dropped = 0;
    let present = 0;

    for (const [id, device] of this.discoveredDevices) {
      const here = this.inRange(device, now);
      if (here) {
        present++;
        continue;
      }
      // A device the user granted stays on the list even when it is not
      // answering - they chose it, and removing it would look like a fault.
      // It simply stops counting as present. Anything found by scanning is
      // only ever a sighting, so when the sightings stop it goes.
      const isStandingGrant = device.source === 'web-remembered' || device.source === 'web-chooser';
      if (isStandingGrant) continue;

      if (now - device.lastSeen > PRESENCE_TIMEOUT_MS) {
        this.discoveredDevices.delete(id);
        dropped++;
      }
    }

    this.status = {
      sweeps: this.status.sweeps + 1,
      present,
      droppedForSilence: this.status.droppedForSilence + dropped,
      lastSweepAt: now,
    };

    if (dropped) this.notifyListeners();
    this.notifySweep();
    return this.status;
  }

  public getIsScanning(): boolean {
    return this.isScanning;
  }

  public getSweepStatus(): SweepStatus {
    return this.status;
  }

  public getPresenceTimeoutMs(): number {
    return PRESENCE_TIMEOUT_MS;
  }

  private notifyListeners(): void {
    const list = this.getDiscoveredDevices();
    for (const listener of this.listeners) {
      try {
        listener(list);
      } catch (err) {
        console.error('[DeviceDiscovery] Listener notification error:', err);
      }
    }
  }

  private notifySweep(): void {
    for (const listener of this.sweepListeners) {
      try {
        listener(this.status);
      } catch (err) {
        console.error('[DeviceDiscovery] Sweep listener error:', err);
      }
    }
  }
}

export const DeviceDiscovery = new DeviceDiscoveryService();
