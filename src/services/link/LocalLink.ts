/**
 * A direct phone-to-phone link over the local network, with no server.
 *
 * This is the part of the offline chat that actually carries messages.
 * Bluetooth cannot: Web Bluetooth only talks to BLE GATT peripherals and a
 * phone running a browser does not advertise itself as one, and iPhone has no
 * Web Bluetooth at all. WebRTC can, and it works on both platforms.
 *
 * What makes it work offline is that no signalling server is involved and no
 * STUN or TURN server is configured. Each peer gathers only host candidates -
 * its own addresses on the local network - and the two descriptions are
 * carried between the phones by the person holding them, as a short code
 * they copy, share over AirDrop or Nearby Share, or read off a screen.
 * Once connected, packets go straight from one handset to the other over
 * Wi-Fi. A router with no uplink is enough; so is one phone's hotspot.
 *
 * The honest limits, which the UI states rather than hides:
 *   - Both phones must be on the same network. Two phones with no Wi-Fi at
 *     all cannot do this, and on iOS the hotspot needs a cellular plan.
 *   - Pairing is two exchanges: host shows a code, joiner returns one. That
 *     is inherent to WebRTC without a server, not a shortcut taken here.
 *
 * This deliberately implements the same seam the Bluetooth path uses -
 * a raw string sender and a raw string receiver - so message chunking,
 * delivery receipts and the ping/pong heartbeat in MessageTransport all work
 * over it unchanged.
 */

import { codeToDescription, sdpToCode } from './sdpCodec';

export type LinkState =
  | 'idle'
  | 'creating-invite'
  | 'awaiting-reply'
  | 'joining'
  | 'connecting'
  | 'connected'
  | 'failed'
  | 'closed';

export interface LinkStatus {
  state: LinkState;
  /** The code to hand to the other phone, when there is one. */
  code: string | null;
  /** What just went wrong, in words meant for the person holding the phone. */
  error: string | null;
  /** Whether this device started the pairing. */
  isHost: boolean;
}

type StatusListener = (status: LinkStatus) => void;
/**
 * `peerId` names the link a packet arrived on. The mesh needs it: the one
 * rule that stops the commonest relay loop is "never send a packet back out
 * of the link it came in on", and that is unenforceable without knowing
 * which link that was.
 */
type PacketListener = (raw: string, peerId: string) => void;
type PeerListener = (event: { type: 'join' | 'leave'; peerId: string }) => void;

/** One established link. A device can hold several at once; that is the mesh. */
interface Peer {
  id: string;
  pc: RTCPeerConnection;
  channel: RTCDataChannel;
}

/**
 * Gathering normally finishes in tens of milliseconds for host candidates.
 * The cap exists because a device with no usable network interface never
 * fires the completion event at all, and the user deserves an error rather
 * than a spinner.
 */
const GATHER_TIMEOUT_MS = 4000;

/** How long to wait for the data channel after both sides have the codes. */
const CONNECT_TIMEOUT_MS = 25000;

class LocalLinkService {
  /**
   * The pairing currently being set up. One at a time, because the
   * three-step code exchange is a conversation with one other phone.
   */
  private pc: RTCPeerConnection | null = null;
  private channel: RTCDataChannel | null = null;

  /**
   * Every link that has finished pairing.
   *
   * This used to be a single connection that each new pairing replaced, so
   * a phone could only ever talk to one other phone and a relay was
   * impossible. Completed pairings are promoted in here instead, which is
   * what lets one device sit in the middle of two others and carry a
   * message between people who never paired with each other.
   */
  private peers = new Map<string, Peer>();
  private peerSeq = 0;

  private status: LinkStatus = { state: 'idle', code: null, error: null, isHost: false };
  private statusListeners = new Set<StatusListener>();
  private packetListeners = new Set<PacketListener>();
  private peerListeners = new Set<PeerListener>();
  private connectTimer: ReturnType<typeof setTimeout> | null = null;

  /* ------------------------------------------------------------ status -- */

  public getStatus(): LinkStatus {
    return this.status;
  }

  public addStatusListener(listener: StatusListener): () => void {
    this.statusListeners.add(listener);
    listener(this.status);
    return () => {
      this.statusListeners.delete(listener);
    };
  }

  public onPacket(listener: PacketListener): () => void {
    this.packetListeners.add(listener);
    return () => {
      this.packetListeners.delete(listener);
    };
  }

  /** Told when a link finishes pairing or drops, so the mesh can follow. */
  public onPeer(listener: PeerListener): () => void {
    this.peerListeners.add(listener);
    for (const id of this.peers.keys()) listener({ type: 'join', peerId: id });
    return () => {
      this.peerListeners.delete(listener);
    };
  }

  private announcePeer(type: 'join' | 'leave', peerId: string): void {
    for (const listener of this.peerListeners) {
      try {
        listener({ type, peerId });
      } catch (err) {
        console.error('[LocalLink] peer listener failed:', err);
      }
    }
  }

  /** Ids of every link currently open. */
  public peerIds(): string[] {
    return [...this.peers.values()].filter((p) => p.channel.readyState === 'open').map((p) => p.id);
  }

  public get peerCount(): number {
    return this.peerIds().length;
  }

  private setStatus(patch: Partial<LinkStatus>): void {
    this.status = { ...this.status, ...patch };
    for (const listener of this.statusListeners) {
      try {
        listener(this.status);
      } catch (err) {
        console.error('[LocalLink] status listener failed:', err);
      }
    }
  }

  public isSupported(): boolean {
    return typeof RTCPeerConnection !== 'undefined';
  }

  public isConnected(): boolean {
    return this.peerIds().length > 0;
  }

  /* ------------------------------------------------------------- setup -- */

  private createPeer(): RTCPeerConnection {
    // No ICE servers on purpose: host candidates only. See the file comment.
    const pc = new RTCPeerConnection({ iceServers: [] });

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed') {
        this.fail(
          'The two phones could not reach each other. Check they are on the same Wi-Fi or hotspot.'
        );
      }
      if (pc.connectionState === 'disconnected' && this.status.state === 'connected') {
        this.setStatus({ state: 'failed', error: 'The other phone went out of range.' });
      }
    };
    return pc;
  }

  private attachChannel(channel: RTCDataChannel): void {
    this.channel = channel;
    // Named now rather than on open, so a packet arriving in the same tick
    // as the open event already has a link to be attributed to.
    const peerId = `peer-${++this.peerSeq}`;
    const pc = this.pc;

    channel.onopen = () => {
      if (this.connectTimer) clearTimeout(this.connectTimer);
      this.connectTimer = null;

      // Promote the finished pairing into the peer set and free the slot,
      // so this phone can immediately pair with another one. That second
      // pairing is what turns two links into a mesh.
      if (pc) this.peers.set(peerId, { id: peerId, pc, channel });
      this.pc = null;
      this.channel = null;

      this.setStatus({ state: 'connected', error: null });
      this.announcePeer('join', peerId);
    };

    channel.onclose = () => {
      const had = this.peers.delete(peerId);
      if (had) this.announcePeer('leave', peerId);
      if (this.peers.size === 0 && this.status.state === 'connected') {
        this.setStatus({ state: 'closed', error: null });
      }
    };

    channel.onmessage = (event) => {
      const raw = typeof event.data === 'string' ? event.data : '';
      if (!raw) return;
      for (const listener of this.packetListeners) {
        try {
          listener(raw, peerId);
        } catch (err) {
          console.error('[LocalLink] packet listener failed:', err);
        }
      }
    };
  }

  /**
   * Waits for ICE gathering to finish so the description carries its
   * addresses. Without this the code would go out with nowhere to connect to,
   * and there is no signalling channel to send candidates along afterwards.
   */
  private async waitForCandidates(pc: RTCPeerConnection): Promise<void> {
    if (pc.iceGatheringState === 'complete') return;
    await new Promise<void>((resolve) => {
      const done = () => {
        pc.removeEventListener('icegatheringstatechange', onChange);
        clearTimeout(timer);
        resolve();
      };
      const onChange = () => {
        if (pc.iceGatheringState === 'complete') done();
      };
      const timer = setTimeout(done, GATHER_TIMEOUT_MS);
      pc.addEventListener('icegatheringstatechange', onChange);
    });
  }

  private armConnectTimeout(): void {
    if (this.connectTimer) clearTimeout(this.connectTimer);
    this.connectTimer = setTimeout(() => {
      if (this.status.state !== 'connected') {
        this.fail(
          'No answer from the other phone. Both must be on the same Wi-Fi or hotspot, ' +
            'and the code has to be used within a few minutes.'
        );
      }
    }, CONNECT_TIMEOUT_MS);
  }

  private fail(message: string): void {
    this.setStatus({ state: 'failed', error: message });
  }

  /* ------------------------------------------------------------ pairing -- */

  /**
   * Step 1, on the phone that starts the chat: produce a code to show.
   */
  public async createInvite(): Promise<string> {
    if (!this.isSupported()) {
      throw new Error('This browser cannot open a direct connection to another phone.');
    }
    this.cancelPending();
    this.setStatus({ state: 'creating-invite', code: null, error: null, isHost: true });

    try {
      const pc = this.createPeer();
      this.pc = pc;
      // The host opens the channel; the joiner receives it via ondatachannel.
      this.attachChannel(pc.createDataChannel('floody-chat', { ordered: true }));

      await pc.setLocalDescription(await pc.createOffer());
      await this.waitForCandidates(pc);

      const code = sdpToCode(pc.localDescription?.sdp ?? '', 'offer');
      this.setStatus({ state: 'awaiting-reply', code });
      return code;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.fail(`Could not start the connection: ${message}`);
      throw err;
    }
  }

  /**
   * Step 2, on the other phone: take the host's code, return one to send back.
   */
  public async acceptInvite(hostCode: string): Promise<string> {
    if (!this.isSupported()) {
      throw new Error('This browser cannot open a direct connection to another phone.');
    }
    this.cancelPending();
    this.setStatus({ state: 'joining', code: null, error: null, isHost: false });

    try {
      const description = codeToDescription(hostCode);
      if (description.type !== 'offer') {
        throw new Error('That is a reply code, not an invitation. Swap the phones around.');
      }

      const pc = this.createPeer();
      this.pc = pc;
      pc.ondatachannel = (event) => this.attachChannel(event.channel);

      await pc.setRemoteDescription(description);
      await pc.setLocalDescription(await pc.createAnswer());
      await this.waitForCandidates(pc);

      const code = sdpToCode(pc.localDescription?.sdp ?? '', 'answer');
      this.setStatus({ state: 'connecting', code });
      this.armConnectTimeout();
      return code;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.fail(message);
      throw err;
    }
  }

  /**
   * Step 3, back on the first phone: take the reply and finish the pairing.
   */
  public async completeInvite(replyCode: string): Promise<void> {
    if (!this.pc) throw new Error('Start a nearby chat first, then enter the reply.');

    try {
      const description = codeToDescription(replyCode);
      if (description.type !== 'answer') {
        throw new Error('That is an invitation code, not a reply.');
      }
      await this.pc.setRemoteDescription(description);
      this.setStatus({ state: 'connecting', error: null });
      this.armConnectTimeout();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.fail(message);
      throw err;
    }
  }

  /* -------------------------------------------------------------- send -- */

  /**
   * Sends one raw packet to every open link.
   *
   * True when at least one link took it. The mesh usually calls `sendTo`
   * instead, because it has to exclude the link a packet arrived on; this
   * remains for anything that just wants to reach whoever is there.
   */
  public send(raw: string): boolean {
    let sent = false;
    for (const id of this.peerIds()) sent = this.sendTo(id, raw) || sent;
    return sent;
  }

  /** Sends to one named link. */
  public sendTo(peerId: string, raw: string): boolean {
    const peer = this.peers.get(peerId);
    if (peer?.channel.readyState !== 'open') return false;
    try {
      peer.channel.send(raw);
      return true;
    } catch (err) {
      console.error('[LocalLink] send failed:', err);
      return false;
    }
  }

  /**
   * Abandons the pairing being set up, leaving established links alone.
   *
   * `createInvite` and `acceptInvite` used to call `close()` here, which was
   * harmless when there was only ever one connection and fatal once there
   * could be several: starting a second pairing hung up on the first, so a
   * phone could never hold the two links a relay is made of.
   */
  private cancelPending(): void {
    if (this.connectTimer) clearTimeout(this.connectTimer);
    this.connectTimer = null;
    try {
      this.channel?.close();
    } catch {
      // Already closed.
    }
    try {
      this.pc?.close();
    } catch {
      // Already closed.
    }
    this.channel = null;
    this.pc = null;
  }

  /** Closes every link and the pairing in progress. */
  public close(): void {
    if (this.connectTimer) clearTimeout(this.connectTimer);
    this.connectTimer = null;

    for (const peer of [...this.peers.values()]) {
      try {
        peer.channel.close();
        peer.pc.close();
      } catch {
        // Already closed.
      }
      this.peers.delete(peer.id);
      this.announcePeer('leave', peer.id);
    }

    try {
      this.channel?.close();
    } catch {
      // Already closed.
    }
    try {
      this.pc?.close();
    } catch {
      // Already closed.
    }
    this.channel = null;
    this.pc = null;
    if (this.status.state !== 'idle') {
      this.setStatus({ state: 'idle', code: null, error: null, isHost: false });
    }
  }
}

export const LocalLink = new LocalLinkService();
