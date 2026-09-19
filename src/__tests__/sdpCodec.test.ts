import { describe, expect, it } from 'vitest';
import {
  buildSdp,
  codeToDescription,
  decodeCode,
  encodeCode,
  extractParts,
  sdpToCode,
} from '../services/link/sdpCodec';

/**
 * The connection code is carried between two phones by a person - copied,
 * AirDropped, pasted. So what these tests guard is that it survives that
 * trip, that it stays short enough to be worth passing around, and that a
 * damaged one says so rather than producing a connection that silently never
 * completes.
 *
 * The SDP below is a real Chrome data-channel offer, trimmed of nothing.
 */

const REAL_OFFER = [
  'v=0',
  'o=- 4611731400430051336 2 IN IP4 127.0.0.1',
  's=-',
  't=0 0',
  'a=group:BUNDLE 0',
  'a=extmap-allow-mixed',
  'a=msid-semantic: WMS',
  'm=application 9 UDP/DTLS/SCTP webrtc-datachannel',
  'c=IN IP4 0.0.0.0',
  'a=candidate:2999745851 1 udp 2113937151 3aa4ba9e-5b1e-4f79-9a7b-1f1f6d0ab111.local 54321 typ host generation 0 network-cost 999',
  'a=candidate:1983934674 1 tcp 1518222591 3aa4ba9e-5b1e-4f79-9a7b-1f1f6d0ab111.local 9 typ host tcptype active generation 0',
  'a=candidate:3999745852 1 udp 2113937150 192.168.1.44 54322 typ host generation 0',
  'a=ice-ufrag:Xk4B',
  'a=ice-pwd:9wLmQfT2sBvN6dRa1yUeKpZc',
  'a=ice-options:trickle',
  'a=fingerprint:sha-256 AB:CD:EF:01:23:45:67:89:AB:CD:EF:01:23:45:67:89:AB:CD:EF:01:23:45:67:89:AB:CD:EF:01:23:45:67:89',
  'a=setup:actpass',
  'a=mid:0',
  'a=sctp-port:5000',
  'a=max-message-size:262144',
].join('\r\n');

describe('reading a real SDP', () => {
  it('pulls out the five things that actually differ between peers', () => {
    const parts = extractParts(REAL_OFFER);
    expect(parts.ufrag).toBe('Xk4B');
    expect(parts.pwd).toBe('9wLmQfT2sBvN6dRa1yUeKpZc');
    expect(parts.fingerprint).toBe(
      'ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789'
    );
    expect(parts.setup).toBe('actpass');
  });

  it('keeps UDP host candidates and drops the TCP one', () => {
    // TCP host candidates connect more slowly and roughly double the code
    // length for no benefit on a local network.
    const parts = extractParts(REAL_OFFER);
    expect(parts.candidates).toHaveLength(2);
    expect(parts.candidates.map((c) => c.port)).toEqual([54321, 54322]);
    expect(parts.candidates.some((c) => c.port === 9), 'the TCP candidate').toBe(false);
  });

  it('refuses an SDP with no fingerprint rather than building an insecure one', () => {
    const noFp = REAL_OFFER.split('\r\n').filter((l) => !l.startsWith('a=fingerprint')).join('\r\n');
    expect(() => extractParts(noFp)).toThrow(/fingerprint/i);
  });
});

describe('the code people pass between phones', () => {
  it('is short enough to copy and share', () => {
    const code = sdpToCode(REAL_OFFER, 'offer');
    // What matters is the ratio: a raw SDP is far too long to hand to
    // somebody on a share sheet, and the code has to be a fraction of it.
    expect(code.length).toBeLessThan(300);
    expect(code.length).toBeLessThan(REAL_OFFER.length / 2.5);
  });

  it('round-trips every field', () => {
    const parts = extractParts(REAL_OFFER);
    const decoded = decodeCode(encodeCode(parts, 'offer'));
    expect(decoded.kind).toBe('offer');
    expect(decoded.parts).toEqual(parts);
  });

  it('distinguishes an invite from a reply', () => {
    const parts = extractParts(REAL_OFFER);
    expect(decodeCode(encodeCode(parts, 'offer')).kind).toBe('offer');
    expect(decodeCode(encodeCode(parts, 'answer')).kind).toBe('answer');
  });

  it('survives the whitespace a share sheet adds', () => {
    // Messaging apps and mail clients wrap long strings; the code has to
    // come back from that intact.
    const code = sdpToCode(REAL_OFFER, 'offer');
    const mangled = `  ${code.slice(0, 40)}\n${code.slice(40, 120)}\r\n ${code.slice(120)}  `;
    expect(decodeCode(mangled).parts).toEqual(extractParts(REAL_OFFER));
  });
});

describe('a damaged code says so', () => {
  const code = sdpToCode(REAL_OFFER, 'offer');

  it('rejects empty input', () => {
    expect(() => decodeCode('   ')).toThrow(/paste/i);
  });

  it('rejects something that is not one of ours', () => {
    expect(() => decodeCode('https://example.com/whatever')).toThrow(/does not look like/i);
  });

  it('rejects a half-copied code', () => {
    expect(() => decodeCode(code.split('~').slice(0, 4).join('~'))).toThrow(/incomplete/i);
  });

  it('rejects a corrupted fingerprint instead of attempting the connection', () => {
    // A wrong fingerprint does not fail loudly at connect time - DTLS just
    // never completes and the user watches a spinner. Better to catch it here.
    const broken = code.replace(/~[0-9A-F]{64}~/, '~NOTAFINGERPRINT~');
    expect(() => decodeCode(broken)).toThrow(/fingerprint/i);
  });

  it('rejects a code with no address, and says what to check', () => {
    const parts = extractParts(REAL_OFFER);
    const addressless = encodeCode({ ...parts, candidates: [] }, 'offer');
    expect(() => decodeCode(addressless)).toThrow(/same Wi-Fi or hotspot/i);
  });

  it('rejects an unknown format version', () => {
    expect(() => decodeCode(code.replace(/^FL1/, 'FL9'))).toThrow(/does not look like/i);
  });
});

describe('rebuilding a usable description', () => {
  it('produces an SDP with everything WebRTC needs', () => {
    const sdp = buildSdp(extractParts(REAL_OFFER));
    for (const required of [
      'm=application 9 UDP/DTLS/SCTP webrtc-datachannel',
      'a=ice-ufrag:Xk4B',
      'a=ice-pwd:9wLmQfT2sBvN6dRa1yUeKpZc',
      'a=setup:actpass',
      'a=sctp-port:5000',
      'a=mid:0',
    ]) {
      expect(sdp, required).toContain(required);
    }
    // The fingerprint has to go back to colon-separated or Chrome rejects it.
    expect(sdp).toContain('a=fingerprint:sha-256 AB:CD:EF:01:23');
  });

  it('carries the addresses back', () => {
    const sdp = buildSdp(extractParts(REAL_OFFER));
    expect(sdp).toContain('54321 typ host');
    expect(sdp).toContain('192.168.1.44');
  });

  it('gives back a description object the browser API accepts', () => {
    const description = codeToDescription(sdpToCode(REAL_OFFER, 'offer'));
    expect(description.type).toBe('offer');
    expect(description.sdp).toContain('a=ice-ufrag:Xk4B');
  });

  it('never emits a relay or reflexive candidate, so it cannot need a server', () => {
    // The entire point is working with the internet gone. A code that quietly
    // depended on STUN would fail exactly when it is needed.
    const sdp = buildSdp(extractParts(REAL_OFFER));
    expect(sdp).not.toMatch(/typ (srflx|relay|prflx)/);
    expect(sdp.match(/typ host/g)).toHaveLength(2);
  });
});
