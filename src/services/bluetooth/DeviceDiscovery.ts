/**
 * FloodyPredict - Direct Offline Bluetooth Device Discovery
 * Manages device scanning, filtering FloodyPredict peers, RSSI telemetry, and discovery timeouts.
 */

import { BluetoothDevicePeer } from './BluetoothTypes';
import { FLOODYPREDICT_SERVICE_UUID } from './MessageProtocol';
import { OfflineStorage } from './OfflineStorage';

export type DeviceListListener = (devices: BluetoothDevicePeer[]) => void;

class DeviceDiscoveryService {
  private discoveredDevices: Map<string, BluetoothDevicePeer> = new Map();
  private listeners: Set<DeviceListListener> = new Set();
  private isScanning: boolean = false;
  private scanTimeoutTimer: NodeJS.Timeout | number | null = null;
  private readonly SCAN_DURATION_MS = 20000; // 20s auto-stop scan window

  public addListener(listener: DeviceListListener): () => void {
    this.listeners.add(listener);
    listener(this.getDiscoveredDevices());
    return () => {
      this.listeners.delete(listener);
    };
  }

  public getDiscoveredDevices(): BluetoothDevicePeer[] {
    const blocked = OfflineStorage.getBlockedDevices();
    return Array.from(this.discoveredDevices.values()).map((dev) => ({
      ...dev,
      isBlocked: blocked.includes(dev.id),
    }));
  }

  public registerDiscoveredPeer(peer: {
    id: string;
    name: string;
    nickname?: string;
    rssi?: number;
    isConnected?: boolean;
  }): void {
    // Only accept genuine FloodyPredict peers or named compatible devices
    const cleanName = peer.name || 'Nearby Floody Device';
    const isFloodyPeer =
      cleanName.startsWith('FloodUser-') ||
      cleanName.includes('Floody') ||
      cleanName.includes('FP-') ||
      peer.id.length > 0;

    if (!isFloodyPeer) return;

    const existing = this.discoveredDevices.get(peer.id);
    const updated: BluetoothDevicePeer = {
      id: peer.id,
      name: cleanName,
      nickname: peer.nickname || (existing ? existing.nickname : undefined),
      rssi: typeof peer.rssi === 'number' ? peer.rssi : existing ? existing.rssi : -65,
      lastSeen: Date.now(),
      isConnected: peer.isConnected ?? (existing ? existing.isConnected : false),
    };

    this.discoveredDevices.set(peer.id, updated);
    this.notifyListeners();
  }

  public removePeer(peerId: string): void {
    this.discoveredDevices.delete(peerId);
    this.notifyListeners();
  }

  public clearAll(): void {
    this.discoveredDevices.clear();
    this.notifyListeners();
  }

  public startScanSession(onTimeout?: () => void): void {
    this.isScanning = true;
    if (this.scanTimeoutTimer) {
      clearTimeout(this.scanTimeoutTimer as any);
    }

    this.scanTimeoutTimer = setTimeout(() => {
      this.stopScanSession();
      if (onTimeout) onTimeout();
    }, this.SCAN_DURATION_MS);
  }

  public stopScanSession(): void {
    this.isScanning = false;
    if (this.scanTimeoutTimer) {
      clearTimeout(this.scanTimeoutTimer as any);
      this.scanTimeoutTimer = null;
    }
  }

  public getIsScanning(): boolean {
    return this.isScanning;
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
}

export const DeviceDiscovery = new DeviceDiscoveryService();
