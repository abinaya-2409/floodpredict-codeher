/**
 * FloodyPredict - Direct Offline Bluetooth Connection Manager
 * Manages connection state transitions, timeouts, heartbeats, and auto-reconnection.
 */

import { BluetoothDevicePeer, ConnectionState } from './BluetoothTypes';

export type ConnectionStateListener = (state: ConnectionState, peer: BluetoothDevicePeer | null) => void;

class ConnectionManagerService {
  private state: ConnectionState = 'disconnected';
  private connectedPeer: BluetoothDevicePeer | null = null;
  private listeners: Set<ConnectionStateListener> = new Set();
  private connectTimeoutTimer: NodeJS.Timeout | number | null = null;
  private heartbeatTimer: NodeJS.Timeout | number | null = null;
  private reconnectAttempts: number = 0;
  private readonly MAX_RECONNECT_ATTEMPTS = 2;
  private readonly CONNECT_TIMEOUT_MS = 15000;

  public addListener(listener: ConnectionStateListener): () => void {
    this.listeners.add(listener);
    listener(this.state, this.connectedPeer);
    return () => {
      this.listeners.delete(listener);
    };
  }

  public getState(): ConnectionState {
    return this.state;
  }

  public getConnectedPeer(): BluetoothDevicePeer | null {
    return this.connectedPeer;
  }

  public isConnected(): boolean {
    return this.state === 'connected' && this.connectedPeer !== null;
  }

  /**
   * Sets connection state and notifies all subscribers
   */
  public setState(newState: ConnectionState, peer: BluetoothDevicePeer | null = this.connectedPeer): void {
    this.state = newState;
    this.connectedPeer = peer;

    if (newState === 'connected') {
      this.clearConnectTimeout();
      this.reconnectAttempts = 0;
      this.startHeartbeat();
    } else if (newState === 'disconnected' || newState === 'failed') {
      this.clearConnectTimeout();
      this.stopHeartbeat();
    }

    this.notifyListeners();
  }

  /**
   * Begins connection attempt with timeout watchdog
   */
  public beginConnecting(peer: BluetoothDevicePeer, onTimeout?: () => void): void {
    this.setState('connecting', peer);
    this.clearConnectTimeout();

    this.connectTimeoutTimer = setTimeout(() => {
      if (this.state === 'connecting') {
        console.warn(`[ConnectionManager] Connection attempt to ${peer.name} timed out after ${this.CONNECT_TIMEOUT_MS}ms`);
        this.setState('failed', null);
        if (onTimeout) onTimeout();
      }
    }, this.CONNECT_TIMEOUT_MS);
  }

  /**
   * Handles peer disconnection, triggering auto-reconnect if unexpected
   */
  public handleDisconnection(unexpected: boolean, onAttemptReconnect?: () => void): void {
    const previousPeer = this.connectedPeer;
    this.stopHeartbeat();

    if (unexpected && previousPeer && this.reconnectAttempts < this.MAX_RECONNECT_ATTEMPTS) {
      this.reconnectAttempts++;
      console.log(`[ConnectionManager] Unexpected disconnect. Attempting reconnect ${this.reconnectAttempts}/${this.MAX_RECONNECT_ATTEMPTS}...`);
      this.setState('reconnecting', previousPeer);
      if (onAttemptReconnect) {
        setTimeout(onAttemptReconnect, 1500);
      }
    } else {
      this.setState('disconnected', null);
      this.reconnectAttempts = 0;
    }
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    // Periodic heartbeat probe every 12s
    this.heartbeatTimer = setInterval(() => {
      if (this.state === 'connected') {
        // Ping can be triggered by caller
      }
    }, 12000);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer as any);
      this.heartbeatTimer = null;
    }
  }

  private clearConnectTimeout(): void {
    if (this.connectTimeoutTimer) {
      clearTimeout(this.connectTimeoutTimer as any);
      this.connectTimeoutTimer = null;
    }
  }

  private notifyListeners(): void {
    for (const listener of this.listeners) {
      try {
        listener(this.state, this.connectedPeer);
      } catch (err) {
        console.error('[ConnectionManager] Listener notification error:', err);
      }
    }
  }
}

export const ConnectionManager = new ConnectionManagerService();
