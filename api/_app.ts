import express from 'express';

export const app = express();
app.use(express.json());

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
    platform: 'FloodyPredict',
    // The briefing no longer needs a model, so this is reported as the
    // optional extra it is rather than as a health problem.
    briefing: 'computed locally, no model required',
    rewriteProvider: llmKey ? (process.env.LLM_PROVIDER ?? 'groq') : null,
    rewriteConfigured: Boolean(llmKey),
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
 * screen. Two providers, both serving open-weight Llama models on a free
 * tier, both OpenAI-compatible, so one code path covers either:
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
      'llama-3.3-70b-versatile',
      'openai/gpt-oss-120b',
      'qwen/qwen3-32b',
      'llama-3.1-8b-instant',
    ],
  },
  openrouter: {
    url: 'https://openrouter.ai/api/v1/chat/completions',
    label: 'OpenRouter',
    keyPrefix: /^sk-or-/,
    models: [
      'meta-llama/llama-3.3-70b-instruct:free',
      'deepseek/deepseek-chat-v3-0324:free',
      'qwen/qwen3-235b-a22b:free',
      'mistralai/mistral-small-3.2-24b-instruct:free',
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

  const userContent = briefingToPlainText(briefing);
  const attempts: string[] = [];

  // Walk the chain. A free tier retires and rate-limits models without
  // warning, so "this model is unavailable" has to mean "try the next one"
  // rather than "the feature is broken".
  for (const model of conf.models) {
    try {
      const upstream = await fetch(conf.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
        body: JSON.stringify({
          model,
          temperature: 0.2,
          max_tokens: 700,
          messages: [
            { role: 'system', content: REWRITE_SYSTEM_PROMPT },
            { role: 'user', content: userContent },
          ],
        }),
      });

      if (upstream.status === 401 || upstream.status === 403) {
        res.json({
          prose: null,
          configured: true,
          message: `${conf.label} rejected the API key.`,
        });
        return;
      }

      if (!upstream.ok) {
        // 400 unknown model, 404 retired, 429 rate-limited: all "next".
        attempts.push(`${model} -> ${upstream.status}`);
        continue;
      }

      const body = (await upstream.json()) as {
        choices?: { message?: { content?: string } }[];
      };
      const prose = body.choices?.[0]?.message?.content?.trim();
      if (!prose) {
        attempts.push(`${model} -> empty`);
        continue;
      }

      res.json({ prose, configured: true, model: `${model} (${conf.label})` });
      return;
    } catch (err) {
      attempts.push(`${model} -> ${(err as Error).message}`);
    }
  }

  console.warn('Briefing rewrite: every model failed.', attempts);
  res.json({
    prose: null,
    configured: true,
    message: `No model on ${conf.label} answered. Tried: ${attempts.join('; ')}`,
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
