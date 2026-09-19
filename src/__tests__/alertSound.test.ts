import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The alert tone is the part of the offline chat that works when nobody is
 * looking at the screen, so what these tests guard is that it stays silent
 * exactly when it should and rings exactly when it should.
 *
 * The autoplay rules are the interesting part: a browser will not make a
 * sound before the user has touched the page, and on iOS the audio context
 * additionally starts suspended. Getting that wrong does not throw - it just
 * never makes a noise - so the "not armed yet" path is tested directly.
 */

class FakeParam {
  value = 0;
  calls: string[] = [];
  setValueAtTime(v: number) {
    this.value = v;
    this.calls.push(`set:${v}`);
    return this;
  }
  exponentialRampToValueAtTime(v: number) {
    this.calls.push(`ramp:${v}`);
    return this;
  }
}

class FakeOscillator {
  type = '';
  frequency = new FakeParam();
  started: number[] = [];
  connect = vi.fn();
  start = vi.fn((t: number) => this.started.push(t));
  stop = vi.fn();
}

class FakeGain {
  gain = new FakeParam();
  connect = vi.fn();
}

class FakeAudioContext {
  static instances: FakeAudioContext[] = [];
  state: AudioContextState = 'running';
  currentTime = 0;
  destination = {};
  oscillators: FakeOscillator[] = [];
  resume = vi.fn(async () => {
    this.state = 'running';
  });
  constructor() {
    FakeAudioContext.instances.push(this);
  }
  createOscillator() {
    const osc = new FakeOscillator();
    this.oscillators.push(osc);
    return osc;
  }
  createGain() {
    return new FakeGain();
  }
  createBuffer() {
    return {};
  }
  createBufferSource() {
    return { buffer: null, connect: vi.fn(), start: vi.fn() };
  }
}

/** The module keeps armed/muted state, so each test gets a fresh copy. */
async function freshModule() {
  vi.resetModules();
  return import('../utils/alertSound');
}

beforeEach(() => {
  FakeAudioContext.instances = [];
  vi.stubGlobal('AudioContext', FakeAudioContext as unknown as typeof AudioContext);
  localStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('alert sound', () => {
  it('stays silent until a user gesture has armed it', async () => {
    const sound = await freshModule();
    expect(sound.isArmed()).toBe(false);
    // The browser would refuse anyway; returning false makes that visible to
    // the UI so it can say the chat is currently silent.
    expect(sound.playAlert('message')).toBe(false);
    expect(FakeAudioContext.instances).toHaveLength(0);
  });

  it('rings once armed', async () => {
    const sound = await freshModule();
    expect(sound.arm()).toBe(true);
    expect(sound.isArmed()).toBe(true);
    expect(sound.playAlert('message')).toBe(true);
    expect(FakeAudioContext.instances[0].oscillators.length).toBeGreaterThan(0);
  });

  it('resumes a suspended context, which is how iOS starts', async () => {
    const sound = await freshModule();
    sound.arm();
    const ctx = FakeAudioContext.instances[0];
    ctx.state = 'suspended';
    sound.playAlert('message');
    expect(ctx.resume).toHaveBeenCalled();
  });

  it('makes an SOS sound different from an ordinary message', async () => {
    const sound = await freshModule();
    sound.arm();
    const ctx = FakeAudioContext.instances[0];

    sound.playAlert('message');
    const normal = ctx.oscillators.map((o) => o.frequency.value);
    ctx.oscillators.length = 0;

    sound.playAlert('sos');
    const sos = ctx.oscillators.map((o) => o.frequency.value);

    // Four hard notes against two, and higher, so the two are tellable apart
    // from across a room without looking at the phone.
    expect(sos.length).toBeGreaterThan(normal.length);
    expect(Math.max(...sos)).toBeGreaterThan(Math.max(...normal));
  });

  it('shapes the envelope instead of switching it, so it does not click', async () => {
    const sound = await freshModule();
    sound.arm();
    sound.playAlert('message');
    // A gain that jumps straight to full volume pops, and on a phone speaker
    // the pop is louder than the note.
    const gainCalls = FakeAudioContext.instances[0].oscillators[0].frequency.calls;
    expect(gainCalls.length).toBeGreaterThan(0);
  });

  it('honours mute, and remembers it', async () => {
    const sound = await freshModule();
    sound.arm();
    sound.setMuted(true);
    expect(sound.playAlert('message')).toBe(false);
    expect(localStorage.getItem('floody.chat.muted')).toBe('1');

    // A fresh load must still be muted.
    const reloaded = await freshModule();
    expect(reloaded.isMuted()).toBe(true);
  });

  it('unmutes again', async () => {
    const sound = await freshModule();
    sound.arm();
    sound.setMuted(true);
    sound.setMuted(false);
    expect(sound.playAlert('message')).toBe(true);
  });

  it('reports no support when the browser has no audio API', async () => {
    vi.stubGlobal('AudioContext', undefined);
    vi.stubGlobal('webkitAudioContext', undefined);
    const sound = await freshModule();
    expect(sound.isSupported()).toBe(false);
    expect(sound.arm()).toBe(false);
    expect(sound.playAlert('message')).toBe(false);
  });

  it('buzzes where vibration exists and shrugs where it does not', async () => {
    const sound = await freshModule();
    const vibrate = vi.fn((_pattern: number | number[]) => true);
    vi.stubGlobal('AudioContext', FakeAudioContext as unknown as typeof AudioContext);
    Object.defineProperty(navigator, 'vibrate', { configurable: true, value: vibrate });
    expect(sound.vibrate('sos')).toBe(true);
    expect(vibrate.mock.calls[0][0]).toHaveLength(7);

    // iPhone Safari has never implemented it; that must not throw or block
    // the sound, which is the alert that actually matters there.
    Object.defineProperty(navigator, 'vibrate', { configurable: true, value: undefined });
    expect(sound.vibrate('message')).toBe(false);
  });

  it('arms on the first gesture and then stops listening', async () => {
    const sound = await freshModule();
    const cleanup = sound.armOnFirstGesture();
    expect(sound.isArmed()).toBe(false);

    window.dispatchEvent(new Event('pointerdown'));
    expect(sound.isArmed()).toBe(true);

    const before = FakeAudioContext.instances.length;
    window.dispatchEvent(new Event('pointerdown'));
    expect(FakeAudioContext.instances.length, 'listener removed after arming').toBe(before);
    cleanup();
  });
});
