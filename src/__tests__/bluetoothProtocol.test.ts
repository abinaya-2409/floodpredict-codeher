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
  /**
   * These used to assert that every check passed in jsdom, which has no
   * Bluetooth API at all. They only passed because the radio check reported
   * "Web / PWA Bluetooth radio operational" without asking anything. The
   * point of a self-test is to fail where the thing it tests is absent, so
   * that is what is asserted now.
   */
  it('reports the radio as unavailable where there is no radio', async () => {
    await BluetoothService.initialize();
    const summary = await BluetoothService.runDiagnosticLoop();

    expect(summary).toBeDefined();
    expect(summary.checks.length).toBe(7);

    const byId = Object.fromEntries(summary.checks.map((c) => [c.id, c]));
    expect(Object.keys(byId).sort()).toEqual([
      'device_discovery',
      'link_health',
      'local_identity',
      'mtu_chunking',
      'offline_storage',
      'protocol_integrity',
      'radio_status',
    ]);

    // jsdom has no navigator.bluetooth, so these two must say so plainly.
    expect(byId.radio_status.status).toBe('failed');
    expect(byId.radio_status.details).toMatch(/no Bluetooth API/i);
    expect(byId.device_discovery.status).toBe('failed');

    // Everything that does not need a radio still has to work.
    for (const id of ['local_identity', 'protocol_integrity', 'mtu_chunking', 'offline_storage']) {
      expect(byId[id].status, id).toBe('passed');
    }
  });

  it('passes the radio and discovery checks when a radio is present', async () => {
    // A minimal stand-in for navigator.bluetooth: enough for describeSupport
    // to find an adapter, with no devices in range.
    const original = (navigator as unknown as Record<string, unknown>).bluetooth;
    Object.defineProperty(navigator, 'bluetooth', {
      configurable: true,
      value: {
        getAvailability: async () => true,
        getDevices: async () => [],
        requestDevice: async () => {
          throw new Error('no chooser in tests');
        },
      },
    });

    try {
      await BluetoothService.initialize();
      const summary = await BluetoothService.runDiagnosticLoop();
      const byId = Object.fromEntries(summary.checks.map((c) => [c.id, c]));

      expect(byId.radio_status.status).toBe('passed');
      expect(byId.device_discovery.status).toBe('passed');
      // An empty list is a correct answer and must not be reported as a fault.
      expect(byId.device_discovery.details).toMatch(/0 real devices in range/);
      expect(byId.device_discovery.details).toMatch(/sweeps/);
    } finally {
      if (original === undefined) {
        delete (navigator as unknown as Record<string, unknown>).bluetooth;
      } else {
        Object.defineProperty(navigator, 'bluetooth', { configurable: true, value: original });
      }
    }
  });
});
