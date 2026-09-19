/**
 * Squeezes a WebRTC session description down to something a person can pass
 * to the phone next to them, and rebuilds it on the other side.
 *
 * Why this exists: two phones can talk directly over WebRTC with no server
 * at all, but only if each one learns the other's description first. With no
 * internet there is no signalling server to do that, so the description has
 * to travel by hand - copied, shared over AirDrop or Nearby Share, or read
 * from a screen. A raw offer is ~720 characters of SDP, most of it boilerplate
 * that is identical on every device.
 *
 * Almost all of it is reconstructible. What genuinely differs between two
 * peers is five things:
 *
 *   - the ICE username fragment and password, which authenticate the pairing
 *   - the DTLS certificate fingerprint, which is what actually secures it
 *   - the DTLS role (who acts as client)
 *   - the host candidates: where on the local network to send packets
 *
 * Everything else is a fixed template. Encoding only those five brings the
 * payload from ~720 characters to ~180, which is short enough to copy, and
 * short enough for a QR code later.
 *
 * Deliberately host candidates only. No STUN, no TURN, no relay: the link is
 * meant to work with the internet gone, which means it works over the local
 * Wi-Fi or a phone's hotspot and nowhere else. That is a real limit and it is
 * the honest one - a code that silently needed a STUN server would fail in
 * exactly the situation this feature exists for.
 */

export interface LinkParts {
  /** ICE username fragment. */
  ufrag: string;
  /** ICE password. */
  pwd: string;
  /** DTLS SHA-256 fingerprint, hex, no colons, upper case. */
  fingerprint: string;
  /** DTLS role. */
  setup: 'actpass' | 'active' | 'passive';
  /** Where to reach this peer on the local network. */
  candidates: Array<{ address: string; port: number; priority: number }>;
}

/** Bumped if the wire format ever changes, so an old code fails loudly. */
const FORMAT = 'FL1';
const SEP = '~';
const CAND_SEP = '!';

function required(sdp: string, re: RegExp, what: string): string {
  const match = sdp.match(re);
  if (!match?.[1]) throw new Error(`This connection code is missing its ${what}.`);
  return match[1];
}

/**
 * Pulls the five things that matter out of a full SDP.
 *
 * Only UDP host candidates are kept. TCP host candidates exist but are
 * slower to connect and roughly double the code length for no benefit on a
 * local network; relay and server-reflexive candidates need a server that by
 * definition is not reachable here.
 */
export function extractParts(sdp: string): LinkParts {
  const candidates: LinkParts['candidates'] = [];
  const re = /a=candidate:\S+ (\d+) udp (\d+) (\S+) (\d+) typ host/gi;
  for (const m of sdp.matchAll(re)) {
    // Component 1 is RTP; with BUNDLE and a data channel there is nothing
    // else worth carrying.
    if (Number(m[1]) !== 1) continue;
    candidates.push({ priority: Number(m[2]), address: m[3], port: Number(m[4]) });
  }

  return {
    ufrag: required(sdp, /a=ice-ufrag:(\S+)/, 'ICE user fragment'),
    pwd: required(sdp, /a=ice-pwd:(\S+)/, 'ICE password'),
    fingerprint: required(sdp, /a=fingerprint:sha-256 (\S+)/i, 'certificate fingerprint')
      .replace(/:/g, '')
      .toUpperCase(),
    setup: (required(sdp, /a=setup:(\S+)/, 'DTLS role') as LinkParts['setup']) ?? 'actpass',
    candidates,
  };
}

/** Rebuilds a usable SDP from the parts. */
export function buildSdp(parts: LinkParts): string {
  if (!/^[0-9A-F]{64}$/.test(parts.fingerprint)) {
    throw new Error('This connection code has a malformed certificate fingerprint.');
  }

  const fingerprint = parts.fingerprint.replace(/(..)(?=.)/g, '$1:');
  const candidates = parts.candidates
    .map(
      (c, i) =>
        `a=candidate:${i + 1} 1 udp ${c.priority} ${c.address} ${c.port} typ host generation 0`
    )
    .join('\r\n');

  // The rest is the same on every device, so it is a template rather than
  // something the code has to carry.
  return (
    'v=0\r\n' +
    'o=- 0 2 IN IP4 127.0.0.1\r\n' +
    's=-\r\n' +
    't=0 0\r\n' +
    'a=group:BUNDLE 0\r\n' +
    'a=msid-semantic: WMS\r\n' +
    'm=application 9 UDP/DTLS/SCTP webrtc-datachannel\r\n' +
    'c=IN IP4 0.0.0.0\r\n' +
    (candidates ? candidates + '\r\n' : '') +
    `a=ice-ufrag:${parts.ufrag}\r\n` +
    `a=ice-pwd:${parts.pwd}\r\n` +
    'a=ice-options:trickle\r\n' +
    `a=fingerprint:sha-256 ${fingerprint}\r\n` +
    `a=setup:${parts.setup}\r\n` +
    'a=mid:0\r\n' +
    'a=sctp-port:5000\r\n' +
    'a=max-message-size:262144\r\n'
  );
}

/**
 * The human-transferable code.
 *
 * Tilde-separated rather than JSON: JSON spends a third of its length on
 * quotes and braces, and every one of those characters has to survive being
 * copied, shared and pasted. The separators are chosen to be characters that
 * never appear in an ICE fragment, a hex fingerprint or an mDNS hostname.
 */
export function encodeCode(parts: LinkParts, kind: 'offer' | 'answer'): string {
  const candidates = parts.candidates
    .map((c) => `${c.address},${c.port},${c.priority}`)
    .join(CAND_SEP);
  return [
    FORMAT,
    kind === 'offer' ? 'O' : 'A',
    parts.ufrag,
    parts.pwd,
    parts.fingerprint,
    parts.setup,
    candidates,
  ].join(SEP);
}

export interface DecodedCode {
  kind: 'offer' | 'answer';
  parts: LinkParts;
}

/**
 * Reads a code back.
 *
 * Tolerant about whitespace because these arrive through share sheets and
 * messaging apps, which wrap lines and add spaces; strict about everything
 * else, because a code that is subtly wrong should say so rather than
 * produce a connection that silently never completes.
 */
export function decodeCode(raw: string): DecodedCode {
  const text = raw.trim().replace(/\s+/g, '');
  if (!text) throw new Error('Paste the connection code from the other phone first.');

  const fields = text.split(SEP);
  if (fields[0] !== FORMAT) {
    throw new Error('That does not look like a Floodylink connection code.');
  }
  if (fields.length !== 7) {
    throw new Error('That connection code is incomplete - copy the whole thing.');
  }

  const [, kindFlag, ufrag, pwd, fingerprint, setup, candidateBlob] = fields;
  if (kindFlag !== 'O' && kindFlag !== 'A') {
    throw new Error('That connection code is not readable.');
  }
  if (!/^(actpass|active|passive)$/.test(setup)) {
    throw new Error('That connection code has an invalid role.');
  }
  if (!/^[0-9A-F]{64}$/.test(fingerprint)) {
    throw new Error('That connection code has a malformed certificate fingerprint.');
  }

  const candidates = candidateBlob
    ? candidateBlob.split(CAND_SEP).map((entry) => {
        const [address, port, priority] = entry.split(',');
        if (!address || !port) throw new Error('That connection code has a malformed address.');
        return { address, port: Number(port), priority: Number(priority) || 1 };
      })
    : [];

  if (!candidates.length) {
    throw new Error(
      'That code carries no network address. Both phones must be on the same Wi-Fi or hotspot.'
    );
  }

  return {
    kind: kindFlag === 'O' ? 'offer' : 'answer',
    parts: { ufrag, pwd, fingerprint, setup: setup as LinkParts['setup'], candidates },
  };
}

/** Convenience: full SDP straight to a shareable code. */
export function sdpToCode(sdp: string, kind: 'offer' | 'answer'): string {
  return encodeCode(extractParts(sdp), kind);
}

/** Convenience: shareable code straight to a usable description. */
export function codeToDescription(raw: string): RTCSessionDescriptionInit {
  const { kind, parts } = decodeCode(raw);
  return { type: kind, sdp: buildSdp(parts) };
}
