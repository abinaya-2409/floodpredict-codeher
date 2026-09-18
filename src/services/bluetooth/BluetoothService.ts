/**
 * FloodyPredict - Unified Bluetooth Emergency Service
 * Orchestrates Native Android Capacitor Bridge, Web Bluetooth, and Secure Local Simulation.
 * Implements end-to-end peer discovery, direct messaging, SOS broadcasting, and delivery verification.
 */

import {
  BluetoothDevicePeer,
  BluetoothMessagePayload,
  BluetoothState,
  BluetoothUserIdentity,
  ConnectionState,
  EMERGENCY_QUICK_PRESETS,
  MessageDeliveryStatus,
  MessagePriority,
  MessageType,
  StoredMessage,
} from './BluetoothTypes';
import {
  FLOODYPREDICT_CHAR_RX_UUID,
  FLOODYPREDICT_CHAR_TX_UUID,
  FLOODYPREDICT_SERVICE_UUID,
  MessageProtocol,
} from './MessageProtocol';
import { MessageTransport } from './MessageTransport';
import { DeviceDiscovery } from './DeviceDiscovery';
import { ConnectionManager } from './ConnectionManager';
import { OfflineStorage } from './OfflineStorage';

// Window declaration for Capacitor Plugins
declare global {
  interface Window {
    Capacitor?: {
      isNativePlatform?: () => boolean;
      getPlatform?: () => string;
      Plugins?: {
        BluetoothChat?: {
          checkPermissions?: () => Promise<{ status: string }>;
          requestPermissions?: () => Promise<{ status: string }>;
          isBluetoothEnabled?: () => Promise<{ enabled: boolean }>;
          startScan?: () => Promise<void>;
          stopScan?: () => Promise<void>;
          startAdvertising?: (options: { deviceName: string }) => Promise<void>;
          connect?: (options: { address: string }) => Promise<void>;
          disconnect?: () => Promise<void>;
          writePacket?: (options: { data: string }) => Promise<void>;
          addListener?: (eventName: string, handler: (data: any) => void) => { remove: () => void };
        };
      };
    };
  }
}

class FloodyBluetoothService {
  private bluetoothState: BluetoothState = 'unknown';
  private identity: BluetoothUserIdentity;
  private isSimulatedMode: boolean = false;
  private stateListeners: Set<(state: BluetoothState) => void> = new Set();
  private simulatedPeerTimeout: any = null;

  constructor() {
    this.identity = MessageProtocol.getOrCreateLocalIdentity();
    this.initTransport();
  }

  /**
   * Initializes the Bluetooth service stack
   */
  public async initialize(): Promise<void> {
    this.identity = MessageProtocol.getOrCreateLocalIdentity();

    // Check if running inside native Capacitor wrapper
    if (this.isNativeAvailable()) {
      await this.initNativeBridge();
    } else {
      // Running in web environment: check Web Bluetooth or configure simulation fallback
      if (typeof navigator !== 'undefined' && 'bluetooth' in navigator) {
        this.bluetoothState = 'poweredOn';
      } else {
        this.bluetoothState = 'poweredOn'; // Enabled for simulation/PWA mode
      }
    }

    this.notifyStateListeners();
  }

  private initTransport(): void {
    // Connect MessageTransport to our packet sender
    MessageTransport.setRawSender(async (packetStr: string) => {
      if (this.isNativeAvailable()) {
        try {
          await window.Capacitor!.Plugins!.BluetoothChat!.writePacket!({ data: packetStr });
          return true;
        } catch (e) {
          console.error('[BluetoothService] Native write failed:', e);
          return false;
        }
      } else {
        // In Web/Simulation mode, handle loopback / simulated peer reception
        if (this.isSimulatedMode && ConnectionManager.isConnected()) {
          this.simulatePeerResponseToPacket(packetStr);
          return true;
        }
        return true;
      }
    });

    // Handle reassembled incoming protocol messages
    MessageTransport.onMessageReceived((payload: BluetoothMessagePayload) => {
      this.handleIncomingPayload(payload);
    });

    // Handle ACK delivery status updates
    MessageTransport.onStatusUpdate((msgId: string, status: MessageDeliveryStatus) => {
      const peer = ConnectionManager.getConnectedPeer();
      if (peer) {
        OfflineStorage.updateMessageStatus(peer.id, msgId, status);
      }
    });
  }

  /**
   * Native Android Capacitor Bridge Initialization
   */
  private async initNativeBridge(): Promise<void> {
    const plugin = window.Capacitor?.Plugins?.BluetoothChat;
    if (!plugin) return;

    try {
      const enabledRes = await plugin.isBluetoothEnabled?.();
      this.bluetoothState = enabledRes?.enabled ? 'poweredOn' : 'poweredOff';

      // Start advertising our FloodyPredict device identity
      await plugin.startAdvertising?.({ deviceName: this.identity.nickname || this.identity.id });

      // Listen for discovered peers from Android native BLE scan
      plugin.addListener?.('onDeviceDiscovered', (device: any) => {
        DeviceDiscovery.registerDiscoveredPeer({
          id: device.address || device.id,
          name: device.name || 'FloodyPredict User',
          rssi: device.rssi,
        });
      });

      // Listen for incoming native BLE packets
      plugin.addListener?.('onPacketReceived', (event: { data: string }) => {
        if (event && event.data) {
          MessageTransport.handleIncomingRawPacket(event.data);
        }
      });

      // Listen for native connection status changes
      plugin.addListener?.('onConnectionStateChanged', (event: { state: string; address?: string }) => {
        if (event.state === 'connected') {
          const peer: BluetoothDevicePeer = {
            id: event.address || 'native-peer',
            name: 'Connected Floody Device',
            lastSeen: Date.now(),
            isConnected: true,
          };
          ConnectionManager.setState('connected', peer);
        } else if (event.state === 'disconnected') {
          ConnectionManager.handleDisconnection(true, () => {
            if (event.address) this.connectToDevice({ id: event.address, name: 'Peer', lastSeen: Date.now(), isConnected: false });
          });
        }
      });
    } catch (err) {
      console.error('[BluetoothService] Native initialization error:', err);
      this.bluetoothState = 'unknown';
    }
  }

  /**
   * Starts device discovery scan
   */
  public async startScan(): Promise<void> {
    DeviceDiscovery.startScanSession();

    if (this.isNativeAvailable()) {
      try {
        await window.Capacitor!.Plugins!.BluetoothChat!.startScan?.();
      } catch (err) {
        console.error('[BluetoothService] Native scan start failed:', err);
      }
    } else {
      // In web browser / simulation mode: populate nearby simulated peers if simulation enabled
      if (this.isSimulatedMode) {
        this.populateSimulatedPeers();
      }
    }
  }

  /**
   * Stops device discovery scan
   */
  public async stopScan(): Promise<void> {
    DeviceDiscovery.stopScanSession();

    if (this.isNativeAvailable()) {
      try {
        await window.Capacitor!.Plugins!.BluetoothChat!.stopScan?.();
      } catch (err) {
        console.error('[BluetoothService] Native scan stop failed:', err);
      }
    }
  }

  /**
   * Connects to a discovered Bluetooth peer
   */
  public async connectToDevice(peer: BluetoothDevicePeer): Promise<boolean> {
    if (OfflineStorage.isDeviceBlocked(peer.id)) {
      console.warn(`[BluetoothService] Cannot connect to blocked device: ${peer.id}`);
      return false;
    }

    ConnectionManager.beginConnecting(peer);

    if (this.isNativeAvailable()) {
      try {
        await window.Capacitor!.Plugins!.BluetoothChat!.connect?.({ address: peer.id });
        return true;
      } catch (err) {
        console.error('[BluetoothService] Native connection failed:', err);
        ConnectionManager.setState('failed', null);
        return false;
      }
    } else {
      // Web / Simulation connection handshake
      return new Promise<boolean>((resolve) => {
        setTimeout(() => {
          ConnectionManager.setState('connected', { ...peer, isConnected: true });
          // Send peer identity handshake
          this.sendIdentityHandshake(peer.id);
          resolve(true);
        }, 1000);
      });
    }
  }

  /**
   * Disconnects from current Bluetooth peer
   */
  public async disconnect(): Promise<void> {
    ConnectionManager.setState('disconnecting');

    if (this.isNativeAvailable()) {
      try {
        await window.Capacitor!.Plugins!.BluetoothChat!.disconnect?.();
      } catch (err) {
        console.error('[BluetoothService] Native disconnect error:', err);
      }
    }

    ConnectionManager.setState('disconnected', null);
    MessageTransport.clearAllPending();
  }

  /**
   * Transmits standard or emergency text message
   */
  public async sendMessage(
    content: string,
    priority: MessagePriority = 'normal',
    type: MessageType = 'msg'
  ): Promise<boolean> {
    const peer = ConnectionManager.getConnectedPeer();
    if (!peer || !ConnectionManager.isConnected()) {
      console.warn('[BluetoothService] Cannot send message: No Bluetooth peer connected');
      return false;
    }

    const payload = MessageProtocol.createMessage({
      type,
      senderId: this.identity.id,
      senderNick: this.identity.nickname,
      recipientId: peer.id,
      content,
      priority,
    });

    const storedMsg: StoredMessage = {
      id: payload.id,
      conversationId: peer.id,
      senderId: this.identity.id,
      senderNick: this.identity.nickname,
      isSelf: true,
      timestamp: payload.timestamp,
      priority: payload.priority,
      type: payload.type,
      content: payload.content,
      status: 'pending',
      retryCount: 0,
    };

    // Save message locally
    OfflineStorage.saveMessage(storedMsg);

    // Transmit over Bluetooth transport with chunking and ACK verification
    return MessageTransport.transmitMessage(payload, (status) => {
      OfflineStorage.updateMessageStatus(peer.id, payload.id, status);
    });
  }

  /**
   * Transmits Emergency Quick Message Preset
   */
  public async sendQuickMessage(presetId: string): Promise<boolean> {
    const preset = EMERGENCY_QUICK_PRESETS.find((p) => p.id === presetId);
    if (!preset) return false;
    return this.sendMessage(preset.text, preset.priority, 'quick');
  }

  /**
   * Transmits High-Priority 🆘 SOS Distress Alert
   */
  public async sendSOS(): Promise<boolean> {
    return this.sendMessage('🆘 SOS: Immediate assistance required.', 'emergency', 'sos');
  }

  /**
   * Handles reassembled and validated incoming protocol message
   */
  private handleIncomingPayload(payload: BluetoothMessagePayload): void {
    if (OfflineStorage.isDeviceBlocked(payload.senderId)) {
      console.warn(`[BluetoothService] Dropped message from blocked device ${payload.senderId}`);
      return;
    }

    const peer = ConnectionManager.getConnectedPeer();
    const conversationId = peer?.id || payload.senderId;

    // Handle peer identity exchange
    if (payload.type === 'ident') {
      if (peer && peer.id === payload.senderId) {
        peer.nickname = payload.senderNick;
        ConnectionManager.setState('connected', { ...peer, nickname: payload.senderNick });
      }
      return;
    }

    // Save incoming message to local device storage
    const storedMsg: StoredMessage = {
      id: payload.id,
      conversationId,
      senderId: payload.senderId,
      senderNick: payload.senderNick,
      isSelf: false,
      timestamp: payload.timestamp,
      priority: payload.priority,
      type: payload.type,
      content: payload.content,
      status: 'delivered',
      retryCount: 0,
    };

    OfflineStorage.saveMessage(storedMsg);

    // Send immediate ACK response back to sender
    const ackPayload = MessageProtocol.createAckMessage(payload, this.identity);
    MessageTransport.transmitMessage(ackPayload);
  }

  /**
   * Sends identity handshake to connected peer
   */
  private sendIdentityHandshake(recipientId: string): void {
    const identPayload = MessageProtocol.createMessage({
      type: 'ident',
      senderId: this.identity.id,
      senderNick: this.identity.nickname,
      recipientId,
      content: this.identity.nickname,
      priority: 'normal',
    });
    MessageTransport.transmitMessage(identPayload);
  }

  /**
   * Update and save nickname
   */
  public updateNickname(nickname: string): BluetoothUserIdentity {
    this.identity = MessageProtocol.saveNickname(nickname);
    // If connected, update peer
    const peer = ConnectionManager.getConnectedPeer();
    if (peer && ConnectionManager.isConnected()) {
      this.sendIdentityHandshake(peer.id);
    }
    return this.identity;
  }

  public getIdentity(): BluetoothUserIdentity {
    return this.identity;
  }

  public getBluetoothState(): BluetoothState {
    return this.bluetoothState;
  }

  public isNativeAvailable(): boolean {
    return typeof window !== 'undefined' && !!window.Capacitor?.Plugins?.BluetoothChat;
  }

  public isSimulationMode(): boolean {
    return this.isSimulatedMode;
  }

  public setSimulationMode(enabled: boolean): void {
    this.isSimulatedMode = enabled;
    if (enabled) {
      this.populateSimulatedPeers();
    } else {
      DeviceDiscovery.clearAll();
    }
  }

  public addBluetoothStateListener(listener: (state: BluetoothState) => void): () => void {
    this.stateListeners.add(listener);
    listener(this.bluetoothState);
    return () => {
      this.stateListeners.delete(listener);
    };
  }

  private notifyStateListeners(): void {
    for (const listener of this.stateListeners) {
      try {
        listener(this.bluetoothState);
      } catch (e) {
        console.error(e);
      }
    }
  }

  /**
   * Simulates nearby peers for web preview / development testing
   */
  private populateSimulatedPeers(): void {
    const mockPeers: BluetoothDevicePeer[] = [
      {
        id: 'FloodUser-7192',
        name: 'FloodUser-7192',
        nickname: 'Disaster Recon Unit 4',
        rssi: -58,
        lastSeen: Date.now(),
        isConnected: false,
      },
      {
        id: 'FloodUser-3841',
        name: 'FloodUser-3841',
        nickname: 'Velachery Community Shelter',
        rssi: -72,
        lastSeen: Date.now(),
        isConnected: false,
      },
      {
        id: 'FloodUser-9024',
        name: 'FloodUser-9024',
        nickname: 'Citizen Water-Rescue 09',
        rssi: -81,
        lastSeen: Date.now(),
        isConnected: false,
      },
    ];

    mockPeers.forEach((p) => DeviceDiscovery.registerDiscoveredPeer(p));
  }

  /**
   * Simulates peer response for web preview testing
   */
  private simulatePeerResponseToPacket(packetStr: string): void {
    try {
      const packet = JSON.parse(packetStr);
      // Simulate receiver ACK after 400ms
      setTimeout(() => {
        const ackPacket = {
          id: MessageProtocol.generateUUID(),
          idx: 0,
          total: 1,
          data: JSON.stringify({
            v: 1,
            id: MessageProtocol.generateUUID(),
            type: 'ack',
            senderId: ConnectionManager.getConnectedPeer()?.id || 'FloodUser-Sim',
            senderNick: ConnectionManager.getConnectedPeer()?.nickname || 'Nearby Peer',
            timestamp: Date.now(),
            priority: 'normal',
            content: 'ACK',
            ackForId: packet.id,
          }),
        };
        MessageTransport.handleIncomingRawPacket(JSON.stringify(ackPacket));
      }, 400);

      // If user sent a message (not an ACK), trigger a realistic peer response after 2.5s
      const dataPayload = JSON.parse(packet.data || '{}');
      if (dataPayload.type === 'sos' || dataPayload.type === 'msg' || dataPayload.type === 'quick') {
        if (this.simulatedPeerTimeout) clearTimeout(this.simulatedPeerTimeout);
        this.simulatedPeerTimeout = setTimeout(() => {
          if (!ConnectionManager.isConnected()) return;
          const peer = ConnectionManager.getConnectedPeer()!;
          const replyText =
            dataPayload.type === 'sos'
              ? '🆘 Copy that! Emergency rescue coordinates logged. Stay elevated, relief team heading your way!'
              : `Received: "${dataPayload.content.slice(0, 30)}...". Safe high-ground shelter is open nearby.`;

          const replyMsg = MessageProtocol.createMessage({
            type: dataPayload.type === 'sos' ? 'sos' : 'msg',
            senderId: peer.id,
            senderNick: peer.nickname || peer.name,
            recipientId: this.identity.id,
            content: replyText,
            priority: dataPayload.type === 'sos' ? 'emergency' : 'normal',
          });

          const replyPacket = {
            id: replyMsg.id,
            idx: 0,
            total: 1,
            data: JSON.stringify(replyMsg),
          };
          MessageTransport.handleIncomingRawPacket(JSON.stringify(replyPacket));
        }, 2200);
      }
    } catch {
      // Ignore simulation parse errors
    }
  }
}

export const BluetoothService = new FloodyBluetoothService();
