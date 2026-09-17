# JalRakshak — Urban Flood Intelligence

Flood risk prediction and **vulnerability-weighted response prioritisation** for
flood-prone Indian wards. Built for SDG 11.5 (reducing disaster deaths and
losses in cities).

Live: https://floodpredict-codeher.vercel.app

Hydrology tells you where the water goes. JalRakshak tells you **where it hurts
most** — two wards can flood to the same depth and still deserve completely
different responses.

---

## What it does

**Composite Vulnerability Risk Index (VRI)** — a 0–100 score per ward, computed
live from four weighted, individually-readable components:

| Component | Weight | Answers |
|---|---|---|
| Hazard | 0.35 | How deep, across how much of the catchment |
| Exposure | 0.20 | How many people the water actually reaches |
| Fragility | 0.25 | Who is exposed — elderly, disabled, low-income, ground-floor-only |
| Coping deficit | 0.20 | Shelter headroom, drain health, distance to a hospital |

Lead time is deliberately **excluded** from the index and applied separately as
an urgency multiplier for dispatch order. Mixing "how bad" with "how soon" into
one number makes both unreadable.

Everything downstream reads from the VRI rather than from hand-authored
priorities: the evacuation queue, resource dispatch ranking, and map colouring
are all derived.

**Also included:** street-level inundation depth with per-street rainfall
thresholds, a what-if hydraulic sandbox (drain blockages, pumping, tide),
tiered alert drafting, citizen reporting, and Gemini-assisted executive
reporting.

---

## Look and feel

A live sky renders behind the whole interface (Vanta CLOUDS2, using the
effect's own palette), with the application sitting on top of it as dark
glass panels.

Every colour resolves through a semantic token defined once in
[`src/index.css`](src/index.css) - no component references a raw palette
value, so restyling the interface header-to-footer is an edit to one block.
Libraries that cannot read CSS (Leaflet, Recharts) are bridged through
[`src/theme/useThemeTokens.ts`](src/theme/useThemeTokens.ts).

The background is skipped for anyone with `prefers-reduced-motion` set, and
three.js is dynamically imported so it never sits on the first-paint path.

## Running it

```bash
npm install
npm run dev        # http://localhost:3000
```

```bash
npm run test:run   # unit + component tests
npm run typecheck  # tsc --noEmit
npm run build      # production bundle
```

### Configuration

Copy `.env.example` to `.env`. Every variable is optional:

- `GEMINI_API_KEY` — enables the AI analysis routes. Without it, those routes
  return a response explicitly flagged `{"sample": true, "aiAvailable": false}`
  so placeholder text can never be mistaken for real analysis.
- `VITE_MAPTILER_KEY` — optional. Upgrades the map to MapTiler terrain;
  without it the map uses CARTO's keyless basemap.

---

## Architecture

```
api/
  [...path].ts    Vercel function entry — routes all /api/*
  _app.ts         Express app (underscore keeps it unrouted)
src/
  utils/
    floodEngine.ts   Hydrology: runoff, drainage deficit, inundation depth
    riskIndex.ts     Social vulnerability + composite VRI  ← pure, tested
  theme/
    useThemeTokens.ts   CSS-token bridge for Leaflet and Recharts
  components/         UI, one concern per file
  data/mockData.ts    Ward, drain, shelter and demographic fixtures
```

`floodEngine.ts` and `riskIndex.ts` are deliberately separate: physical
hydrology and social vulnerability are different concerns, reviewed by
different people, and only one of them is contestable on engineering grounds.

---

## Data provenance and limitations

Read this before quoting any number from this application.

- **Ward demographics** are indicative estimates compiled from Census 2011
  district handbooks and municipal ward profiles. They are planning estimates,
  **not survey data**.
- **Hydrology** uses a Modified Rational Formula with a micro-topography
  factor. The coefficients are calibrated by judgement, not against gauge
  records, and the model has not been validated against observed flood extent.
- **Weather and gauge readings are fixtures.** There is no live meteorological
  feed yet; the intended source is Open-Meteo.
- **Nothing persists.** Citizen reports and dispatch state live in memory and
  are lost on refresh.

Replace all four with authoritative feeds before any operational use.

## Licence

MIT
