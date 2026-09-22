import express from 'express';
import { clientIp, createRateLimiter } from './_rateLimit.js';
import { errorLogConfigured, recordVerifications, VerificationRecord } from './_errorLog.js';
import { correctionPrompt, readSnapshot, verifyAnswer } from './_verifyAnswer.js';

export const app = express();
// A chat turn with the ward snapshot attached is a few kilobytes. The default
// 100kb body limit is far more than this API has any use for, and a smaller
// one is a cheaper refusal than parsing a megabyte of nonsense first.
app.use(express.json({ limit: '64kb' }));

/* ---------------------------------------------------------------------------
 * API keys
 * ------------------------------------------------------------------------ */

/**
 * Reads an API key defensively.
 *
 * Reads a key, tolerating the two ways they usually arrive wrong: wrapped in
 * quotes by a shell, or with whitespace from a copy-paste. Pasting a key into
 * a dashboard is the step that goes wrong most often.
 */
function readApiKey(name: string): string {
  const raw = process.env[name] ?? '';
  return raw.trim().replace(/^["']|["']$/g, '');
}

/* ---------------------------------------------------------------------------
 * Weather grid
 *
 * The map needs 48 hours of forecast for every cell in a 720-cell grid. Open-
 * Meteo bills that as 720 calls against a 10,000-a-day free allowance, so a
 * browser fetching it directly would exhaust a user's quota in about thirteen
 * page loads - and every user would pay that cost again.
 *
 * Fetching it here instead makes it one upstream request that the CDN caches
 * for everyone. s-maxage keeps the edge copy for half an hour, which matches
 * how often the underlying forecast actually changes, and
 * stale-while-revalidate means the refresh never lands in a user's wait.
 * ------------------------------------------------------------------------ */

const WX_SOUTH = 7.9;
const WX_WEST = 76.0;
const WX_STEP = 0.25;
const WX_ROWS = 25;
const WX_COLS = 20;
/**
 * Open-Meteo caps a request at 400 coordinates before the URL is too long,
 * and 600 coordinates a minute however they are split. 250 gives two paced
 * requests for the whole state, inside both limits.
 */
const WX_BATCH = 250;
/** Space the batches: the minute limit counts coordinates, not requests. */
const WX_BATCH_GAP_MS = 1200;
const WX_HOURS = 48;

interface OpenMeteoHourly {
  time: string[];
  precipitation: number[];
  wind_speed_10m: number[];
  wind_direction_10m: number[];
  temperature_2m: number[];
}

let wxCache: { at: number; body: unknown } | null = null;

app.get('/api/weather-grid', async (_req, res) => {
  // A warm lambda can answer without going upstream at all; the CDN handles
  // the rest. Half an hour matches the s-maxage below.
  if (wxCache && Date.now() - wxCache.at < 30 * 60 * 1000) {
    res.setHeader('Cache-Control', 'public, s-maxage=1800, stale-while-revalidate=3600');
    res.setHeader('X-Grid-Cache', 'lambda');
    res.json(wxCache.body);
    return;
  }

  const coords: [number, number][] = [];
  for (let r = 0; r < WX_ROWS; r++) {
    for (let c = 0; c < WX_COLS; c++) {
      coords.push([
        Number((WX_SOUTH + r * WX_STEP).toFixed(3)),
        Number((WX_WEST + c * WX_STEP).toFixed(3)),
      ]);
    }
  }

  const cells = coords.length;
  // Columnar and rounded. The same data as nested per-location objects is
  // roughly four times the bytes, almost all of it punctuation and keys.
  const rain = new Array<number>(cells * WX_HOURS).fill(0);
  const speed = new Array<number>(cells * WX_HOURS).fill(0);
  const dir = new Array<number>(cells * WX_HOURS).fill(0);
  const temp = new Array<number>(cells * WX_HOURS).fill(0);
  let hours: string[] = [];

  try {
    for (let start = 0; start < cells; start += WX_BATCH) {
      const chunk = coords.slice(start, start + WX_BATCH);
      const params = new URLSearchParams({
        latitude: chunk.map((p) => p[0].toFixed(3)).join(','),
        longitude: chunk.map((p) => p[1].toFixed(3)).join(','),
        hourly: 'precipitation,wind_speed_10m,wind_direction_10m,temperature_2m',
        forecast_days: '3',
        timezone: 'Asia/Kolkata',
      });

      if (start > 0) await new Promise((r) => setTimeout(r, WX_BATCH_GAP_MS));

      /*
       * The minute limit counts coordinates, so a redeploy or a burst of cold
       * lambdas can trip it even when this request is well behaved. One wait
       * clears it; anything worse falls through to the stale copy below
       * rather than spending a user's patience on a retry loop.
       */
      let upstream = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`);
      if (upstream.status === 429) {
        await new Promise((r) => setTimeout(r, 61_000));
        upstream = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`);
      }
      if (!upstream.ok) {
        throw new Error(`Open-Meteo ${upstream.status}: ${(await upstream.text()).slice(0, 160)}`);
      }
      const body = (await upstream.json()) as
        | { hourly: OpenMeteoHourly }
        | { hourly: OpenMeteoHourly }[];
      const list = Array.isArray(body) ? body : [body];

      list.forEach((loc, i) => {
        const cell = start + i;
        const h = loc.hourly;
        if (!hours.length) hours = h.time.slice(0, WX_HOURS);
        for (let t = 0; t < WX_HOURS; t++) {
          const idx = t * cells + cell;
          rain[idx] = Math.round((h.precipitation?.[t] ?? 0) * 10) / 10;
          speed[idx] = Math.round((h.wind_speed_10m?.[t] ?? 0) * 10) / 10;
          dir[idx] = Math.round(h.wind_direction_10m?.[t] ?? 0);
          temp[idx] = Math.round((h.temperature_2m?.[t] ?? 0) * 10) / 10;
        }
      });
    }

    const payload = {
      generatedAt: new Date().toISOString(),
      source: 'https://open-meteo.com/',
      rows: WX_ROWS,
      cols: WX_COLS,
      south: WX_SOUTH,
      west: WX_WEST,
      step: WX_STEP,
      hours,
      rain,
      speed,
      dir,
      temp,
    };
    wxCache = { at: Date.now(), body: payload };

    res.setHeader('Cache-Control', 'public, s-maxage=1800, stale-while-revalidate=3600');
    res.setHeader('X-Grid-Cache', 'miss');
    res.json(payload);
  } catch (err) {
    // A stale grid beats no map: the forecast moves slowly enough that an
    // hour-old copy is still worth drawing, and the client says how old it is.
    if (wxCache) {
      res.setHeader('X-Grid-Cache', 'stale');
      res.json(wxCache.body);
      return;
    }
    console.warn('Weather grid upstream failed:', err);
    res.status(502).json({
      error: 'weather_upstream_failed',
      message: (err as Error).message,
    });
  }
});

app.get('/api/health', (_req, res) => {
  const llmKey = readApiKey('LLM_API_KEY');
  res.json({
    status: 'ok',
    time: new Date().toISOString(),
    platform: 'Floodylink',
    // The briefing no longer needs a model, so this is reported as the
    // optional extra it is rather than as a health problem.
    briefing: 'computed locally, no model required',
    rewriteProvider: llmKey ? (process.env.LLM_PROVIDER ?? 'groq') : null,
    rewriteConfigured: Boolean(llmKey),
    // The assistant runs on one key for every visitor, so how much of the
    // shared allowance is left is an operational question, not a debug one.
    // Counts are per serverless instance; see the note in _rateLimit.ts.
    chatConfigured: Boolean(llmKey),
    chatUsage: chatLimiter.snapshot(),
    // Answers are checked against the snapshot whether or not this is set;
    // without it the findings go to the server log instead of a table.
    checkLogConfigured: errorLogConfigured(),
  });
});

/* ---------------------------------------------------------------------------
 * Briefing rewrite, on an open-weight model
 *
 * Replaces the Gemini routes. Not because Gemini is bad, but because the
 * briefing should not depend on any hosted model at all: every one needs a
 * key, the key here has been rejected for weeks, and what users saw instead
 * was invented prose. The briefing is now computed in the browser from the
 * application's own model and always renders.
 *
 * This endpoint only rewrites those already-computed facts into flowing
 * prose, so the worst a missing key can do is leave the structured version on
 * screen. Two providers, both serving open-weight models on a free tier, both
 * OpenAI-compatible, so one code path covers either - and the same path now
 * also serves /api/chat below:
 *
 *   LLM_PROVIDER=groq        LLM_API_KEY=gsk_...   (console.groq.com)
 *   LLM_PROVIDER=openrouter  LLM_API_KEY=sk-or-... (openrouter.ai)
 *
 * The model is instructed to add no numbers. It cannot be stopped from
 * trying, which is exactly why the facts are computed elsewhere.
 * ------------------------------------------------------------------------ */

interface BriefingPayload {
  title?: string;
  headline?: string;
  severity?: string;
  sections?: { heading: string; lines: string[] }[];
}

/**
 * Free, open-weight models, in the order they are tried.
 *
 * Every one of these is an open-weights model on a provider with a free
 * tier. The list is a fallback chain rather than a single choice because a
 * free tier's model catalogue moves: a name that works today can be retired
 * or rate-limited tomorrow, and a single hard-coded model turns that into a
 * dead button. Anything that comes back 400, 404 or 429 is treated as "not
 * this one" and the next is tried.
 */
const LLM_PROVIDERS: Record<
  string,
  { url: string; models: string[]; label: string; keyPrefix: RegExp }
> = {
  groq: {
    url: 'https://api.groq.com/openai/v1/chat/completions',
    label: 'Groq',
    keyPrefix: /^gsk_/,
    models: [
      // Groq documents the GPT-OSS pair as the free-tier models, at 250K
      // tokens a minute. Both jobs here - rephrasing a briefing, answering a
      // question from a snapshot - are instruction-following rather than
      // reasoning, so the larger one leads and the faster one catches it.
      'openai/gpt-oss-120b',
      'openai/gpt-oss-20b',
      'llama-3.3-70b-versatile',
      'llama-3.1-8b-instant',
    ],
  },
  openrouter: {
    url: 'https://openrouter.ai/api/v1/chat/completions',
    label: 'OpenRouter',
    keyPrefix: /^sk-or-/,
    models: [
      // The four models that stood here - Llama 3.3 70B, DeepSeek v3, Qwen3
      // 235B and Mistral Small 3.2 - all lost their `:free` variants and are
      // paid-only now, so every request down this branch returned 404 and the
      // chain always exhausted. Replaced against the live catalogue; the
      // comment above about names retiring was right, and this is the second
      // time it has happened.
      'google/gemma-4-31b-it:free',
      'google/gemma-4-26b-a4b-it:free',
      'nvidia/nemotron-3.5-lightning:free',
      'qwen/qwen3.8-27b:free',
    ],
  },
};

/**
 * Which provider a key belongs to.
 *
 * Read from the key itself when `LLM_PROVIDER` is not set. Groq keys start
 * `gsk_` and OpenRouter keys start `sk-or-`, so pasting one key into one
 * variable is the whole of the setup - the commonest way this failed was a
 * valid OpenRouter key being sent to Groq because the provider defaulted.
 */
function resolveProvider(key: string): { id: string; conf: (typeof LLM_PROVIDERS)[string] } | null {
  const named = (process.env.LLM_PROVIDER ?? '').trim().toLowerCase();
  if (named && LLM_PROVIDERS[named]) return { id: named, conf: LLM_PROVIDERS[named] };
  if (named) return null;
  for (const [id, conf] of Object.entries(LLM_PROVIDERS)) {
    if (conf.keyPrefix.test(key)) return { id, conf };
  }
  return { id: 'groq', conf: LLM_PROVIDERS.groq };
}

interface ChainMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/**
 * Flat rather than a discriminated union on purpose: this project compiles
 * without `strict`, and with strictNullChecks off a `ok: true | false`
 * discriminant does not narrow, so every read of `.attempts` is an error.
 * One shape with nullable fields needs no narrowing to be safe.
 */
interface ChainResult {
  /** The answer, or null if nothing answered. */
  text: string | null;
  /** Which model produced it, for attribution in the UI. */
  model: string | null;
  /** Why there is no text: a rejected key, or the chain running out. */
  reason: 'auth' | 'exhausted' | null;
  /** Each model tried and how it failed, for the server log. */
  attempts: string[];
}

/**
 * Walk a provider's model list until one answers.
 *
 * A free tier retires and rate-limits models without warning, so "this model
 * is unavailable" has to mean "try the next one" rather than "the feature is
 * broken". A rejected key is different in kind - every model will reject it -
 * so that stops the walk immediately instead of failing four times slowly.
 */
async function completeWithChain(
  conf: (typeof LLM_PROVIDERS)[string],
  key: string,
  messages: ChainMessage[],
  opts: { temperature: number; maxTokens: number }
): Promise<ChainResult> {
  const attempts: string[] = [];

  for (const model of conf.models) {
    try {
      const upstream = await fetch(conf.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
        body: JSON.stringify({
          model,
          temperature: opts.temperature,
          max_tokens: opts.maxTokens,
          messages,
        }),
      });

      if (upstream.status === 401 || upstream.status === 403) {
        return { text: null, model: null, reason: 'auth', attempts };
      }

      if (!upstream.ok) {
        // 400 unknown model, 404 retired, 429 rate-limited: all "next".
        attempts.push(`${model} -> ${upstream.status}`);
        continue;
      }

      const body = (await upstream.json()) as {
        choices?: { message?: { content?: string } }[];
      };
      const text = body.choices?.[0]?.message?.content?.trim();
      if (!text) {
        attempts.push(`${model} -> empty`);
        continue;
      }

      return { text, model: `${model} (${conf.label})`, reason: null, attempts };
    } catch (err) {
      attempts.push(`${model} -> ${(err as Error).message}`);
    }
  }

  return { text: null, model: null, reason: 'exhausted', attempts };
}

function briefingToPlainText(b: BriefingPayload): string {
  const out = [b.headline ?? ''];
  for (const s of b.sections ?? []) {
    out.push('', s.heading.toUpperCase());
    for (const line of s.lines) out.push(`- ${line}`);
  }
  return out.join(String.fromCharCode(10));
}

const REWRITE_SYSTEM_PROMPT =
  'You rewrite flood incident briefings for municipal officers in India. ' +
  'Use only the facts given. Never add, change or round a number, a place ' +
  'name or a time. Never invent a cause, a statistic or a recommendation. ' +
  'Write plain English that a non-specialist can act on, in short ' +
  'paragraphs, no headings, no bullet points, under 250 words. If a fact ' +
  'is not in the input, leave it out.';

app.post('/api/briefing/rewrite', async (req, res) => {
  const key = readApiKey('LLM_API_KEY');

  if (!key) {
    // Not an error. The client composes prose from the same facts locally,
    // which is the path that works with no network at all, and this only
    // says why it did not get the better-written version.
    res.json({
      prose: null,
      configured: false,
      message:
        'No language model key is set, so this was written by the app itself. ' +
        'For a better-written version, put a free Groq or OpenRouter key in ' +
        'LLM_API_KEY.',
    });
    return;
  }

  const resolved = resolveProvider(key);
  if (!resolved) {
    res.json({
      prose: null,
      configured: false,
      message: `Unknown LLM_PROVIDER "${process.env.LLM_PROVIDER}". Use groq or openrouter.`,
    });
    return;
  }
  const { conf } = resolved;

  const briefing = (req.body?.briefing ?? {}) as BriefingPayload;
  if (!briefing.sections?.length) {
    res.status(400).json({ prose: null, message: 'No briefing supplied to rewrite.' });
    return;
  }

  const result = await completeWithChain(
    conf,
    key,
    [
      { role: 'system', content: REWRITE_SYSTEM_PROMPT },
      { role: 'user', content: briefingToPlainText(briefing) },
    ],
    { temperature: 0.2, maxTokens: 700 }
  );

  if (result.text) {
    res.json({ prose: result.text, configured: true, model: result.model });
    return;
  }

  if (result.reason === 'auth') {
    res.json({ prose: null, configured: true, message: `${conf.label} rejected the API key.` });
    return;
  }

  console.warn('Briefing rewrite: every model failed.', result.attempts);
  res.json({
    prose: null,
    configured: true,
    message: `No model on ${conf.label} answered. Tried: ${result.attempts.join('; ')}`,
  });
});

/* ---------------------------------------------------------------------------
 * The assistant
 *
 * A chat box is the one place a flood model gets asked open questions, and
 * the questions split cleanly in two. "Which ward do I send the boats to" is
 * answerable only from what this app computed; "why does Chennai flood every
 * November" is general knowledge and the model is genuinely good at it.
 *
 * So the rule is by subject rather than by mode. Scenario facts arrive in the
 * snapshot the client builds from the live dashboard state, and the model may
 * only quote them. Everything else it may answer itself, provided it does not
 * dress a general answer up as a reading from this city.
 *
 * Report and Summarise do not come through here at all unless the user wants
 * them rephrased - the client composes both locally from the same snapshot,
 * so the two buttons that matter work with no key and no network.
 * ------------------------------------------------------------------------ */

/** Turns kept from the conversation. Enough to follow a thread, bounded so a
 *  long session cannot walk into a context limit or a rate limit. */
const CHAT_HISTORY_TURNS = 12;
/** A snapshot longer than this has something wrong with it. */
const CHAT_CONTEXT_LIMIT = 12000;

const envInt = (name: string, fallback: number): number => {
  const parsed = Number.parseInt(process.env[name] ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

/**
 * The shared allowance.
 *
 * Defaults sized for a Groq free tier, which permits far more per minute than
 * this but caps the day: sixty a minute across the whole site is roughly
 * 120,000 tokens a minute with a ward snapshot attached, comfortably inside
 * the per-minute ceiling, and the daily number is what actually decides
 * whether the site still answers at nine in the evening.
 *
 * All three are environment variables because the right value depends on the
 * key that is actually in use, and finding that out should not need a code
 * change.
 */
const chatLimiter = createRateLimiter({
  perIp: { limit: envInt('CHAT_RATE_PER_IP', 8), windowMs: 60_000 },
  global: { limit: envInt('CHAT_RATE_GLOBAL', 60), windowMs: 60_000 },
  daily: { limit: envInt('CHAT_RATE_DAILY', 1500), windowMs: 24 * 60 * 60 * 1000 },
});

/**
 * What to say when the allowance is spent.
 *
 * Each names the real reason and points at the two answers that still work,
 * because "try again later" on its own reads as a broken feature.
 */
const LIMIT_MESSAGE: Record<string, string> = {
  ip:
    'You have asked a lot of questions in the last minute. Give it a moment - ' +
    'Report and Summarise still work, and the app writes those itself.',
  global:
    'The assistant is busy across the site right now. Try again shortly; ' +
    'Report and Summarise are written by the app and still work.',
  daily:
    "The shared daily allowance for the assistant is spent. It resets " +
    'tomorrow. Report and Summarise need no model and still work.',
};

const CHAT_SYSTEM_PROMPT =
  'You are the assistant inside Floodylink, a flood risk dashboard for wards ' +
  'in Tamil Nadu, India. You are talking to municipal officers and emergency ' +
  'staff.\n\n' +
  'A SNAPSHOT of the current modelled situation is given below. It is the ' +
  'only source of truth about this city right now.\n\n' +
  'Rules about the snapshot:\n' +
  '- Any claim about this city, its wards, depths, populations, lead times, ' +
  'shelters or scores must come from the snapshot, quoted exactly.\n' +
  '- Never invent, estimate, round or adjust one of those numbers. If a ' +
  'figure is not in the snapshot, say it is not in the data.\n' +
  '- The snapshot is a model of a scenario, not a live sensor reading. Do not ' +
  'call it an observation.\n\n' +
  'Outside the snapshot you may talk normally. Questions about weather, ' +
  'monsoons, rivers, drainage, climate, past disasters and how floods work ' +
  'are welcome, and you should answer them from your own knowledge, plainly ' +
  'and with interest. When you do, make it clear you are speaking generally ' +
  'rather than reading this city\'s data.\n\n' +
  'Style: conversational and direct. Short paragraphs. Usually under 150 ' +
  'words. Plain English that a non-specialist can act on. Never open with a ' +
  'greeting when the conversation is already running.\n' +
  'Write plain text only. No markdown: no **bold**, no headings, no bullet ' +
  'lists unless asked. The answer is shown as written, so a stray asterisk ' +
  'is an asterisk on screen.';

interface ChatRequestMessage {
  role?: string;
  content?: string;
}

app.post('/api/chat', async (req, res) => {
  const key = readApiKey('LLM_API_KEY');

  const incoming = Array.isArray(req.body?.messages)
    ? (req.body.messages as ChatRequestMessage[])
    : [];
  const history: ChainMessage[] = incoming
    .filter((m) => typeof m?.content === 'string' && m.content.trim())
    .map((m) => ({
      role: m.role === 'assistant' ? ('assistant' as const) : ('user' as const),
      content: String(m.content).slice(0, 4000),
    }))
    .slice(-CHAT_HISTORY_TURNS);

  if (!history.length) {
    res.status(400).json({ reply: null, message: 'No message to answer.' });
    return;
  }

  if (!key) {
    // The buttons that matter still work: the client composes the report and
    // the summary from the same snapshot. Only open conversation needs a key,
    // and saying so is more use than a generic failure.
    res.json({
      reply: null,
      configured: false,
      message:
        'No language model key is set, so I can only give you the report and ' +
        'the summary, which the app writes itself. For open questions, put a ' +
        'free Groq key in LLM_API_KEY.',
    });
    return;
  }

  // Checked here rather than earlier: with no key nothing is spent, so there
  // is nothing to protect and no reason to refuse anybody.
  const decision = chatLimiter.check(clientIp(req.headers, req.socket?.remoteAddress));
  if (!decision.allowed) {
    res.setHeader('Retry-After', String(decision.retryAfterSec));
    res.status(429).json({
      reply: null,
      configured: true,
      limited: decision.scope,
      retryAfterSec: decision.retryAfterSec,
      message: LIMIT_MESSAGE[decision.scope] ?? 'Too many requests. Try again shortly.',
    });
    return;
  }

  const resolved = resolveProvider(key);
  if (!resolved) {
    res.json({
      reply: null,
      configured: false,
      message: `Unknown LLM_PROVIDER "${process.env.LLM_PROVIDER}". Use groq or openrouter.`,
    });
    return;
  }
  const { conf } = resolved;

  const snapshot = String(req.body?.context ?? '').slice(0, CHAT_CONTEXT_LIMIT);
  const system = snapshot
    ? `${CHAT_SYSTEM_PROMPT}\n\nSNAPSHOT\n${snapshot}`
    : `${CHAT_SYSTEM_PROMPT}\n\nNo snapshot was supplied, so you have no data ` +
      `about this city. Say so if asked about it, and answer general questions normally.`;

  const messages: ChainMessage[] = [{ role: 'system', content: system }, ...history];

  const result = await completeWithChain(
    conf,
    key,
    messages,
    // Warmer than the briefing rewrite, which is a transcription job. This is
    // a conversation, and 0.2 makes it read like one side of a form.
    { temperature: 0.5, maxTokens: 800 }
  );

  if (result.text) {
    /*
     * Check, correct, check again.
     *
     * The prompt asks the model not to invent figures about this city. This
     * is where that is enforced rather than hoped for: the answer is measured
     * against the same snapshot it was given, and a failure is handed back
     * with the specific figures named. One retry, not a loop that runs until
     * it passes - a second failure means the model cannot answer this from
     * the data, and asking a third time spends a shared quota to get a third
     * guess.
     */
    const question = history[history.length - 1].content;
    const facts = snapshot ? readSnapshot(snapshot) : null;
    const problems = facts ? verifyAnswer(result.text, facts) : [];

    if (!problems.length) {
      res.json({ reply: result.text, configured: true, model: result.model, verified: true });
      return;
    }

    const retry = await completeWithChain(
      conf,
      key,
      [
        ...messages,
        { role: 'assistant', content: result.text },
        { role: 'user', content: correctionPrompt(problems) },
      ],
      // Colder for the correction: this is a repair against a list, not an
      // invitation to write something new.
      { temperature: 0.2, maxTokens: 800 }
    );

    const remaining = retry.text ? verifyAnswer(retry.text, facts) : problems;
    const stillWrong = new Set(remaining.map((p) => `${p.kind}:${p.value.toLowerCase()}`));

    const rows: VerificationRecord[] = problems.map((p) => ({
      kind: p.kind,
      value: p.value,
      expected: p.expected,
      context: p.context,
      question,
      model: result.model ?? 'unknown',
      attempt: 1,
      corrected: retry.text ? !stillWrong.has(`${p.kind}:${p.value.toLowerCase()}`) : false,
    }));
    for (const p of remaining) {
      rows.push({
        kind: p.kind,
        value: p.value,
        expected: p.expected,
        context: p.context,
        question,
        model: retry.model ?? result.model ?? 'unknown',
        attempt: 2,
        corrected: null,
      });
    }
    // Not awaited: a user waits for an answer, not for a database.
    void recordVerifications(rows);

    if (retry.text && !remaining.length) {
      res.json({
        reply: retry.text,
        configured: true,
        model: retry.model,
        verified: true,
        corrected: true,
      });
      return;
    }

    /*
     * Twice wrong about the data. The structured answers are exact and one
     * button away, so the honest thing is to say the answer could not be
     * checked rather than print it with a disclaimer nobody reads.
     */
    console.warn(
      'Chat: answer failed verification twice.',
      remaining.map((p) => `${p.kind} "${p.value}"`)
    );
    res.json({
      reply: null,
      configured: true,
      verified: false,
      message:
        'I could not answer that from the data without getting a figure wrong, ' +
        'so I have not shown it. Report and Summarise are computed from the ' +
        'same numbers and are exact.',
    });
    return;
  }

  if (result.reason === 'auth') {
    res.json({ reply: null, configured: true, message: `${conf.label} rejected the API key.` });
    return;
  }

  console.warn('Chat: every model failed.', result.attempts);
  res.json({
    reply: null,
    configured: true,
    message: `No model on ${conf.label} answered. Tried: ${result.attempts.join('; ')}`,
  });
});

/*
 * The three /api/gemini/* routes that stood here are gone.
 *
 * They generated the incident briefing, the what-if diagnosis and the alert
 * copy. All three are now composed in the browser from the application's own
 * flood model - see src/utils/briefing.ts - which means they render with no
 * key, no quota and no network, and cannot state a figure the model did not
 * produce. /api/briefing/rewrite above is the only remaining model call, and
 * it only rephrases facts it is handed.
 */

export function mountNotFound() {
  app.use((req, res) => {
    res.status(404).json({ error: 'Not found', path: req.originalUrl });
  });
}
