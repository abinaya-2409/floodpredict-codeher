import { describe, expect, it } from 'vitest';
import { clientIp, createRateLimiter } from '../../api/_rateLimit';

/**
 * The limiter exists so the last visitor of the day is served as well as the
 * first, on one key shared by everyone. What these tests guard is that it
 * refuses the right party - the one who is actually spending the allowance -
 * and that a refusal expires on its own rather than needing a redeploy.
 *
 * Time is injected throughout. A test that waited out a real minute would be
 * a minute of everyone's life per assertion.
 */

const limiter = () =>
  createRateLimiter({
    perIp: { limit: 3, windowMs: 60_000 },
    global: { limit: 5, windowMs: 60_000 },
    daily: { limit: 8, windowMs: 86_400_000 },
  });

const T = 1_000_000;

describe('per-address window', () => {
  it('allows up to the limit and then refuses', () => {
    const rl = limiter();
    for (let i = 0; i < 3; i++) {
      expect(rl.check('a', T + i).allowed, `request ${i + 1}`).toBe(true);
    }
    const refused = rl.check('a', T + 3);
    expect(refused.allowed).toBe(false);
    expect(refused.scope).toBe('ip');
  });

  it('refuses one address without touching another', () => {
    // The failure this guards is the one that matters most: one heavy user
    // silently taking the service away from everybody else.
    const rl = limiter();
    for (let i = 0; i < 3; i++) rl.check('heavy', T + i);
    expect(rl.check('heavy', T + 4).allowed).toBe(false);
    expect(rl.check('someone-else', T + 4).allowed).toBe(true);
  });

  it('lets an address back in once its window has passed', () => {
    const rl = limiter();
    for (let i = 0; i < 3; i++) rl.check('a', T + i);
    expect(rl.check('a', T + 5).allowed).toBe(false);
    // The oldest of the three was at T; a shade past T + 60s clears it.
    expect(rl.check('a', T + 60_001).allowed).toBe(true);
  });

  it('does not push back its own recovery by retrying', () => {
    // A refused attempt must not be recorded, or a client polling every
    // second would never be let in again.
    const rl = limiter();
    for (let i = 0; i < 3; i++) rl.check('a', T + i);
    for (let i = 0; i < 20; i++) rl.check('a', T + 100 + i);
    expect(rl.check('a', T + 60_001).allowed).toBe(true);
  });

  it('says how long to wait, in whole seconds', () => {
    const rl = limiter();
    for (let i = 0; i < 3; i++) rl.check('a', T + i);
    const refused = rl.check('a', T + 30_000);
    expect(refused.retryAfterSec).toBeGreaterThan(0);
    expect(refused.retryAfterSec).toBeLessThanOrEqual(60);
    expect(Number.isInteger(refused.retryAfterSec)).toBe(true);
  });
});

describe('site-wide windows', () => {
  it('refuses once the whole site passes the per-minute ceiling', () => {
    const rl = limiter();
    // Five different addresses, one request each, fills the global window.
    for (let i = 0; i < 5; i++) expect(rl.check(`ip${i}`, T + i).allowed).toBe(true);
    const refused = rl.check('fresh-visitor', T + 6);
    expect(refused.allowed).toBe(false);
    expect(refused.scope).toBe('global');
  });

  it('reports the daily ceiling ahead of the minute one', () => {
    // A day's allowance spent slowly must not be reported as "busy right
    // now": the two need different advice, and only one resets in a minute.
    const rl = limiter();
    for (let i = 0; i < 8; i++) rl.check(`ip${i}`, T + i * 120_000);
    const refused = rl.check('late-visitor', T + 8 * 120_000);
    expect(refused.allowed).toBe(false);
    expect(refused.scope).toBe('daily');
  });

  it('reports usage against the configured ceilings', () => {
    const rl = limiter();
    for (let i = 0; i < 4; i++) rl.check(`ip${i}`, T + i);
    const snap = rl.snapshot(T + 10);
    expect(snap.lastMinute).toBe(4);
    expect(snap.today).toBe(4);
    expect(snap.perMinuteLimit).toBe(5);
    expect(snap.dailyLimit).toBe(8);
  });
});

describe('client address', () => {
  it('takes the original client from a proxy chain', () => {
    // Behind Vercel the socket is the proxy, so the left-most entry is the
    // only one that identifies the visitor.
    expect(clientIp({ 'x-forwarded-for': '203.0.113.7, 70.41.3.18' })).toBe('203.0.113.7');
  });

  it('falls back through the headers it may be given', () => {
    expect(clientIp({ 'x-real-ip': '198.51.100.4' })).toBe('198.51.100.4');
    expect(clientIp({}, '192.0.2.9')).toBe('192.0.2.9');
    expect(clientIp({})).toBe('unknown');
  });

  it('does not collapse every visitor into one bucket when headers are odd', () => {
    // An empty or whitespace header must not become a shared key that makes
    // unrelated visitors limit each other.
    expect(clientIp({ 'x-forwarded-for': '  ' }, '192.0.2.9')).toBe('192.0.2.9');
    expect(clientIp({ 'x-forwarded-for': ['203.0.113.7'] })).toBe('203.0.113.7');
  });
});
