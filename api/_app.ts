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

const LLM_ENDPOINTS: Record<string, { url: string; model: string; label: string }> = {
  groq: {
    url: 'https://api.groq.com/openai/v1/chat/completions',
    model: 'llama-3.3-70b-versatile',
    label: 'Llama 3.3 70B (Groq)',
  },
  openrouter: {
    url: 'https://openrouter.ai/api/v1/chat/completions',
    model: 'meta-llama/llama-3.3-70b-instruct:free',
    label: 'Llama 3.3 70B (OpenRouter)',
  },
};

function briefingToPlainText(b: BriefingPayload): string {
  const out = [b.headline ?? ''];
  for (const s of b.sections ?? []) {
    out.push('', s.heading.toUpperCase());
    for (const line of s.lines) out.push(`- ${line}`);
  }
  return out.join(String.fromCharCode(10));
}

app.post('/api/briefing/rewrite', async (req, res) => {
  const provider = (process.env.LLM_PROVIDER ?? 'groq').toLowerCase();
  const key = readApiKey('LLM_API_KEY');
  const endpoint = LLM_ENDPOINTS[provider];

  if (!endpoint) {
    res.json({
      prose: null,
      message: `Unknown LLM_PROVIDER "${provider}". Use groq or openrouter.`,
    });
    return;
  }
  if (!key) {
    res.json({
      prose: null,
      message:
        'No language model is configured. Set LLM_PROVIDER and LLM_API_KEY to enable ' +
        'the prose rewrite; both Groq and OpenRouter have a free tier.',
    });
    return;
  }

  const briefing = (req.body?.briefing ?? {}) as BriefingPayload;
  if (!briefing.sections?.length) {
    res.status(400).json({ prose: null, message: 'No briefing supplied to rewrite.' });
    return;
  }

  try {
    const upstream = await fetch(endpoint.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model: endpoint.model,
        temperature: 0.2,
        max_tokens: 700,
        messages: [
          {
            role: 'system',
            content:
              'You rewrite flood incident briefings for municipal officers in India. ' +
              'Use only the facts given. Never add, change or round a number, a place ' +
              'name or a time. Never invent a cause, a statistic or a recommendation. ' +
              'Write plain English that a non-specialist can act on, in short ' +
              'paragraphs, no headings, no bullet points, under 250 words. If a fact ' +
              'is not in the input, leave it out.',
          },
          { role: 'user', content: briefingToPlainText(briefing) },
        ],
      }),
    });

    if (!upstream.ok) {
      const detail = (await upstream.text()).slice(0, 200);
      res.json({
        prose: null,
        message:
          upstream.status === 401
            ? `${endpoint.label} rejected the API key.`
            : `${endpoint.label} returned ${upstream.status}. ${detail}`,
      });
      return;
    }

    const body = (await upstream.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const prose = body.choices?.[0]?.message?.content?.trim();

    if (!prose) {
      res.json({ prose: null, message: `${endpoint.label} returned nothing to show.` });
      return;
    }
    res.json({ prose, model: endpoint.label });
  } catch (err) {
    console.warn('Briefing rewrite failed:', err);
    res.json({
      prose: null,
      message: `Could not reach ${endpoint.label}: ${(err as Error).message}`,
    });
  }
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
