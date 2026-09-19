import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DeviceDiscovery } from '../services/bluetooth/DeviceDiscovery';

/**
 * The device list used to be three invented peers that appeared on every scan
 * and never left. What these tests guard is the opposite of that: that the
 * list only ever contains what a radio reported, and that it empties itself
 * when those devices go quiet.
 *
 * Time is injected into sweep() rather than advanced with fake timers, so a
 * twelve-second presence window is tested in microseconds without the test
 * depending on timer semantics.
 */

const T0 = 1_700_000_000_000;

beforeEach(() => {
  DeviceDiscovery.stopScanSession();
  DeviceDiscovery.clearAll();
  DeviceDiscovery.setConnectedPeerCheck(() => false);
  vi.spyOn(Date, 'now').mockReturnValue(T0);
});

afterEach(() => {
  vi.restoreAllMocks();
  DeviceDiscovery.stopScanSession();
  DeviceDiscovery.clearAll();
});

const heard = (id: string, over: Record<string, unknown> = {}) =>
  DeviceDiscovery.registerDiscoveredPeer({ id, name: id, source: 'web-scan', ...over });

describe('nearby device register', () => {
  it('starts empty and stays empty until a radio reports something', () => {
    expect(DeviceDiscovery.getDiscoveredDevices()).toHaveLength(0);
    DeviceDiscovery.startScanSession();
    DeviceDiscovery.sweep(T0 + 1000);
    // Scanning alone must never manufacture a peer.
    expect(DeviceDiscovery.getDiscoveredDevices()).toHaveLength(0);
  });

  it('ignores a device with no id rather than storing a blank row', () => {
    DeviceDiscovery.registerDiscoveredPeer({ id: '', name: 'Nameless', source: 'web-scan' });
    expect(DeviceDiscovery.getDiscoveredDevices()).toHaveLength(0);
  });

  it('leaves an unreported signal strength absent instead of inventing one', () => {
    // The previous version substituted -65 dBm, which is a plausible reading
    // and therefore indistinguishable from a measured one on screen.
    heard('aa:bb');
    expect(DeviceDiscovery.getDiscoveredDevices()[0].rssi).toBeUndefined();
  });

  it('keeps the measured signal strength it was given', () => {
    heard('aa:bb', { rssi: -42 });
    expect(DeviceDiscovery.getDiscoveredDevices()[0].rssi).toBe(-42);
  });

  it('remembers when a device was first heard, across later sightings', () => {
    heard('aa:bb');
    vi.spyOn(Date, 'now').mockReturnValue(T0 + 5000);
    heard('aa:bb', { rssi: -50 });
    const [device] = DeviceDiscovery.getDiscoveredDevices();
    expect(device.firstSeen).toBe(T0);
    expect(device.lastSeen).toBe(T0 + 5000);
  });
});

describe('presence loop', () => {
  it('drops a device that goes quiet past the presence window', () => {
    heard('quiet-one');
    expect(DeviceDiscovery.getDiscoveredDevices()).toHaveLength(1);

    const window = DeviceDiscovery.getPresenceTimeoutMs();
    DeviceDiscovery.sweep(T0 + window - 1);
    expect(DeviceDiscovery.getDiscoveredDevices(), 'still inside the window').toHaveLength(1);

    DeviceDiscovery.sweep(T0 + window + 1);
    expect(DeviceDiscovery.getDiscoveredDevices(), 'past the window').toHaveLength(0);
  });

  it('keeps a device that keeps advertising', () => {
    const window = DeviceDiscovery.getPresenceTimeoutMs();
    for (let i = 1; i <= 6; i++) {
      const now = T0 + i * (window / 2);
      vi.spyOn(Date, 'now').mockReturnValue(now);
      heard('chatty-one');
      DeviceDiscovery.sweep(now);
    }
    expect(DeviceDiscovery.getDiscoveredDevices()).toHaveLength(1);
  });

  it('never evicts the peer that is actually connected', () => {
    // A connected BLE peripheral usually stops advertising, so presence by
    // advertisement alone would drop the one device we are talking to.
    heard('talking-to-this-one');
    DeviceDiscovery.setConnectedPeerCheck((id) => id === 'talking-to-this-one');
    DeviceDiscovery.sweep(T0 + DeviceDiscovery.getPresenceTimeoutMs() * 10);
    expect(DeviceDiscovery.getDiscoveredDevices()).toHaveLength(1);
  });

  it('counts what it dropped, so the UI can show the loop working', () => {
    heard('one');
    heard('two');
    DeviceDiscovery.startScanSession();
    const status = DeviceDiscovery.sweep(T0 + DeviceDiscovery.getPresenceTimeoutMs() + 1);
    expect(status.droppedForSilence).toBe(2);
    expect(status.present, 'present counts what is in range').toBe(0);
    expect(status.sweeps).toBeGreaterThan(0);
  });

  it('runs on its own once a scan session starts', async () => {
    vi.restoreAllMocks();
    DeviceDiscovery.startScanSession();
    const before = DeviceDiscovery.getSweepStatus().sweeps;
    await new Promise((r) => setTimeout(r, 2400));
    expect(DeviceDiscovery.getSweepStatus().sweeps).toBeGreaterThan(before);
    DeviceDiscovery.stopScanSession();
  }, 6000);

  it('stops sweeping when the scan stops', async () => {
    vi.restoreAllMocks();
    DeviceDiscovery.startScanSession();
    DeviceDiscovery.stopScanSession();
    const before = DeviceDiscovery.getSweepStatus().sweeps;
    await new Promise((r) => setTimeout(r, 2400));
    expect(DeviceDiscovery.getSweepStatus().sweeps).toBe(before);
  }, 6000);
});

describe('a grant is not a sighting', () => {
  /**
   * getDevices() lists what this origin is allowed to talk to. That is a
   * permission, not evidence that the device is in the room. Conflating them
   * meant a device granted once was re-reported by every discovery pass, which
   * refreshed its presence every 8 seconds and made the 12-second sweep unable
   * to ever drop it - a device that left the building last week would have sat
   * in a list headed "in range" indefinitely.
   */
  const grant = (id: string) =>
    DeviceDiscovery.registerDiscoveredPeer({
      id,
      name: id,
      source: 'web-remembered',
      heard: false,
    });

  it('does not count a granted device as being in range', () => {
    grant('allowed-but-absent');
    const [device] = DeviceDiscovery.getDiscoveredDevices();
    expect(device.inRange).toBe(false);
    expect(device.lastHeardAt).toBeUndefined();
  });

  it('counts it once an advertisement actually arrives', () => {
    grant('allowed-and-here');
    DeviceDiscovery.registerDiscoveredPeer({
      id: 'allowed-and-here',
      name: 'allowed-and-here',
      source: 'web-remembered',
      rssi: -55,
      heard: true,
    });
    expect(DeviceDiscovery.getDiscoveredDevices()[0].inRange).toBe(true);
  });

  it('keeps a granted device on the list but stops calling it present', () => {
    grant('allowed-but-absent');
    // Re-granting refreshes lastSeen, exactly as the 8-second pass does.
    vi.spyOn(Date, 'now').mockReturnValue(T0 + 8000);
    grant('allowed-but-absent');

    const status = DeviceDiscovery.sweep(T0 + 8001);
    expect(status.present, 'never heard from, so not present').toBe(0);
    expect(
      DeviceDiscovery.getDiscoveredDevices(),
      'still listed - the user chose it'
    ).toHaveLength(1);
  });

  it('drops a scanned device that goes quiet, since it was only ever a sighting', () => {
    heard('scanned-then-gone');
    DeviceDiscovery.sweep(T0 + DeviceDiscovery.getPresenceTimeoutMs() + 1);
    expect(DeviceDiscovery.getDiscoveredDevices()).toHaveLength(0);
  });

  it('sorts devices that are here above devices that merely might be', () => {
    grant('absent');
    heard('present-now', { rssi: -70 });
    expect(DeviceDiscovery.getDiscoveredDevices().map((d) => d.id)).toEqual([
      'present-now',
      'absent',
    ]);
  });
});

describe('demo peers are kept separable', () => {
  it('removes only the demo entries, leaving real devices alone', () => {
    heard('real-device', { rssi: -60 });
    DeviceDiscovery.registerDiscoveredPeer({ id: 'demo-a', name: 'Demo peer A', source: 'demo' });
    expect(DeviceDiscovery.getDiscoveredDevices()).toHaveLength(2);

    DeviceDiscovery.clearSource('demo');
    const left = DeviceDiscovery.getDiscoveredDevices();
    expect(left).toHaveLength(1);
    expect(left[0].id).toBe('real-device');
  });

  it('tags every device with where it came from', () => {
    heard('scanned');
    DeviceDiscovery.registerDiscoveredPeer({ id: 'demo-a', name: 'D', source: 'demo' });
    const sources = DeviceDiscovery.getDiscoveredDevices().map((d) => d.source);
    expect(sources).toContain('web-scan');
    expect(sources).toContain('demo');
    expect(sources.every(Boolean)).toBe(true);
  });
});

describe('ordering', () => {
  it('puts the strongest signal first and unmeasured devices last', () => {
    heard('weak', { rssi: -90 });
    heard('strong', { rssi: -40 });
    heard('unknown');
    expect(DeviceDiscovery.getDiscoveredDevices().map((d) => d.id)).toEqual([
      'strong',
      'weak',
      'unknown',
    ]);
  });
});

describe('listeners', () => {
  it('tells subscribers when a device arrives and when it is dropped', () => {
    const seen: number[] = [];
    const stop = DeviceDiscovery.addListener((devices) => seen.push(devices.length));
    heard('one');
    DeviceDiscovery.sweep(T0 + DeviceDiscovery.getPresenceTimeoutMs() + 1);
    stop();
    expect(seen).toEqual([0, 1, 0]);
  });

  it('does not re-notify on a sweep that dropped nothing', () => {
    heard('one');
    let calls = 0;
    const stop = DeviceDiscovery.addListener(() => calls++);
    calls = 0;
    DeviceDiscovery.sweep(T0 + 100);
    stop();
    expect(calls).toBe(0);
  });
});
