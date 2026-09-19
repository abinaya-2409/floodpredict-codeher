/**
 * FloodyPredict - Real nearby-device discovery over the browser's radio.
 *
 * This file exists because the device list used to be three hardcoded names -
 * "Disaster Recon Unit 4", "Velachery Community Shelter", "Citizen
 * Water-Rescue 09" - that appeared whether or not anything was nearby, and
 * disappeared for nobody. Every device below comes from the radio. If nothing
 * is in range, the list is empty, and that is the correct answer.
 *
 * A browser has four ways to learn that a device is nearby, and they differ
 * in how much they need the user to do. They are tried in that order:
 *
 *   1. requestLEScan()        - a passive listen. Real advertisements, real
 *                               RSSI, arriving on their own for as long as
 *                               the scan runs. Needs the user to allow
 *                               scanning once, and on desktop Chrome needs
 *                               the experimental web platform features flag.
 *   2. getDevices()           - devices this origin has already been granted.
 *                               No prompt, no tap.
 *   3. watchAdvertisements()  - presence for those remembered devices, so one
 *                               announces itself whenever it is in range.
 *   4. requestDevice()        - the browser's own chooser. A real scan of real
 *                               hardware, but the browser draws the window and
 *                               it takes a tap to open.
 *
 * The ordering property that matters: 1-3 need no interaction at all after
 * the first grant, which is what keeps the list current by itself.
 *
 * One behaviour worth knowing about, because it cost me a hung test: if the
 * page has never been granted scan permission, requestLEScan() does not
 * reject - it waits on a prompt, forever if nothing answers. Awaiting it bare
 * freezes whatever called it. Every call here is raced against a deadline.
 */

/* -------------------------------------------------------------------------
 * Minimal structural types.
 *
 * @types/web-bluetooth is not installed and is not worth a dependency for the
 * four calls used here. These describe only what is actually touched.
 * ---------------------------------------------------------------------- */

interface BluetoothDeviceLike extends EventTarget {
  id: string;
  name?: string;
  watchAdvertisements?: (options?: { signal?: AbortSignal }) => Promise<void>;
  gatt?: { connected: boolean; connect: () => Promise<unknown>; disconnect: () => void };
}

interface AdvertisementEventLike extends Event {
  device: BluetoothDeviceLike;
  rssi?: number;
  txPower?: number;
  name?: string;
}

interface LEScanLike {
  active: boolean;
  stop: () => void;
}

interface BluetoothLike {
  getAvailability?: () => Promise<boolean>;
  getDevices?: () => Promise<BluetoothDeviceLike[]>;
  requestDevice?: (options: unknown) => Promise<BluetoothDeviceLike>;
  requestLEScan?: (options: unknown) => Promise<LEScanLike>;
  addEventListener?: EventTarget['addEventListener'];
  removeEventListener?: EventTarget['removeEventListener'];
}

/** Where a device came from. Shown in the UI so nothing is mistaken for a demo. */
export type DiscoverySource =
  | 'native'           // Android BLE scan through the installed app
  | 'web-scan'         // requestLEScan advertisement
  | 'web-remembered'   // getDevices + watchAdvertisements
  | 'web-chooser'      // picked by the user in the browser's own chooser
  | 'local-link'       // paired over the local network, the one that carries messages
  | 'demo';            // the two-device walkthrough, never mixed with the above

export interface RadioDevice {
  id: string;
  name: string;
  rssi?: number;
  source: DiscoverySource;
  /**
   * True when a radio heard from this device just now.
   *
   * False for a device that is merely granted - getDevices() lists what this
   * origin may talk to, which is not the same as what is in range, and
   * treating the two alike is how a list of nearby devices fills up with
   * devices that are not nearby.
   */
  heard: boolean;
}

export type OnDeviceFound = (device: RadioDevice) => void;

export interface BluetoothSupport {
  /** navigator.bluetooth exists at all. False on Firefox and iOS Safari. */
  hasApi: boolean;
  /** An adapter is present and powered. Undefined when it cannot be asked. */
  adapterAvailable: boolean | undefined;
  /** requestLEScan exists - the only fully hands-off discovery a browser has. */
  canScanPassively: boolean;
  /** getDevices exists - remembered devices can be re-found without a prompt. */
  canRemember: boolean;
  /** A sentence for the UI explaining exactly what this browser will do. */
  summary: string;
}

/** requestLEScan waits on a prompt rather than rejecting, so it gets a deadline. */
const SCAN_PERMISSION_DEADLINE_MS = 4000;
/** The chooser is a user-driven window; it may sit open for a while. */
const CHOOSER_DEADLINE_MS = 120000;

function withDeadline<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} did not answer within ${ms}ms`)), ms)
    ),
  ]);
}

function radio(): BluetoothLike | null {
  if (typeof navigator === 'undefined') return null;
  return (navigator as Navigator & { bluetooth?: BluetoothLike }).bluetooth ?? null;
}

/**
 * Names learned from the radio, kept so a device keeps its name across reloads.
 *
 * getDevices() returns a granted device with an empty name until something
 * has been heard from it again, so after a refresh the phone the user picked
 * came back as "Unnamed device SGTW". The name below is not invented: it is
 * the one the browser itself reported when the device was chosen or last
 * advertised, and it is only ever used for the device with that exact id.
 */
const NAME_CACHE_KEY = 'floody.bt.deviceNames';

function loadNameCache(): Record<string, string> {
  try {
    const raw = localStorage.getItem(NAME_CACHE_KEY);
    return raw ? (JSON.parse(raw) as Record<string, string>) : {};
  } catch {
    return {};
  }
}

function rememberName(id: string, name: string): void {
  if (!id || !name) return;
  try {
    const cache = loadNameCache();
    if (cache[id] === name) return;
    cache[id] = name;
    localStorage.setItem(NAME_CACHE_KEY, JSON.stringify(cache));
  } catch {
    // Private browsing, or storage full. The name is simply not remembered.
  }
}

/**
 * A readable name for a device that may not advertise one.
 *
 * Phones increasingly advertise with a rotating address and no name, for
 * privacy. Calling three such devices "Unknown" is useless, so each falls
 * back to the tail of its address - stable for as long as it is in range,
 * and what the user sees in their own Bluetooth settings.
 */
function readableName(device: BluetoothDeviceLike, advertisedName?: string): string {
  const given = (advertisedName || device.name || '').trim();
  if (given) {
    rememberName(device.id, given);
    return given;
  }
  const remembered = loadNameCache()[device.id];
  if (remembered) return remembered;
  const tail = (device.id || '').replace(/[^A-Za-z0-9]/g, '').slice(-4).toUpperCase();
  return tail ? `Unnamed device ${tail}` : 'Unnamed device';
}

class WebBluetoothScannerService {
  private scan: LEScanLike | null = null;
  private watchAbort: AbortController | null = null;
  private listenerCleanups: Array<() => void> = [];
  /** Remembered devices already armed, so re-running discovery does not stack listeners. */
  private watched = new Set<string>();

  /** What this browser can actually do. Asked fresh; adapters get switched off. */
  public async describeSupport(): Promise<BluetoothSupport> {
    const bt = radio();
    if (!bt) {
      return {
        hasApi: false,
        adapterAvailable: false,
        canScanPassively: false,
        canRemember: false,
        summary:
          'This browser has no Bluetooth API at all, so no device can be found from a web ' +
          'page. Chrome, Edge and Samsung Internet can; Firefox and iPhone Safari cannot.',
      };
    }

    let adapterAvailable: boolean | undefined;
    try {
      const ask = bt.getAvailability?.();
      adapterAvailable = ask ? await withDeadline(ask, 2000, 'getAvailability') : undefined;
    } catch {
      adapterAvailable = undefined;
    }

    const canScanPassively = typeof bt.requestLEScan === 'function';
    const canRemember = typeof bt.getDevices === 'function';

    let summary: string;
    if (adapterAvailable === false) {
      summary = 'Bluetooth is switched off on this device. Turn it on, then scan again.';
    } else if (canScanPassively) {
      summary =
        'This browser can listen for nearby devices on its own. Allow scanning when asked, ' +
        'and the list below fills and empties by itself as devices come and go.';
    } else if (canRemember) {
      summary =
        'This browser finds devices you have allowed before without asking again. Add a ' +
        'device once with the button below and it is detected automatically from then on.';
    } else {
      summary = 'This browser can only reach a device you pick from its own chooser.';
    }

    return { hasApi: true, adapterAvailable, canScanPassively, canRemember, summary };
  }

  /**
   * Re-finds every device this origin has already been granted, and arms each
   * one so it reports itself whenever it is in range.
   *
   * This is the closest a browser gets to "detects nearby devices by itself":
   * after one grant there is no prompt and no tap, on this visit or any later
   * one. Returns how many were armed.
   */
  public async adoptRemembered(onFound: OnDeviceFound): Promise<number> {
    const bt = radio();
    if (!bt?.getDevices) return 0;

    let devices: BluetoothDeviceLike[] = [];
    try {
      devices = await withDeadline(bt.getDevices(), 3000, 'getDevices');
    } catch {
      return 0;
    }

    if (!this.watchAbort) this.watchAbort = new AbortController();

    for (const device of devices) {
      // A remembered device is known to exist but is not necessarily in range.
      // It is reported now so the user can see it, and its lastSeen is
      // refreshed by advertisements; if none arrive it ages out of the list.
      // A grant, not a sighting: this device is allowed, not necessarily here.
      onFound({
        id: device.id,
        name: readableName(device),
        source: 'web-remembered',
        heard: false,
      });

      if (this.watched.has(device.id)) continue;
      this.watched.add(device.id);

      const handler = (event: Event) => {
        const advert = event as AdvertisementEventLike;
        // An advertisement did arrive, so this one really is in range.
        onFound({
          id: device.id,
          name: readableName(device, advert.name),
          rssi: typeof advert.rssi === 'number' ? advert.rssi : undefined,
          source: 'web-remembered',
          heard: true,
        });
      };
      device.addEventListener('advertisementreceived', handler);
      this.listenerCleanups.push(() =>
        device.removeEventListener('advertisementreceived', handler)
      );

      try {
        await withDeadline(
          device.watchAdvertisements?.({ signal: this.watchAbort.signal }) ?? Promise.resolve(),
          3000,
          'watchAdvertisements'
        );
      } catch {
        // Not fatal. Some platforms refuse to watch while a GATT connection is
        // open, and some have not shipped it. The device stays in the list.
      }
    }

    return devices.length;
  }

  /**
   * Starts a passive listen for anything advertising nearby.
   *
   * Every device reported here is one whose advertisement actually arrived at
   * this radio. Nothing is added speculatively.
   */
  public async startPassiveScan(
    onFound: OnDeviceFound
  ): Promise<{ started: boolean; reason?: string }> {
    const bt = radio();
    if (!bt?.requestLEScan) {
      return {
        started: false,
        reason:
          'This browser cannot listen for advertisements on its own. On desktop Chrome that ' +
          'is behind chrome://flags/#enable-experimental-web-platform-features.',
      };
    }
    if (this.scan?.active) return { started: true };

    const handler = (event: Event) => {
      const advert = event as AdvertisementEventLike;
      if (!advert.device) return;
      onFound({
        id: advert.device.id,
        name: readableName(advert.device, advert.name),
        rssi: typeof advert.rssi === 'number' ? advert.rssi : undefined,
        source: 'web-scan',
        heard: true,
      });
    };
    bt.addEventListener?.('advertisementreceived', handler);
    this.listenerCleanups.push(() => bt.removeEventListener?.('advertisementreceived', handler));

    try {
      // Deadlined deliberately: with no prior grant this call waits on a
      // permission prompt and never settles on its own.
      this.scan = await withDeadline(
        bt.requestLEScan({ acceptAllAdvertisements: true, keepRepeatedDevices: true }),
        SCAN_PERMISSION_DEADLINE_MS,
        'requestLEScan'
      );
      return { started: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        started: false,
        reason: /did not answer/.test(message)
          ? 'Scanning was not allowed. Choose Allow on the Bluetooth scanning prompt, then scan again.'
          : `Scanning could not start: ${message}`,
      };
    }
  }

  /**
   * Opens the browser's own device chooser.
   *
   * The chooser is a real scan - the devices in it are the ones in range -
   * but the browser draws the window itself and hands back only the one the
   * user picks. It is the fallback for browsers with no passive scan, and the
   * way a device becomes "remembered" for the automatic path above.
   */
  public async openChooser(onFound: OnDeviceFound): Promise<{ ok: boolean; reason?: string }> {
    const bt = radio();
    if (!bt?.requestDevice) {
      return { ok: false, reason: 'This browser has no Bluetooth device chooser.' };
    }
    try {
      const device = await withDeadline(
        bt.requestDevice({ acceptAllDevices: true }),
        CHOOSER_DEADLINE_MS,
        'requestDevice'
      );
      // The chooser only ever lists devices the radio can see, so a device
      // picked from it was in range at that moment.
      onFound({ id: device.id, name: readableName(device), source: 'web-chooser', heard: true });
      return { ok: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      // Cancelling the chooser is a normal thing to do, not an error to report.
      if (/cancell?ed|NotFoundError|chooser/i.test(message)) return { ok: false };
      return { ok: false, reason: message };
    }
  }

  /** Stops every scan and listener this service started. */
  public stop(): void {
    try {
      this.scan?.stop();
    } catch {
      // Already stopped, or the page is unloading.
    }
    this.scan = null;
    this.watchAbort?.abort();
    this.watchAbort = null;
    for (const cleanup of this.listenerCleanups.splice(0)) {
      try {
        cleanup();
      } catch {
        // The device may already be gone.
      }
    }
    this.watched.clear();
  }

  public isPassiveScanActive(): boolean {
    return !!this.scan?.active;
  }
}

export const WebBluetoothScanner = new WebBluetoothScannerService();
