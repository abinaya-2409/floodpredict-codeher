/**
 * FloodyPredict - Direct Offline Bluetooth Message Transport Layer
 * Handles BLE MTU chunking, reassembly, ACK receipt confirmation, retry management.
 */

import {
  BLETransportPacket,
  BluetoothMessagePayload,
  MessageDeliveryStatus,
} from './BluetoothTypes';
import { MessageProtocol } from './MessageProtocol';

export const CHUNK_SIZE = 160; // Safe chunk size under standard Android BLE MTU (180-512)
export const ACK_TIMEOUT_MS = 3500;
export const MAX_RETRIES = 3;

interface PendingAckEntry {
  message: BluetoothMessagePayload;
  attempt: number;
  timer: NodeJS.Timeout | number;
  onStatusChange: (status: MessageDeliveryStatus) => void;
  resolve: (delivered: boolean) => void;
}

interface ReassemblyBuffer {
  total: number;
  chunks: Map<number, string>;
  createdAt: number;
}

export type RawPacketSender = (packetStr: string) => Promise<boolean>;

export class MessageTransportService {
  private pendingAcks: Map<string, PendingAckEntry> = new Map();
  private incomingBuffers: Map<string, ReassemblyBuffer> = new Map();
  private rawSender: RawPacketSender | null = null;
  private onMessageReceivedCallback: ((msg: BluetoothMessagePayload) => void) | null = null;
  private onStatusUpdateCallback: ((msgId: string, status: MessageDeliveryStatus) => void) | null = null;

  constructor() {
    // Periodic garbage collection for stale reassembly buffers (15s TTL)
    setInterval(() => this.cleanupStaleBuffers(), 10000);
  }

  public setRawSender(sender: RawPacketSender): void {
    this.rawSender = sender;
  }

  public onMessageReceived(callback: (msg: BluetoothMessagePayload) => void): void {
    this.onMessageReceivedCallback = callback;
  }

  public onStatusUpdate(callback: (msgId: string, status: MessageDeliveryStatus) => void): void {
    this.onStatusUpdateCallback = callback;
  }

  /**
   * Splits a serialized string into BLE chunks
   */
  public chunkPayload(msgId: string, serializedText: string): BLETransportPacket[] {
    const totalChunks = Math.ceil(serializedText.length / CHUNK_SIZE);
    const packets: BLETransportPacket[] = [];

    for (let i = 0; i < totalChunks; i++) {
      const start = i * CHUNK_SIZE;
      const end = start + CHUNK_SIZE;
      const data = serializedText.slice(start, end);
      packets.push({
        id: msgId,
        idx: i,
        total: totalChunks,
        data,
      });
    }

    return packets;
  }

  /**
   * Transmits a message over raw Bluetooth transport with chunking and ACK verification
   */
  public async transmitMessage(
    payload: BluetoothMessagePayload,
    onStatusChange?: (status: MessageDeliveryStatus) => void
  ): Promise<boolean> {
    if (!this.rawSender) {
      console.warn('[MessageTransport] No raw Bluetooth sender configured');
      if (onStatusChange) onStatusChange('failed');
      return false;
    }

    if (!MessageProtocol.checkRateLimit()) {
      await new Promise((r) => setTimeout(r, 250));
    }

    const serialized = MessageProtocol.serialize(payload);
    const chunks = this.chunkPayload(payload.id, serialized);

    // If it's an ACK, send directly without waiting for ACK response
    if (payload.type === 'ack') {
      return this.sendRawChunks(chunks);
    }

    // Set status to sent
    if (onStatusChange) onStatusChange('sent');
    if (this.onStatusUpdateCallback) this.onStatusUpdateCallback(payload.id, 'sent');

    return new Promise<boolean>((resolve) => {
      // Register in ACK waiting queue
      this.registerAckWaiter(payload, 1, resolve, onStatusChange);
      // Fire initial transmission
      this.sendRawChunks(chunks).catch(() => {
        // Will retry in timer if ACK not received
      });
    });
  }

  /**
   * Registers a message to wait for an ACK response
   */
  private registerAckWaiter(
    message: BluetoothMessagePayload,
    attempt: number,
    resolve: (delivered: boolean) => void,
    onStatusChange?: (status: MessageDeliveryStatus) => void
  ): void {
    // Clear existing timer if any
    if (this.pendingAcks.has(message.id)) {
      clearTimeout(this.pendingAcks.get(message.id)!.timer as any);
    }

    const timer = setTimeout(() => {
      this.handleAckTimeout(message.id);
    }, ACK_TIMEOUT_MS);

    this.pendingAcks.set(message.id, {
      message,
      attempt,
      timer,
      onStatusChange: (status) => {
        if (onStatusChange) onStatusChange(status);
        if (this.onStatusUpdateCallback) this.onStatusUpdateCallback(message.id, status);
      },
      resolve,
    });
  }

  /**
   * Retries transmission on ACK timeout up to MAX_RETRIES
   */
  private async handleAckTimeout(messageId: string): Promise<void> {
    const entry = this.pendingAcks.get(messageId);
    if (!entry) return;

    if (entry.attempt < MAX_RETRIES) {
      const nextAttempt = entry.attempt + 1;
      console.log(`[MessageTransport] Retrying message ${messageId} (Attempt ${nextAttempt}/${MAX_RETRIES})`);

      const serialized = MessageProtocol.serialize(entry.message);
      const chunks = this.chunkPayload(entry.message.id, serialized);

      this.registerAckWaiter(entry.message, nextAttempt, entry.resolve, entry.onStatusChange);
      await this.sendRawChunks(chunks);
    } else {
      console.warn(`[MessageTransport] Message ${messageId} failed after ${MAX_RETRIES} attempts`);
      this.pendingAcks.delete(messageId);
      entry.onStatusChange('failed');
      entry.resolve(false);
    }
  }

  /**
   * Processes an incoming raw packet chunk string
   */
  public handleIncomingRawPacket(packetString: string): void {
    try {
      // Chunk packet format: JSON { id, idx, total, data }
      const packet: BLETransportPacket = JSON.parse(packetString);
      if (!packet.id || typeof packet.idx !== 'number' || typeof packet.total !== 'number') {
        return;
      }

      let buffer = this.incomingBuffers.get(packet.id);
      if (!buffer) {
        buffer = {
          total: packet.total,
          chunks: new Map<number, string>(),
          createdAt: Date.now(),
        };
        this.incomingBuffers.set(packet.id, buffer);
      }

      buffer.chunks.set(packet.idx, packet.data);

      // Check if all chunks received
      if (buffer.chunks.size === buffer.total) {
        let fullString = '';
        for (let i = 0; i < buffer.total; i++) {
          fullString += buffer.chunks.get(i) || '';
        }
        this.incomingBuffers.delete(packet.id);

        const payload = MessageProtocol.deserialize(fullString);
        if (payload) {
          this.handleCompletedMessage(payload);
        }
      }
    } catch (err) {
      console.error('[MessageTransport] Failed to parse raw packet chunk:', err);
    }
  }

  /**
   * Handles a fully reassembled and validated protocol message
   */
  private handleCompletedMessage(payload: BluetoothMessagePayload): void {
    // 1. If message is ACK, match against pending Acks
    if (payload.type === 'ack' && payload.ackForId) {
      const pending = this.pendingAcks.get(payload.ackForId);
      if (pending) {
        clearTimeout(pending.timer as any);
        this.pendingAcks.delete(payload.ackForId);
        pending.onStatusChange('delivered');
        pending.resolve(true);
        console.log(`[MessageTransport] Delivered ✓ ACK verified for ${payload.ackForId}`);
      }
      return;
    }

    // 2. If already processed, ignore duplicate (deduplication)
    if (MessageProtocol.isDuplicate(payload.id)) {
      console.log(`[MessageTransport] Ignored duplicate message ${payload.id}`);
      return;
    }

    // 3. Notify message received listeners
    if (this.onMessageReceivedCallback) {
      this.onMessageReceivedCallback(payload);
    }
  }

  /**
   * Sends individual chunks sequentially with slight micro-delay to prevent radio congestion
   */
  private async sendRawChunks(chunks: BLETransportPacket[]): Promise<boolean> {
    if (!this.rawSender) return false;

    try {
      for (const chunk of chunks) {
        const chunkJson = JSON.stringify(chunk);
        await this.rawSender(chunkJson);
        if (chunks.length > 1) {
          await new Promise((r) => setTimeout(r, 40)); // 40ms inter-chunk spacing
        }
      }
      return true;
    } catch (err) {
      console.error('[MessageTransport] Raw send failed:', err);
      return false;
    }
  }

  private cleanupStaleBuffers(): void {
    const now = Date.now();
    for (const [id, buffer] of this.incomingBuffers.entries()) {
      if (now - buffer.createdAt > 15000) {
        this.incomingBuffers.delete(id);
      }
    }
  }

  public clearAllPending(): void {
    for (const [, entry] of this.pendingAcks.entries()) {
      clearTimeout(entry.timer as any);
      entry.onStatusChange('failed');
      entry.resolve(false);
    }
    this.pendingAcks.clear();
    this.incomingBuffers.clear();
  }
}

export const MessageTransport = new MessageTransportService();
