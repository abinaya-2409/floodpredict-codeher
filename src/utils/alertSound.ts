/**
 * The sound a new message makes.
 *
 * A phone in a pocket during a flood is the whole point of this feature, so
 * an arriving message has to be audible without anyone watching the screen.
 *
 * Synthesised rather than shipped as an audio file, for two reasons: it costs
 * no bytes in a cache that has to survive on a phone with no network, and a
 * short sine chime survives a tinny phone speaker better than a compressed
 * clip does.
 *
 * The awkward part is autoplay policy. Neither iOS nor Android will let a
 * page make a sound until the user has interacted with it, and on iOS the
 * AudioContext additionally starts "suspended" and must be resumed from
 * inside a real gesture handler - not from a promise that a gesture happened
 * to start. So: one listener arms the audio on the first touch anywhere, and
 * until that happens `isArmed()` is false and the UI says the chat will be
 * silent. Pretending otherwise would mean someone misses a rescue message
 * because we quietly failed to make a noise.
 */

export type AlertKind = 'message' | 'sos';

let ctx: AudioContext | null = null;
let armed = false;

const MUTE_KEY = 'floody.chat.muted';

/**
 * Read live rather than cached at import.
 *
 * Caching it meant the setting was whatever it had been when the module
 * first loaded, so a second tab - or the app reopening from the service
 * worker cache - could disagree about whether the chat was muted.
 */
function readMuted(): boolean {
  try {
    return localStorage.getItem(MUTE_KEY) === '1';
  } catch {
    return false;
  }
}

function AudioCtor(): typeof AudioContext | undefined {
  if (typeof window === 'undefined') return undefined;
  return window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
}

/** Whether this browser can make a sound at all. */
export function isSupported(): boolean {
  return !!AudioCtor();
}

/** True once a user gesture has unlocked audio output. */
export function isArmed(): boolean {
  return armed && !!ctx && ctx.state === 'running';
}

export function isMuted(): boolean {
  return readMuted();
}

export function setMuted(next: boolean): void {
  try {
    localStorage.setItem(MUTE_KEY, next ? '1' : '0');
  } catch {
    // Private browsing. The setting lasts for this session only.
  }
}

/**
 * Unlocks audio. Must be called synchronously from a user gesture.
 *
 * Safe to call repeatedly; after the first success it is a no-op.
 */
export function arm(): boolean {
  const Ctor = AudioCtor();
  if (!Ctor) return false;
  try {
    if (!ctx) ctx = new Ctor();
    if (ctx.state === 'suspended') void ctx.resume();
    // iOS keeps a context suspended until something has actually played, so
    // a silent one-frame buffer is nudged through it here.
    const buffer = ctx.createBuffer(1, 1, 22050);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);
    source.start(0);
    armed = true;
    return true;
  } catch {
    return false;
  }
}

/** Installs the one-time gesture listener that arms audio. */
export function armOnFirstGesture(): () => void {
  if (typeof window === 'undefined') return () => {};
  const events: Array<keyof WindowEventMap> = ['pointerdown', 'touchstart', 'keydown'];
  const onGesture = () => {
    if (arm()) cleanup();
  };
  const cleanup = () => {
    for (const name of events) window.removeEventListener(name, onGesture);
  };
  for (const name of events) window.addEventListener(name, onGesture, { passive: true });
  return cleanup;
}

/** One sine blip. */
function blip(startAt: number, frequency: number, durationS: number, peak: number): void {
  if (!ctx) return;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(frequency, startAt);

  // Shaped rather than switched: a square-edged gain change clicks, and on a
  // small speaker the click is louder than the note.
  gain.gain.setValueAtTime(0.0001, startAt);
  gain.gain.exponentialRampToValueAtTime(peak, startAt + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, startAt + durationS);

  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(startAt);
  osc.stop(startAt + durationS + 0.02);
}

/**
 * Plays the alert for an arriving message.
 *
 * An ordinary message is a two-note rising chime. An SOS is four hard notes
 * at a higher pitch and volume, because the two must be distinguishable from
 * across a room without looking.
 */
export function playAlert(kind: AlertKind = 'message'): boolean {
  if (readMuted() || !armed || !ctx) return false;
  if (ctx.state === 'suspended') void ctx.resume();

  const t = ctx.currentTime;
  if (kind === 'sos') {
    for (let i = 0; i < 4; i++) blip(t + i * 0.18, 988, 0.14, 0.5);
  } else {
    blip(t, 660, 0.12, 0.28);
    blip(t + 0.14, 880, 0.18, 0.28);
  }
  return true;
}

/**
 * Buzzes the phone alongside the sound.
 *
 * Android honours this; iOS Safari has never implemented navigator.vibrate
 * and silently ignores it, which is why the sound is not conditional on it.
 */
export function vibrate(kind: AlertKind = 'message'): boolean {
  if (readMuted()) return false;
  const pattern = kind === 'sos' ? [90, 70, 90, 70, 90, 70, 220] : [55, 45, 110];
  try {
    return typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function'
      ? navigator.vibrate(pattern)
      : false;
  } catch {
    return false;
  }
}

/** Sound plus buzz, for a message that has just arrived. */
export function notifyIncoming(kind: AlertKind = 'message'): void {
  playAlert(kind);
  vibrate(kind);
}
