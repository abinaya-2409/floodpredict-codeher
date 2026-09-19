import { describe, it, expect, vi } from 'vitest';
import {
  BitchatMesh,
  FRAGMENT_BYTES,
  MAX_TTL,
  type MeshPacket,
  fragmentBody,
  parsePacket,
} from '../services/mesh/BitchatMesh';

/**
 * A mesh, tested without radios.
 *
 * None of this can be checked on hardware here: it needs three phones in a
 * line, out of range of each other at the ends. So the mesh is written to
 * know nothing about its transport, and the transport is a function in a
 * test. Every device below is a real `BitchatMesh`; only the wire between
 * them is fake, which is the right half to fake.
 *
 * The failures these guard are the ones that make a mesh useless rather
 * than slow: a flood that never terminates, a hop budget that does not
 * bound anything, a relay that talks back to whoever it heard from, and a
 * fragment boundary that lands inside a Tamil character.
 */

/** Wires two meshes together as if they were in range of each other. */
function connect(a: BitchatMesh, aId: string, b: BitchatMesh, bId: string) {
  let open = true;
  a.addLink({ peerId: bId, send: (p) => (open ? (void b.receive(p, aId), true) : false) });
  b.addLink({ peerId: aId, send: (p) => (open ? (void a.receive(p, bId), true) : false) });
  return { cut: () => { open = false; a.removeLink(bId); b.removeLink(aId); } };
}

function collector(mesh: BitchatMesh) {
  const got: MeshPacket[] = [];
  mesh.on({ onMessage: (p) => got.push(p) });
  return got;
}

const settle = () => new Promise((r) => setTimeout(r, 0));

describe('a message crosses a device that is not its recipient', () => {
  it('reaches C from A through B, which neither of them addressed', async () => {
    // A ── B ── C. A and C have no link at all.
    const A = new BitchatMesh('A');
    const B = new BitchatMesh('B');
    const C = new BitchatMesh('C');
    connect(A, 'A', B, 'B');
    connect(B, 'B', C, 'C');

    const atC = collector(C);
    const atB = collector(B);

    await A.send('the culvert on 100 Feet Road is under water', 'C');
    await settle();

    expect(atC.map((p) => p.body)).toEqual(['the culvert on 100 Feet Road is under water']);
    // B relayed it but was not the addressee, so it is not B's message.
    expect(atB).toHaveLength(0);
  });

  it('carries a broadcast to everyone on the chain', async () => {
    const A = new BitchatMesh('A');
    const B = new BitchatMesh('B');
    const C = new BitchatMesh('C');
    connect(A, 'A', B, 'B');
    connect(B, 'B', C, 'C');

    const atB = collector(B);
    const atC = collector(C);

    await A.send('SOS: Velachery, need a boat', null);
    await settle();

    expect(atB).toHaveLength(1);
    expect(atC).toHaveLength(1);
  });

  it('spans a five-device line', async () => {
    const ids = ['A', 'B', 'C', 'D', 'E'];
    const nodes = ids.map((id) => new BitchatMesh(id));
    for (let i = 0; i < nodes.length - 1; i++) {
      connect(nodes[i], ids[i], nodes[i + 1], ids[i + 1]);
    }
    const atE = collector(nodes[4]);

    await nodes[0].send('water rising at Mudichur', 'E');
    await settle();

    expect(atE.map((p) => p.body)).toEqual(['water rising at Mudichur']);
  });
});

describe('the flood terminates', () => {
  it('does not loop forever around a ring', async () => {
    // A ring is the shape that kills a naive flood: without dedup every
    // packet circulates until something runs out.
    const ids = ['A', 'B', 'C', 'D'];
    const nodes = ids.map((id) => new BitchatMesh(id));
    const sends = ids.map(() => 0);

    for (let i = 0; i < 4; i++) {
      const j = (i + 1) % 4;
      const a = nodes[i];
      const b = nodes[j];
      a.addLink({ peerId: ids[j], send: (p) => (sends[i]++, void b.receive(p, ids[i]), true) });
      b.addLink({ peerId: ids[i], send: (p) => (sends[j]++, void a.receive(p, ids[j]), true) });
    }

    const atC = collector(nodes[2]);
    await nodes[0].send('ring test', null);
    await settle();

    expect(atC).toHaveLength(1);
    const total = sends.reduce((x, y) => x + y, 0);
    // Four nodes, one message: a handful of sends. Unbounded would be
    // thousands, and the exact figure does not matter - the bound does.
    expect(total).toBeLessThan(40);
  });

  it('delivers exactly once when two paths reach the same device', async () => {
    // A ── B ── D
    //  └── C ──┘   D hears the same message down both arms.
    const A = new BitchatMesh('A');
    const B = new BitchatMesh('B');
    const C = new BitchatMesh('C');
    const D = new BitchatMesh('D');
    connect(A, 'A', B, 'B');
    connect(A, 'A', C, 'C');
    connect(B, 'B', D, 'D');
    connect(C, 'C', D, 'D');

    const atD = collector(D);
    await A.send('duplicate path', null);
    await settle();

    expect(atD).toHaveLength(1);
  });

  it('stops relaying when the hop budget runs out', async () => {
    const nodes = Array.from({ length: MAX_TTL + 4 }, (_, i) => new BitchatMesh(`N${i}`));
    for (let i = 0; i < nodes.length - 1; i++) {
      connect(nodes[i], `N${i}`, nodes[i + 1], `N${i + 1}`);
    }
    const far = collector(nodes[nodes.length - 1]);

    await nodes[0].send('too far', null);
    await settle();

    // Beyond MAX_TTL hops the packet is dropped rather than carried on.
    expect(far).toHaveLength(0);
  });

  it('never sends a packet back down the link it arrived on', async () => {
    const A = new BitchatMesh('A');
    const B = new BitchatMesh('B');
    const backToA: string[] = [];

    B.addLink({ peerId: 'A', send: (p) => (backToA.push(p), true) });
    A.addLink({ peerId: 'B', send: (p) => (void B.receive(p, 'A'), true) });

    await A.send('one way', null);
    await settle();

    expect(backToA).toHaveLength(0);
  });
});

describe('a message waits for someone who is not here yet', () => {
  it('delivers to a peer that arrives after the message was sent', async () => {
    const A = new BitchatMesh('A');
    const B = new BitchatMesh('B');
    connect(A, 'A', B, 'B');

    // C is nowhere near anyone when A speaks.
    await A.send('meet at the school', 'C');
    await settle();

    const C = new BitchatMesh('C');
    const atC = collector(C);
    connect(B, 'B', C, 'C');
    await settle();

    expect(atC.map((p) => p.body)).toEqual(['meet at the school']);
  });

  it('does not hand a message back to the person who wrote it', async () => {
    const A = new BitchatMesh('A');
    const B = new BitchatMesh('B');
    connect(A, 'A', B, 'B');
    await A.send('mine', null);
    await settle();

    const atA = collector(A);
    // A reconnects to B; B must not replay A's own message to A.
    const link = connect(B, 'B', A, 'A');
    await settle();
    link.cut();

    expect(atA).toHaveLength(0);
  });
});

describe('a long message survives a small link', () => {
  it('splits and reassembles', async () => {
    const A = new BitchatMesh('A');
    const B = new BitchatMesh('B');
    connect(A, 'A', B, 'B');
    const atB = collector(B);

    const long = 'Relief camp at the school is full. '.repeat(20);
    const ids = await A.send(long, 'B');
    await settle();

    expect(ids.length).toBeGreaterThan(1);
    expect(atB).toHaveLength(1);
    expect(atB[0].body).toBe(long);
  });

  it('reassembles across a relay', async () => {
    const A = new BitchatMesh('A');
    const B = new BitchatMesh('B');
    const C = new BitchatMesh('C');
    connect(A, 'A', B, 'B');
    connect(B, 'B', C, 'C');
    const atC = collector(C);

    const long = 'x'.repeat(FRAGMENT_BYTES * 3 + 17);
    await A.send(long, 'C');
    await settle();

    expect(atC).toHaveLength(1);
    expect(atC[0].body).toBe(long);
  });

  it('never splits inside a character', () => {
    // Tamil is ~3 bytes a character. Splitting on length rather than bytes
    // is how a fragment ends up over the MTU and how a character ends up
    // cut in half - both silent, both only visible as mojibake.
    const tamil = 'வெள்ளம் அபாயம். உடனே வெளியேறவும். '.repeat(12);
    const pieces = fragmentBody(tamil);
    const encoder = new TextEncoder();

    expect(pieces.length).toBeGreaterThan(1);
    for (const p of pieces) {
      expect(encoder.encode(p).length).toBeLessThanOrEqual(FRAGMENT_BYTES);
    }
    expect(pieces.join('')).toBe(tamil);
    expect(pieces.join('')).not.toContain('�');
  });

  it('leaves a short message in one piece', () => {
    expect(fragmentBody('short')).toEqual(['short']);
  });
});

describe('a malformed packet is dropped, not trusted', () => {
  it('rejects rubbish', () => {
    expect(parsePacket('not json')).toBeNull();
    expect(parsePacket('{}')).toBeNull();
    expect(parsePacket(JSON.stringify({ id: 'x', origin: 'y' }))).toBeNull();
  });

  it('rejects a hop budget above the maximum', () => {
    // Otherwise one crafted packet relays around the mesh indefinitely.
    const evil = JSON.stringify({
      id: 'e', origin: 'x', to: null, kind: 'msg', ttl: 9999, ts: 0, body: 'b',
    });
    expect(parsePacket(evil)).toBeNull();
  });

  it('survives a link that throws', async () => {
    const A = new BitchatMesh('A');
    A.addLink({ peerId: 'dead', send: () => { throw new Error('gone'); } });
    await expect(A.send('still fine', null)).resolves.toBeTruthy();
  });
});

describe('it reports what it is doing', () => {
  it('counts peers, seen ids and held messages', async () => {
    const A = new BitchatMesh('A');
    const B = new BitchatMesh('B');
    connect(A, 'A', B, 'B');
    await A.send('one', null);
    await settle();

    const s = A.stats();
    expect(s.peers).toBe(1);
    expect(s.seen).toBeGreaterThan(0);
    expect(s.stored).toBeGreaterThan(0);
  });

  it('says when it relayed something, and to whom', async () => {
    const A = new BitchatMesh('A');
    const B = new BitchatMesh('B');
    const C = new BitchatMesh('C');
    const onRelay = vi.fn();
    B.on({ onRelay });
    connect(A, 'A', B, 'B');
    connect(B, 'B', C, 'C');

    await A.send('relay me', 'C');
    await settle();

    expect(onRelay).toHaveBeenCalled();
    expect(onRelay.mock.calls[0][1]).toContain('C');
  });
});
