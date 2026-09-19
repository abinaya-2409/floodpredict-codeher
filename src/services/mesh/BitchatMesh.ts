/**
 * A BitChat-style mesh, over the links a browser can actually open.
 *
 * ---------------------------------------------------------------------------
 * What BitChat does, and what a web app can borrow
 * ---------------------------------------------------------------------------
 *
 * BitChat is a Bluetooth LE mesh chat app: no servers, no accounts, no phone
 * numbers. Every phone is both a BLE central and a BLE peripheral, so any two
 * in range connect, and a message addressed to someone out of range is
 * relayed by whoever is in the middle. Four ideas carry it:
 *
 *   1. Flooding with a TTL. A message is forwarded to every peer except the
 *      one it arrived from, and its hop budget decrements each time. No
 *      routing tables, no topology discovery, no coordinator.
 *   2. Deduplication by message id. Flooding a graph with cycles would
 *      otherwise loop forever; remembering what you have already seen is what
 *      makes the flood terminate.
 *   3. Store and forward. A message for someone not currently reachable is
 *      held and offered when they next appear, so two people who are never
 *      in range at the same moment can still exchange one.
 *   4. Fragmentation. A BLE characteristic write is small; a message is not.
 *
 * The part a browser cannot have is the transport. **Web Bluetooth can only
 * act as a GATT central.** There is no API for a page to advertise as a
 * peripheral, so two browsers can never see each other over BLE, and a true
 * BLE mesh is not available to a PWA at any amount of effort. That is a
 * platform limit, and pretending otherwise would be the worst thing this
 * file could do.
 *
 * What is available is WebRTC over the local network, which this app already
 * uses for phone-to-phone chat with no server. Those links are point to
 * point, so before this file a message could only reach someone you had
 * personally paired with. The four ideas above are transport-agnostic, and
 * applying them to those links buys the thing that actually matters:
 *
 *      A ── B ── C
 *
 * A and C never paired and may not be able to reach each other at all. With
 * a mesh, A's message reaches C because B relays it. In a flood, that is the
 * difference between a message reaching the one person who can help and not.
 *
 * The same code drives BLE unchanged in the Capacitor Android build, where a
 * phone can be a peripheral. Nothing here knows what a link is made of.
 *
 * ---------------------------------------------------------------------------
 * Design notes
 * ---------------------------------------------------------------------------
 *
 * Every parameter here is chosen for a flood, not for a chat app. Hop count
 * is small because each hop is a phone holding still long enough to relay.
 * The store is bounded in both count and age because the device holding it
 * is someone's phone on a dwindling battery, and an unbounded relay cache is
 * a denial of service that arrives looking like a feature.
 */

/** How many times a message may be relayed before it is dropped. */
export const MAX_TTL = 7;

/** How long a seen id is remembered. Longer than any plausible relay path. */
export const SEEN_TTL_MS = 30 * 60 * 1000;

/** How long an undelivered message is held for a peer who is not here yet. */
export const STORE_TTL_MS = 12 * 60 * 60 * 1000;

/** Hard cap on the store-and-forward cache. */
export const MAX_STORED = 200;

/** Hard cap on remembered ids, so the dedup set cannot grow without bound. */
export const MAX_SEEN = 2000;

/**
 * Payload bytes per fragment.
 *
 * Sized for a BLE characteristic write at the default 23-byte MTU with room
 * for the envelope, because that is the smallest link this has to cross. A
 * WebRTC data channel would take far more, but a message that can cross BLE
 * can cross anything.
 */
export const FRAGMENT_BYTES = 150;

export type MeshPacketKind = 'msg' | 'ack' | 'announce';

export interface MeshPacket {
  /** Unique per originated message. The key to deduplication. */
  id: string;
  /** Who first sent it. Never rewritten by a relay. */
  origin: string;
  /** Who it is for, or null for everyone. */
  to: string | null;
  kind: MeshPacketKind;
  /** Remaining hops. Decremented on every relay; dropped at zero. */
  ttl: number;
  /** When the origin created it, epoch ms. */
  ts: number;
  /** Opaque to the mesh. The chat layer owns what is in here. */
  body: string;
  /** Set when the body is one piece of a larger message. */
  frag?: { mid: string; i: number; n: number };
}

/** A link to one other device. The mesh does not care what it is made of. */
export interface MeshLink {
  /** Stable id for the peer at the far end. */
  peerId: string;
  /** Returns false if the packet could not be handed to the link. */
  send: (packet: string) => boolean | Promise<boolean>;
}

export interface MeshEvents {
  /** A packet addressed to this device, reassembled. */
  onMessage?: (packet: MeshPacket) => void;
  /** A packet was relayed onward. Useful for showing the mesh is working. */
  onRelay?: (packet: MeshPacket, toPeers: string[]) => void;
  /** A peer appeared and was offered everything held for it. */
  onFlush?: (peerId: string, count: number) => void;
}

interface StoredPacket {
  packet: MeshPacket;
  storedAt: number;
}

export class BitchatMesh {
  private links = new Map<string, MeshLink>();
  private seen = new Map<string, number>();
  private store: StoredPacket[] = [];
  private fragments = new Map<string, { parts: (string | undefined)[]; n: number; at: number }>();
  private events: MeshEvents = {};

  constructor(private selfId: string) {}

  setSelfId(id: string): void {
    this.selfId = id;
  }

  on(events: MeshEvents): void {
    this.events = { ...this.events, ...events };
  }

  /* ------------------------------------------------------------- links --- */

  /**
   * Registers a link and offers it everything held for that peer.
   *
   * The flush is the whole point of store-and-forward: the moment someone
   * becomes reachable is the moment the messages waiting for them go out.
   */
  addLink(link: MeshLink): void {
    this.links.set(link.peerId, link);
    void this.flushTo(link);
  }

  removeLink(peerId: string): void {
    this.links.delete(peerId);
  }

  get peerCount(): number {
    return this.links.size;
  }

  peers(): string[] {
    return [...this.links.keys()];
  }

  /* ---------------------------------------------------------- sending --- */

  /**
   * Originates a message.
   *
   * Returns the packet ids that were created: more than one when the body
   * had to be fragmented.
   */
  async send(body: string, to: string | null = null, kind: MeshPacketKind = 'msg'): Promise<string[]> {
    const now = Date.now();
    const pieces = fragmentBody(body);
    const mid = randomId();
    const ids: string[] = [];

    for (let i = 0; i < pieces.length; i++) {
      const packet: MeshPacket = {
        id: pieces.length > 1 ? `${mid}:${i}` : mid,
        origin: this.selfId,
        to,
        kind,
        ttl: MAX_TTL,
        ts: now,
        body: pieces[i],
        ...(pieces.length > 1 ? { frag: { mid, i, n: pieces.length } } : {}),
      };
      // Our own packets are "seen" immediately, so a relay that loops one
      // back to us is dropped rather than delivered to ourselves.
      this.remember(packet.id);
      ids.push(packet.id);
      await this.broadcast(packet, null);
      this.hold(packet);
    }
    return ids;
  }

  /* --------------------------------------------------------- receiving --- */

  /**
   * Handles a packet arriving on a link.
   *
   * `fromPeer` is the link it came in on, and is the one link it is never
   * sent back out of - the single rule that stops the most common loop.
   */
  async receive(raw: string, fromPeer: string): Promise<void> {
    const packet = parsePacket(raw);
    if (!packet) return;

    // Already seen: the flood has reached here by another path. Drop it.
    // Without this, any cycle in the graph relays forever.
    if (this.seen.has(packet.id)) return;
    this.remember(packet.id);

    const forMe = packet.to === null || packet.to === this.selfId;
    if (forMe) this.deliver(packet);

    // A message addressed to one person still relays: the recipient may be
    // further along. A broadcast relays too, so everyone hears it.
    if (packet.ttl > 1 && packet.origin !== this.selfId) {
      const onward: MeshPacket = { ...packet, ttl: packet.ttl - 1 };
      const sentTo = await this.broadcast(onward, fromPeer);
      if (sentTo.length) this.events.onRelay?.(onward, sentTo);
      // Held so a peer who is not here yet can still get it.
      if (!forMe || packet.to === null) this.hold(onward);
    }
  }

  /* ------------------------------------------------------------ internals */

  /** Sends to every link except one. Returns the peers it reached. */
  private async broadcast(packet: MeshPacket, exceptPeer: string | null): Promise<string[]> {
    const raw = JSON.stringify(packet);
    const reached: string[] = [];
    for (const [peerId, link] of this.links) {
      if (peerId === exceptPeer) continue;
      // Addressed packets go to every link, not just the addressee's: the
      // whole point of a mesh is that the peer in front of you may be the
      // path to the one you want. TTL and dedup are what bound the cost.
      try {
        if (await link.send(raw)) reached.push(peerId);
      } catch {
        // A dead link is not an error worth propagating: the packet is in
        // the store and will be offered again when the peer returns.
      }
    }
    return reached;
  }

  /** Reassembles fragments, then hands the message up. */
  private deliver(packet: MeshPacket): void {
    if (!packet.frag) {
      this.events.onMessage?.(packet);
      return;
    }

    const { mid, i, n } = packet.frag;
    const entry = this.fragments.get(mid) ?? { parts: new Array(n), n, at: Date.now() };
    entry.parts[i] = packet.body;
    this.fragments.set(mid, entry);

    if (entry.parts.filter((p) => p !== undefined).length === n) {
      this.fragments.delete(mid);
      this.events.onMessage?.({ ...packet, body: entry.parts.join(''), frag: undefined });
    }
  }

  private remember(id: string): void {
    this.seen.set(id, Date.now());
    if (this.seen.size > MAX_SEEN) this.prune();
  }

  private hold(packet: MeshPacket): void {
    this.store.push({ packet, storedAt: Date.now() });
    if (this.store.length > MAX_STORED) this.store.splice(0, this.store.length - MAX_STORED);
  }

  /** Offers a newly-arrived peer everything still worth sending. */
  private async flushTo(link: MeshLink): Promise<void> {
    this.prune();
    let sent = 0;
    for (const { packet } of this.store) {
      // Not back to where it came from, and not to its own author.
      if (packet.origin === link.peerId) continue;
      if (packet.to !== null && packet.to !== link.peerId && packet.ttl <= 1) continue;
      try {
        if (await link.send(JSON.stringify(packet))) sent++;
      } catch {
        break;
      }
    }
    if (sent) this.events.onFlush?.(link.peerId, sent);
  }

  /** Drops what is too old, then what is merely oldest. */
  private prune(now = Date.now()): void {
    for (const [id, at] of this.seen) {
      if (now - at > SEEN_TTL_MS) this.seen.delete(id);
    }
    if (this.seen.size > MAX_SEEN) {
      const oldest = [...this.seen.entries()].sort((a, b) => a[1] - b[1]);
      for (const [id] of oldest.slice(0, this.seen.size - MAX_SEEN)) this.seen.delete(id);
    }

    this.store = this.store.filter((s) => now - s.storedAt <= STORE_TTL_MS).slice(-MAX_STORED);

    for (const [mid, f] of this.fragments) {
      // A half-arrived message whose rest never came is not going to.
      if (now - f.at > SEEN_TTL_MS) this.fragments.delete(mid);
    }
  }

  /** Test seam and a clean slate when the chat screen is left. */
  reset(): void {
    this.links.clear();
    this.seen.clear();
    this.store = [];
    this.fragments.clear();
  }

  /** What the interface shows about the mesh. */
  stats(): { peers: number; seen: number; stored: number; pendingFragments: number } {
    return {
      peers: this.links.size,
      seen: this.seen.size,
      stored: this.store.length,
      pendingFragments: this.fragments.size,
    };
  }
}

/* ------------------------------------------------------------- helpers --- */

export function randomId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID().slice(0, 18);
  return Math.random().toString(36).slice(2, 12) + Date.now().toString(36);
}

/**
 * Splits a body into link-sized pieces.
 *
 * Counts UTF-8 bytes, not characters: a Tamil message is roughly three bytes
 * a character, so splitting on length would produce fragments two to three
 * times over the MTU and every one of them would fail to send.
 */
export function fragmentBody(body: string, limit = FRAGMENT_BYTES): string[] {
  const encoder = new TextEncoder();
  if (encoder.encode(body).length <= limit) return [body];

  const pieces: string[] = [];
  let current = '';
  // Iterating the string yields whole code points, so a fragment boundary
  // can never fall inside one.
  for (const ch of body) {
    const next = current + ch;
    if (encoder.encode(next).length > limit) {
      pieces.push(current);
      current = ch;
    } else {
      current = next;
    }
  }
  if (current) pieces.push(current);
  return pieces;
}

export function parsePacket(raw: string): MeshPacket | null {
  try {
    const p = JSON.parse(raw) as MeshPacket;
    if (typeof p?.id !== 'string' || typeof p?.origin !== 'string') return null;
    if (typeof p?.ttl !== 'number' || p.ttl < 0 || p.ttl > MAX_TTL) return null;
    if (typeof p?.body !== 'string') return null;
    if (p.to !== null && typeof p.to !== 'string') return null;
    return p;
  } catch {
    return null;
  }
}
