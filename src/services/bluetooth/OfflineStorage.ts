/**
 * FloodyPredict - Direct Offline Emergency Chat Local Storage
 * Stores all conversations, messages, delivery states, and blocked peers in local device storage.
 * GUARANTEE: Never uploads or syncs to any remote cloud servers.
 */

import {
  ConversationThread,
  MessageDeliveryStatus,
  StoredMessage,
} from './BluetoothTypes';

const STORAGE_MESSAGES_PREFIX = 'floodypredict_bt_msgs_';
const STORAGE_THREADS_KEY = 'floodypredict_bt_threads';
const STORAGE_BLOCKED_KEY = 'floodypredict_bt_blocked';

class OfflineStorageService {
  /**
   * Retrieves list of all conversation threads
   */
  public getThreads(): ConversationThread[] {
    try {
      const data = localStorage.getItem(STORAGE_THREADS_KEY);
      if (data) {
        return JSON.parse(data);
      }
    } catch (e) {
      console.error('[OfflineStorage] Failed to read threads:', e);
    }
    return [];
  }

  /**
   * Saves or updates a conversation thread
   */
  public upsertThread(thread: ConversationThread): void {
    try {
      const threads = this.getThreads();
      const existingIndex = threads.findIndex((t) => t.peerId === thread.peerId);
      if (existingIndex >= 0) {
        threads[existingIndex] = { ...threads[existingIndex], ...thread };
      } else {
        threads.unshift(thread);
      }
      localStorage.setItem(STORAGE_THREADS_KEY, JSON.stringify(threads));
    } catch (e) {
      console.error('[OfflineStorage] Failed to save thread:', e);
    }
  }

  /**
   * Retrieves all messages for a specific conversation
   */
  public getMessages(conversationId: string): StoredMessage[] {
    try {
      const raw = localStorage.getItem(`${STORAGE_MESSAGES_PREFIX}${conversationId}`);
      if (raw) {
        return JSON.parse(raw);
      }
    } catch (e) {
      console.error('[OfflineStorage] Failed to read messages:', e);
    }
    return [];
  }

  /**
   * Saves a new message to local storage
   */
  public saveMessage(message: StoredMessage): void {
    try {
      const messages = this.getMessages(message.conversationId);
      const existingIndex = messages.findIndex((m) => m.id === message.id);

      if (existingIndex >= 0) {
        messages[existingIndex] = message;
      } else {
        messages.push(message);
      }

      // Limit to last 200 messages per conversation to avoid storage exhaustion
      const trimmed = messages.slice(-200);
      localStorage.setItem(`${STORAGE_MESSAGES_PREFIX}${message.conversationId}`, JSON.stringify(trimmed));

      // Update thread last message
      const threads = this.getThreads();
      const thread = threads.find((t) => t.peerId === message.conversationId) || {
        peerId: message.conversationId,
        peerName: message.isSelf ? 'Peer' : message.senderNick || message.senderId,
        unreadCount: 0,
        updatedAt: message.timestamp,
      };

      thread.lastMessage = message;
      thread.updatedAt = message.timestamp;
      this.upsertThread(thread);
    } catch (e) {
      console.error('[OfflineStorage] Failed to save message:', e);
    }
  }

  /**
   * Updates delivery status for a stored message
   */
  public updateMessageStatus(conversationId: string, messageId: string, status: MessageDeliveryStatus): void {
    try {
      const messages = this.getMessages(conversationId);
      const msg = messages.find((m) => m.id === messageId);
      if (msg) {
        msg.status = status;
        localStorage.setItem(`${STORAGE_MESSAGES_PREFIX}${conversationId}`, JSON.stringify(messages));
      }
    } catch (e) {
      console.error('[OfflineStorage] Failed to update message status:', e);
    }
  }

  /**
   * Clears all offline messages and threads
   */
  public clearAllOfflineData(): void {
    try {
      const threads = this.getThreads();
      for (const t of threads) {
        localStorage.removeItem(`${STORAGE_MESSAGES_PREFIX}${t.peerId}`);
      }
      localStorage.removeItem(STORAGE_THREADS_KEY);
      console.log('[OfflineStorage] All offline messages cleared.');
    } catch (e) {
      console.error('[OfflineStorage] Failed to clear offline data:', e);
    }
  }

  /**
   * Block / Unblock device management
   */
  public getBlockedDevices(): string[] {
    try {
      const raw = localStorage.getItem(STORAGE_BLOCKED_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  public blockDevice(deviceId: string): void {
    const blocked = this.getBlockedDevices();
    if (!blocked.includes(deviceId)) {
      blocked.push(deviceId);
      localStorage.setItem(STORAGE_BLOCKED_KEY, JSON.stringify(blocked));
    }
  }

  public unblockDevice(deviceId: string): void {
    const blocked = this.getBlockedDevices().filter((id) => id !== deviceId);
    localStorage.setItem(STORAGE_BLOCKED_KEY, JSON.stringify(blocked));
  }

  public isDeviceBlocked(deviceId: string): boolean {
    return this.getBlockedDevices().includes(deviceId);
  }
}

export const OfflineStorage = new OfflineStorageService();
