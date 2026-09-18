/**
 * FloodyPredict - Direct Offline Bluetooth Message Protocol
 * Handles validation, serialization, packet integrity, UUIDs, deduplication, and rate limiting.
 */

import {
  BluetoothMessagePayload,
  BluetoothUserIdentity,
  MessagePriority,
  MessageType,
} from './BluetoothTypes';

export const PROTOCOL_VERSION = 1;
export const MAX_MESSAGE_LENGTH = 500;
export const MAX_SERIALIZED_BYTES = 4096;
export const FLOODYPREDICT_SERVICE_UUID = '0000fd01-0000-1000-8000-00805f9b34fb';
export const FLOODYPREDICT_CHAR_TX_UUID = '0000fd02-0000-1000-8000-00805f9b34fb';
export const FLOODYPREDICT_CHAR_RX_UUID = '0000fd03-0000-1000-8000-00805f9b34fb';

class MessageProtocolService {
  private seenMessageIds: Map<string, number> = new Map();
  private lastSentTimestamp: number = 0;
  private readonly MIN_SEND_INTERVAL_MS = 250; // Rate limit protection
  private readonly DEDUPLICATION_TTL_MS = 60 * 60 * 1000; // 1 hour

  /**
   * Generates a cryptographically strong UUID v4
   */
  public generateUUID(): string {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      return crypto.randomUUID();
    }
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  /**
   * Generates or retrieves local device identity: FloodUser-XXXX
   */
  public getOrCreateLocalIdentity(): BluetoothUserIdentity {
    const STORAGE_KEY = 'floodypredict_bt_identity';
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.id && parsed.nickname) {
          return parsed;
        }
      }
    } catch {
      // Ignore localStorage error
    }

    const randomSuffix = Math.floor(1000 + Math.random() * 9000);
    const id = `FloodUser-${randomSuffix}`;
    const identity: BluetoothUserIdentity = {
      id,
      nickname: id,
      createdAt: Date.now(),
    };

    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(identity));
    } catch {
      // Ignore
    }

    return identity;
  }

  /**
   * Updates user nickname in storage
   */
  public saveNickname(nickname: string): BluetoothUserIdentity {
    const identity = this.getOrCreateLocalIdentity();
    const cleanNick = nickname.trim().slice(0, 32) || identity.id;
    identity.nickname = cleanNick;
    try {
      localStorage.setItem('floodypredict_bt_identity', JSON.stringify(identity));
    } catch {
      // Ignore
    }
    return identity;
  }

  /**
   * Creates a structured protocol message payload
   */
  public createMessage(params: {
    type: MessageType;
    senderId: string;
    senderNick: string;
    content: string;
    priority?: MessagePriority;
    recipientId?: string;
    ackForId?: string;
    id?: string;
  }): BluetoothMessagePayload {
    const cleanedContent = this.sanitizeText(params.content).slice(0, MAX_MESSAGE_LENGTH);

    return {
      v: PROTOCOL_VERSION,
      id: params.id || this.generateUUID(),
      type: params.type,
      senderId: params.senderId,
      senderNick: params.senderNick.slice(0, 32),
      recipientId: params.recipientId,
      timestamp: Date.now(),
      priority: params.priority || (params.type === 'sos' ? 'emergency' : 'normal'),
      content: cleanedContent,
      ackForId: params.ackForId,
    };
  }

  /**
   * Creates an ACK payload for a received message
   */
  public createAckMessage(originalMsg: BluetoothMessagePayload, selfIdentity: BluetoothUserIdentity): BluetoothMessagePayload {
    return {
      v: PROTOCOL_VERSION,
      id: this.generateUUID(),
      type: 'ack',
      senderId: selfIdentity.id,
      senderNick: selfIdentity.nickname,
      recipientId: originalMsg.senderId,
      timestamp: Date.now(),
      priority: 'normal',
      content: 'ACK',
      ackForId: originalMsg.id,
    };
  }

  /**
   * Serializes a payload to a compact JSON string with validation
   */
  public serialize(payload: BluetoothMessagePayload): string {
    const jsonStr = JSON.stringify(payload);
    if (jsonStr.length > MAX_SERIALIZED_BYTES) {
      throw new Error(`Message payload exceeds maximum byte limit (${jsonStr.length} > ${MAX_SERIALIZED_BYTES})`);
    }
    return jsonStr;
  }

  /**
   * Validates and deserializes incoming JSON packet string
   */
  public deserialize(rawString: string): BluetoothMessagePayload | null {
    if (!rawString || typeof rawString !== 'string') {
      return null;
    }

    try {
      const parsed = JSON.parse(rawString);

      // Validate required protocol fields
      if (
        typeof parsed !== 'object' ||
        parsed === null ||
        typeof parsed.v !== 'number' ||
        typeof parsed.id !== 'string' ||
        typeof parsed.type !== 'string' ||
        typeof parsed.senderId !== 'string' ||
        typeof parsed.timestamp !== 'number'
      ) {
        return null;
      }

      // Check protocol compatibility
      if (parsed.v !== PROTOCOL_VERSION) {
        console.warn(`[BluetoothProtocol] Incompatible protocol version: ${parsed.v}`);
        return null;
      }

      // Sanitize fields
      return {
        v: parsed.v,
        id: parsed.id,
        type: parsed.type as MessageType,
        senderId: this.sanitizeText(parsed.senderId).slice(0, 32),
        senderNick: this.sanitizeText(parsed.senderNick || parsed.senderId).slice(0, 32),
        recipientId: parsed.recipientId ? this.sanitizeText(parsed.recipientId).slice(0, 32) : undefined,
        timestamp: parsed.timestamp,
        priority: parsed.priority === 'emergency' ? 'emergency' : 'normal',
        content: this.sanitizeText(parsed.content || '').slice(0, MAX_MESSAGE_LENGTH),
        ackForId: parsed.ackForId ? this.sanitizeText(parsed.ackForId) : undefined,
      };
    } catch (err) {
      console.error('[BluetoothProtocol] Deserialization failed:', err);
      return null;
    }
  }

  /**
   * Checks if message has already been received and processed (deduplication)
   */
  public isDuplicate(messageId: string): boolean {
    this.cleanExpiredDeduplicationCache();
    if (this.seenMessageIds.has(messageId)) {
      return true;
    }
    this.seenMessageIds.set(messageId, Date.now());
    return false;
  }

  /**
   * Rate limiter check: prevents flooding Bluetooth radio buffer
   */
  public checkRateLimit(): boolean {
    const now = Date.now();
    if (now - this.lastSentTimestamp < this.MIN_SEND_INTERVAL_MS) {
      return false; // Rate limit exceeded
    }
    this.lastSentTimestamp = now;
    return true;
  }

  /**
   * Cleans old entries from deduplication map
   */
  private cleanExpiredDeduplicationCache(): void {
    const now = Date.now();
    for (const [id, timestamp] of this.seenMessageIds.entries()) {
      if (now - timestamp > this.DEDUPLICATION_TTL_MS) {
        this.seenMessageIds.delete(id);
      }
    }
  }

  /**
   * Sanitizes string against control characters and exploits
   */
  private sanitizeText(str: string): string {
    if (!str) return '';
    // Strip non-printable ASCII control characters except standard whitespace / newlines
    return str.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
  }
}

export const MessageProtocol = new MessageProtocolService();
