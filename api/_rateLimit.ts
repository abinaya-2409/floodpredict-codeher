/**
 * Rate limiting, because one key serves everybody.
 *
 * The assistant runs on a single key held on the server, so that anyone who
 * opens Floodylink can use it without signing up for anything. That is the
 * point of it. It also means the site is an open, unauthenticated route to a
 * language model, and the quota behind it is a free tier - a few hundred
 * requests a minute, shared by every visitor at once.
 *
 * Without a limit the first person to hold down Enter, or the first crawler
 * that finds the endpoint, spends the allowance for everyone, and the next
 * officer to ask a real question gets nothing. So the limit is not here to
 * punish anyone; it is here so the last user of the day is served as well as
 * the first.
 *
 * Three windows, each answering a different failure:
 *   perIp  - one person, or one script, cannot outrun everyone else
 *   global - the whole site stays inside the provider's per-minute ceiling
 *   daily  - a slow drip over many hours cannot quietly drain the day's quota
 *
 * A refusal is never fatal. Report and Summarise are composed in the browser
 * and keep working, so being rate-limited costs the conversation, not the
 * facts.
 *
 * What this is not
 * ----------------
 * The counters live in the instance's memory, and a serverless platform runs
 * however many instances it likes. Two visitors on two instances are counted
 * separately, and a cold start begins at zero, so the real ceiling is the
 * configured number times the instances in play - not the number itself.
 *
 * That is a deliberate trade, not an oversight. It holds back the cases that
 * actually occur on a site like this - one person leaning on the button, one
 * crawler, one demo where everybody opens it at once, all of which land on a
 * warm instance and are caught - without adding Redis, a second key and
 * another service to a project whose whole point is that it degrades to
 * something useful when the network is gone. If the site ever needs a true
 * global ceiling, this is the seam to put one behind: the shape of `check`
 * does not change, only where the numbers are kept.
 */

export interface RateRule {
  /** Requests permitted inside the window. */
  limit: number;
  windowMs: number;
}

export interface RateLimiterOptions {
  perIp: RateRule;
  global: RateRule;
  daily: RateRule;
}

export interface RateDecision {
  allowed: boolean;
  /** Which window refused, so the caller can say something specific. */
  scope: 'ip' | 'global' | 'daily' | null;
  /** Whole seconds until the earliest retry that could succeed. */
  retryAfterSec: number;
}

/**
 * Drop timestamps that have left the window.
 *
 * The lists are held newest-last and only ever appended, so everything still
 * inside the window is a suffix and this is a scan from the front.
 */
function prune(times: number[], cutoff: number): number[] {
  let i = 0;
  while (i < times.length && times[i] <= cutoff) i++;
  return i === 0 ? times : times.slice(i);
}

/** Seconds until the oldest entry in a full window expires. */
function retryAfter(times: number[], windowMs: number, now: number): number {
  if (!times.length) return 1;
  return Math.max(1, Math.ceil((times[0] + windowMs - now) / 1000));
}

/**
 * How many distinct addresses to remember before sweeping the cold ones.
 *
 * A serverless instance can live for hours across thousands of visitors, and
 * a map keyed by address would otherwise grow for as long as it survives.
 */
const SWEEP_AT_KEYS = 5000;

export function createRateLimiter(opts: RateLimiterOptions) {
  const perIp = new Map<string, number[]>();
  let globalHits: number[] = [];
  let dailyHits: number[] = [];

  return {
    /**
     * Record an attempt and say whether it may proceed.
     *
     * `now` is injectable so the windows can be tested without waiting out a
     * real minute. Nothing is recorded when the answer is no, so a client
     * that keeps hammering does not push its own recovery further away.
     */
    check(ip: string, now: number = Date.now()): RateDecision {
      dailyHits = prune(dailyHits, now - opts.daily.windowMs);
      if (dailyHits.length >= opts.daily.limit) {
        return {
          allowed: false,
          scope: 'daily',
          retryAfterSec: retryAfter(dailyHits, opts.daily.windowMs, now),
        };
      }

      globalHits = prune(globalHits, now - opts.global.windowMs);
      if (globalHits.length >= opts.global.limit) {
        return {
          allowed: false,
          scope: 'global',
          retryAfterSec: retryAfter(globalHits, opts.global.windowMs, now),
        };
      }

      const mineCutoff = now - opts.perIp.windowMs;
      const mine = prune(perIp.get(ip) ?? [], mineCutoff);
      if (mine.length >= opts.perIp.limit) {
        // Keep the pruned list so the entry does not regrow from stale times.
        perIp.set(ip, mine);
        return {
          allowed: false,
          scope: 'ip',
          retryAfterSec: retryAfter(mine, opts.perIp.windowMs, now),
        };
      }

      mine.push(now);
      perIp.set(ip, mine);
      globalHits.push(now);
      dailyHits.push(now);

      if (perIp.size > SWEEP_AT_KEYS) {
        for (const [key, times] of perIp) {
          if (!times.length || times[times.length - 1] <= mineCutoff) perIp.delete(key);
        }
      }

      return { allowed: true, scope: null, retryAfterSec: 0 };
    },

    /** For /api/health: what the shared allowance looks like right now. */
    snapshot(now: number = Date.now()) {
      return {
        lastMinute: prune(globalHits, now - opts.global.windowMs).length,
        today: prune(dailyHits, now - opts.daily.windowMs).length,
        perMinuteLimit: opts.global.limit,
        dailyLimit: opts.daily.limit,
      };
    },
  };
}

/**
 * The address a request came from, as far as it can be trusted.
 *
 * Behind Vercel the socket address is the proxy, so the client is the first
 * entry in x-forwarded-for. It is spoofable, which matters less than it
 * sounds: someone forging it still has to get past the global and daily
 * windows, which is what actually protects the quota.
 */
export function clientIp(headers: Record<string, unknown>, fallback?: string): string {
  const fwd = headers['x-forwarded-for'];
  const raw = Array.isArray(fwd) ? fwd[0] : fwd;
  const first = String(raw ?? '').split(',')[0].trim();
  return first || String(headers['x-real-ip'] ?? '') || fallback || 'unknown';
}
