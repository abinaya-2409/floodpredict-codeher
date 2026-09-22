import type { Verification } from './_verifyAnswer.js';

/**
 * Where the assistant's mistakes go.
 *
 * Every answer is checked against the snapshot, and when it fails the check
 * it is sent back to be corrected. Both halves are worth keeping: what the
 * model got wrong, and whether telling it so actually fixed it. Without the
 * record there is no way to answer the question that decides whether any of
 * this is working - does the correction pass help, and which of the three
 * failures does it help with?
 *
 * Supabase, over its REST interface with plain fetch. No SDK, because this
 * file wants one HTTP call and the rest of the API already talks to
 * Open-Meteo and Groq exactly this way.
 *
 * With no credentials configured it writes to the server log instead. That is
 * not a degraded mode to apologise for: the assistant must keep answering
 * whether or not anyone has set up a database, and a log line is a perfectly
 * good record until someone has.
 */

export interface VerificationRecord {
  /** Which of the three the check found. */
  kind: Verification['kind'];
  /** What the model wrote. */
  value: string;
  /** The real figure, where there was one. */
  expected: string;
  /** The sentence it appeared in. */
  context: string;
  /** The question that led to it. Truncated; this is a diagnostic, not a transcript. */
  question: string;
  /** Which model produced the answer. */
  model: string;
  /** Which attempt: 1 is the first answer, 2 the corrected one. */
  attempt: number;
  /** Whether the retry cleared this problem. Null on the final attempt. */
  corrected: boolean | null;
}

const TABLE = 'assistant_errors';

function credentials(): { url: string; key: string } | null {
  const url = (process.env.SUPABASE_URL ?? '').trim().replace(/\/+$/, '');
  // The service role key, because this table is written by the server and
  // should not be writable by anyone holding the public anon key.
  const key = (process.env.SUPABASE_SERVICE_KEY ?? process.env.SUPABASE_KEY ?? '').trim();
  if (!url || !key) return null;
  return { url, key };
}

export function errorLogConfigured(): boolean {
  return credentials() !== null;
}

/**
 * Record what the check found.
 *
 * Never throws and never delays the answer. A logging failure must not cost
 * a user their reply, so this is started and not awaited by the caller, and
 * every error inside it ends here.
 */
export async function recordVerifications(rows: VerificationRecord[]): Promise<void> {
  if (!rows.length) return;

  const creds = credentials();
  if (!creds) {
    for (const r of rows) {
      console.warn(
        `[assistant-check] ${r.kind} "${r.value}"` +
          (r.expected ? ` (data says ${r.expected})` : '') +
          ` attempt=${r.attempt} corrected=${r.corrected} model=${r.model}`
      );
    }
    return;
  }

  const payload = rows.map((r) => ({
    kind: r.kind,
    value: r.value.slice(0, 200),
    expected: r.expected.slice(0, 200),
    context: r.context.slice(0, 1000),
    question: r.question.slice(0, 1000),
    model: r.model.slice(0, 120),
    attempt: r.attempt,
    corrected: r.corrected,
  }));

  try {
    const res = await fetch(`${creds.url}/rest/v1/${TABLE}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: creds.key,
        Authorization: `Bearer ${creds.key}`,
        // Nothing is read back; asking for no representation keeps the
        // response empty and the round trip short.
        Prefer: 'return=minimal',
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      // Logged, not thrown. The commonest cause is the table not existing
      // yet, and that must not turn into a broken assistant.
      console.warn(
        `[assistant-check] Supabase rejected the write (${res.status}): ` +
          `${(await res.text()).slice(0, 300)}`
      );
    }
  } catch (err) {
    console.warn('[assistant-check] Could not reach Supabase:', (err as Error).message);
  }
}
