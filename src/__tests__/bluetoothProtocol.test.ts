import { describe, it, expect, beforeEach } from 'vitest';
import { MessageProtocol } from '../services/bluetooth/MessageProtocol';
import { MessageTransport } from '../services/bluetooth/MessageTransport';
import { OfflineStorage } from '../services/bluetooth/OfflineStorage';
import { ConnectionManager } from '../services/bluetooth/ConnectionManager';
import { BluetoothService } from '../services/bluetooth/BluetoothService';
import { BluetoothDevicePeer, StoredMessage } from '../services/bluetooth/BluetoothTypes';

describe('MessageProtocol', () => {
  it('should create valid emergency chat message', () => {
    const msg = MessageProtocol.createMessage({
      type: 'msg',
      senderId: 'sender-123',
      senderNick: 'Alice',
      content: 'Flood rising at Junction 4',
    });
    expect(msg.id).toBeDefined();
    expect(msg.senderId).toBe('sender-123');
    expect(msg.senderNick).toBe('Alice');
    expect(msg.content).toBe('Flood rising at Junction 4');
    expect(msg.priority).toBe('normal');
    expect(msg.v).toBe(1);
  });

  it('should create valid SOS broadcast message', () => {
    const sos = MessageProtocol.createMessage({
      type: 'sos',
      senderId: 'sender-999',
      senderNick: 'Bob',
      content: 'EMERGENCY SOS: Flood level critical at Bridge 2',
      priority: 'emergency',
    });
    expect(sos.type).toBe('sos');
    expect(sos.priority).toBe('emergency');
    expect(sos.content).toContain('EMERGENCY SOS');
  });

  it('should serialize and deserialize messages with integrity check', () => {
    const msg = MessageProtocol.createMessage({
      type: 'msg',
      senderId: 'dev-1',
      senderNick: 'Charlie',
      content: 'Safe on roof',
    });
    const jsonStr = MessageProtocol.serialize(msg);
    const deserialized = MessageProtocol.deserialize(jsonStr);
    expect(deserialized).not.toBeNull();
    expect(deserialized?.id).toBe(msg.id);
    expect(deserialized?.content).toBe('Safe on roof');
  });

  it('should reject malformed or tampered messages', () => {
    expect(MessageProtocol.deserialize('')).toBeNull();
    expect(MessageProtocol.deserialize('{"random": 123}')).toBeNull();
    expect(MessageProtocol.deserialize('invalid json string')).toBeNull();
  });

  it('should handle deduplication correctly', () => {
    const testId = 'test-dup-' + Date.now();
    // First encounter -> not duplicate, records as seen
    expect(MessageProtocol.isDuplicate(testId)).toBe(false);
    // Second encounter -> duplicate detected
    expect(MessageProtocol.isDuplicate(testId)).toBe(true);
  });

  // Automated Stress Loop: 50 cycles
  it('should reliably execute continuous message generation & verification loop (50 cycles)', () => {
    for (let i = 0; i < 50; i++) {
      const msg = MessageProtocol.createMessage({
        type: i % 5 === 0 ? 'sos' : 'msg',
        senderId: `sender-${i}`,
        senderNick: `Node-${i}`,
        content: `Telemetry payload index #${i} - water elevation status`,
        priority: i % 5 === 0 ? 'emergency' : 'normal',
      });
      const serialized = MessageProtocol.serialize(msg);
      const restored = MessageProtocol.deserialize(serialized);
      expect(restored).not.toBeNull();
      expect(restored?.id).toBe(msg.id);
      expect(restored?.content).toBe(msg.content);
      expect(restored?.priority).toBe(msg.priority);
    }
  });
});

describe('MessageTransport Chunking & Reassembly Loop', () => {
  it('should chunk large payloads and reassemble them accurately', () => {
    const longContent = 'Flood warning payload '.repeat(15); // ~330 chars (< 500 MAX_MESSAGE_LENGTH, > 160 CHUNK_SIZE)
    const msg = MessageProtocol.createMessage({
      type: 'msg',
      senderId: 'dev-long',
      senderNick: 'Dave',
      content: longContent,
    });
    const serialized = MessageProtocol.serialize(msg);

    // Chunk size is 160 bytes
    const chunks = MessageTransport.chunkPayload(msg.id, serialized);
    expect(chunks.length).toBeGreaterThan(1);

    // Test reassembly via handleIncomingRawPacket
    let receivedPayload: any = null;
    MessageTransport.onMessageReceived((p) => {
      receivedPayload = p;
    });

    for (const chunk of chunks) {
      MessageTransport.handleIncomingRawPacket(JSON.stringify(chunk));
    }

    expect(receivedPayload).not.toBeNull();
    expect(receivedPayload.id).toBe(msg.id);
    expect(receivedPayload.content).toBe(longContent);
  });

  // Variable payload size loop test
  it('should reassemble variable-sized payloads in a stress loop', () => {
    const testSizes = [80, 160, 200, 320, 450];
    for (const size of testSizes) {
      const content = 'X'.repeat(size);
      const testMsg = MessageProtocol.createMessage({
        type: 'msg',
        senderId: 'dev-stress',
        senderNick: 'Tester',
        content,
      });
      const serialized = MessageProtocol.serialize(testMsg);
      const chunks = MessageTransport.chunkPayload(testMsg.id, serialized);

      let assembled: any = null;
      MessageTransport.onMessageReceived((p) => {
        assembled = p;
      });

      for (const chunk of chunks) {
        MessageTransport.handleIncomingRawPacket(JSON.stringify(chunk));
      }

      expect(assembled).not.toBeNull();
      expect(assembled.content).toBe(content);
    }
  });
});

describe('Ping-Pong Heartbeat Watchdog Loop', () => {
  const dummyPeer: BluetoothDevicePeer = {
    id: 'peer-heartbeat-test',
    name: 'Peer Node Alpha',
    lastSeen: Date.now(),
    isConnected: true,
  };

  it('should record pong and calculate RTT latency correctly', () => {
    ConnectionManager.setState('connected', dummyPeer);

    let health = ConnectionManager.getHealthMetrics();
    expect(health.linkQuality).toBe('good');

    // Simulate sending ping at t0 and receiving pong after 45ms
    const t0 = Date.now() - 45;
    ConnectionManager.recordPongReceived(t0);

    health = ConnectionManager.getHealthMetrics();
    expect(health.rttMs).toBeGreaterThanOrEqual(40);
    expect(health.missedPings).toBe(0);
    expect(health.linkQuality).toBe('excellent');

    // Clean up
    ConnectionManager.setState('disconnected', null);
  });
});

describe('Diagnostic Self-Test Loop', () => {
  it('should run full end-to-end diagnostic loop and pass all multi-layer checks', async () => {
    await BluetoothService.initialize();
    const summary = await BluetoothService.runDiagnosticLoop();

    expect(summary).toBeDefined();
    expect(summary.checks.length).toBe(6);
    expect(summary.overallHealthy).toBe(true);
    expect(summary.summary).toContain('100% operational');

    const checkIds = summary.checks.map((c) => c.id);
    expect(checkIds).toContain('radio_status');
    expect(checkIds).toContain('local_identity');
    expect(checkIds).toContain('protocol_integrity');
    expect(checkIds).toContain('mtu_chunking');
    expect(checkIds).toContain('offline_storage');
    expect(checkIds).toContain('link_health');

    for (const check of summary.checks) {
      expect(check.status).toBe('passed');
    }
  });
});

describe('OfflineStorage', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('should save, retrieve and update messages locally', () => {
    const msg: StoredMessage = {
      id: 'msg-abc-1',
      conversationId: 'peer-dev-1',
      senderId: 'dev-1',
      senderNick: 'Eve',
      content: 'Water at ground floor',
      timestamp: Date.now(),
      status: 'sent',
      isSelf: false,
      priority: 'emergency',
      type: 'msg',
      retryCount: 0,
    };

    OfflineStorage.saveMessage(msg);
    const loaded = OfflineStorage.getMessages('peer-dev-1');
    expect(loaded.length).toBe(1);
    expect(loaded[0].id).toBe('msg-abc-1');
    expect(loaded[0].content).toBe('Water at ground floor');

    OfflineStorage.updateMessageStatus('peer-dev-1', 'msg-abc-1', 'delivered');
    const updated = OfflineStorage.getMessages('peer-dev-1');
    expect(updated[0].status).toBe('delivered');
  });

  it('should manage conversation threads correctly', () => {
    const thread = {
      peerId: 'peer-test-100',
      peerName: 'Rescue Unit Alpha',
      unreadCount: 2,
      updatedAt: Date.now(),
    };

    OfflineStorage.upsertThread(thread);
    const threads = OfflineStorage.getThreads();
    expect(threads.some((t) => t.peerId === 'peer-test-100')).toBe(true);
  });
});
