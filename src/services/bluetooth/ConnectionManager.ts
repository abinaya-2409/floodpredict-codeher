/**
 * FloodyPredict - Direct Offline Bluetooth Connection Manager
 * Manages connection state transitions, timeouts, active ping-pong heartbeat loop,
 * latency measurement, link quality metrics, and auto-reconnection.
 */

import { BluetoothDevicePeer, ConnectionHealthMetrics, ConnectionState } from './BluetoothTypes';

export type ConnectionStateListener = (state: ConnectionState, peer: BluetoothDevicePeer | null) => void;
export type HealthMetricsListener = (metrics: ConnectionHealthMetrics) => void;

class ConnectionManagerService {
  private state: ConnectionState = 'disconnected';
  private connectedPeer: BluetoothDevicePeer | null = null;
  private listeners: Set<ConnectionStateListener> = new Set();
  private healthListeners: Set<HealthMetricsListener> = new Set();
  private connectTimeoutTimer: NodeJS.Timeout | number | null = null;
  private heartbeatTimer: NodeJS.Timeout | number | null = null;
  private reconnectAttempts: number = 0;
  private pingSender: (() => void) | null = null;
  private readonly MAX_RECONNECT_ATTEMPTS = 2;
  private readonly CONNECT_TIMEOUT_MS = 15000;
  private readonly HEARTBEAT_INTERVAL_MS = 10000;
  private readonly MAX_MISSED_PINGS = 3;

  private healthMetrics: ConnectionHealthMetrics = {
    lastPingTime: 0,
    lastPongTime: 0,
    rttMs: 0,
    missedPings: 0,
    linkQuality: 'offline',
  };

  public addListener(listener: ConnectionStateListener): () => void {
    this.listeners.add(listener);
    listener(this.state, this.connectedPeer);
    return () => {
      this.listeners.delete(listener);
    };
  }

  public addHealthListener(listener: HealthMetricsListener): () => void {
    this.healthListeners.add(listener);
    listener(this.healthMetrics);
    return () => {
      this.healthListeners.delete(listener);
    };
  }

  public setPingSender(sender: () => void): void {
    this.pingSender = sender;
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

  public getHealthMetrics(): ConnectionHealthMetrics {
    return { ...this.healthMetrics };
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
      this.healthMetrics.missedPings = 0;
      this.healthMetrics.linkQuality = 'good';
      this.notifyHealthListeners();
      this.startHeartbeatLoop();
    } else if (newState === 'disconnected' || newState === 'failed') {
      this.clearConnectTimeout();
      this.stopHeartbeatLoop();
      this.healthMetrics.linkQuality = 'offline';
      this.healthMetrics.rttMs = 0;
      this.notifyHealthListeners();
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
    this.stopHeartbeatLoop();

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

  /**
   * Starts periodic active Ping-Pong Heartbeat Loop to monitor connection health & RTT
   */
  private startHeartbeatLoop(): void {
    this.stopHeartbeatLoop();
    // Fire immediate ping
    this.executePingTick();

    // Setup recurring loop every HEARTBEAT_INTERVAL_MS
    this.heartbeatTimer = setInterval(() => {
      if (this.state === 'connected') {
        this.executePingTick();
      }
    }, this.HEARTBEAT_INTERVAL_MS);
  }

  private executePingTick(): void {
    if (!this.isConnected()) return;

    // Check if previous ping was missed
    if (this.healthMetrics.lastPingTime > this.healthMetrics.lastPongTime) {
      this.healthMetrics.missedPings++;
      if (this.healthMetrics.missedPings >= this.MAX_MISSED_PINGS) {
        console.warn(`[ConnectionManager] Link stalled: ${this.healthMetrics.missedPings} consecutive pings missed.`);
        this.healthMetrics.linkQuality = 'poor';
        this.notifyHealthListeners();
        // Trigger reconnection watchdog
        this.handleDisconnection(true);
        return;
      } else if (this.healthMetrics.missedPings >= 1) {
        this.healthMetrics.linkQuality = 'fair';
        this.notifyHealthListeners();
      }
    }

    this.healthMetrics.lastPingTime = Date.now();
    if (this.pingSender) {
      try {
        this.pingSender();
      } catch (err) {
        console.error('[ConnectionManager] Error executing ping tick:', err);
      }
    }
  }

  /**
   * Called when a Pong response is received from the connected peer
   */
  public recordPongReceived(pingTimestamp: number): void {
    const now = Date.now();
    this.healthMetrics.lastPongTime = now;
    this.healthMetrics.missedPings = 0;

    const rtt = Math.max(1, now - pingTimestamp);
    this.healthMetrics.rttMs = rtt;

    // Classify link quality based on round trip latency
    if (rtt < 120) {
      this.healthMetrics.linkQuality = 'excellent';
    } else if (rtt < 350) {
      this.healthMetrics.linkQuality = 'good';
    } else {
      this.healthMetrics.linkQuality = 'fair';
    }

    this.notifyHealthListeners();
  }

  private stopHeartbeatLoop(): void {
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

  private notifyHealthListeners(): void {
    const metrics = this.getHealthMetrics();
    for (const listener of this.healthListeners) {
      try {
        listener(metrics);
      } catch (err) {
        console.error('[ConnectionManager] Health listener notification error:', err);
      }
    }
  }
}

export const ConnectionManager = new ConnectionManagerService();
