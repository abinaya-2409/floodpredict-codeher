# FloodyPredict — Urban Flood Intelligence

Flood risk prediction and **vulnerability-weighted response prioritisation** for
flood-prone Indian wards. Built for SDG 11.5 (reducing disaster deaths and
losses in cities).

Live: https://floodpredict-codeher.vercel.app

Hydrology tells you where the water goes. FloodyPredict tells you **where it hurts
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

**Scope: Tamil Nadu.** Both maps mask everything outside the state: a polygon
covering the region with Tamil Nadu punched out of it as holes, drawn over
the tiles. Bounding the pan alone was not enough, because a viewport is a
rectangle and a state is not, so Kerala, Andhra Pradesh and Sri Lanka still
filled the corners of every view. The outline is dissolved from the 32 Census
2011 district polygons by `tools/build-tn-outline.mjs`. Place search and the
city list are bounded to the state too. Chennai is the modelled city, with surveyed drainage, ward
demographics and per-street thresholds; every other point in the state is
answered by the terrain-and-rainfall read described below.

Scoping is a filter, not a deletion. The ward models for Mumbai, Bengaluru,
Delhi, Kolkata, Hyderabad, Guwahati and Kochi are still in `mockData.ts`,
still typed and still exercised by the test suite; widening the app again is
a one-line change to `ACTIVE_STATE`.

**Click anywhere to predict there.** The map is an instrument rather than a
viewer: click any coordinate in India and it samples terrain as a nine-point
ring around the click and pulls that point's hourly rainfall forecast, then
runs a 48-hour storage simulation. The result is a timeline, not a single
figure - scrub or play it and the water on the map rises and recedes with the
curve.

The terrain ring is what makes it more than a guess. One elevation reading
says nothing, because 4m above sea level is a death sentence in a delta and
unremarkable on a plateau; what decides ponding is the height of a point
*relative to the ground immediately around it*. The model reports a
**drainage threshold** - the rainfall intensity above which water starts to
stand at that spot - so a quiet forecast returns an answer ("peaks at 9mm/hr
against a 12.4mm/hr threshold") rather than a blank.

Two sources, switchable in the panel: the live Open-Meteo forecast, or a
what-if storm you set. Switching between them and dragging the intensity
recompute locally from the reading already in hand, so the map redraws on the
same frame instead of waiting on the network.

**The Tamil Nadu disaster record.** 27 sourced events from 2016 to 2025 -
11 floods and cyclones, plus fireworks-factory explosions, boiler blasts, a
rail collision and a drought declaration - generated from the CSVs in `data/`
by `tools/build-tn-history.mjs`. Clicking a point shows what has actually
happened in that district: events, deaths and the government record they came
from.

None of it is a model input, and the reason is worth stating plainly. Eleven
flood and cyclone events cannot calibrate a hydrological model; only one of
them carries a published rainfall figure, and none records an observed water
depth. It is context for a person reading a forecast. What the record *can*
do is catch a model that is badly wrong - see **Does the model agree with the
record?** below.

**Any other district:** search a district outside those eight and the map
draws its real OSM boundary and returns a *reconnaissance read* - a 0-100
hazard score built from live rainfall and a 3x3 terrain sample, both fetched
on demand. It is labelled and caveated as the weaker claim it is: no drainage
network, no demographics, not for dispatch decisions. Nothing is bundled to
make this work, which is the point - a national district boundary set is
4-34MB, while one district's boundary is about 80KB.

**Languages:** English plus one per modelled city - Hindi, Bengali, Marathi,
Telugu, Tamil, Kannada, Malayalam and Assamese. Switching city offers that
city's language until you choose one deliberately, after which your choice
stands. A flood warning in a language you cannot read is not a warning, and
the residents this app weights toward are the least likely to be reading
English.

These translations need review by native speakers before operational use.

**National Grid:** a second map covering all 641 Indian districts. Place a
flood origin anywhere, pick a severity level, and the impact footprint and
ranked district list recompute live. It is a distance-decay footprint, not
hydrology - selecting a district hands off to the reconnaissance read, which
uses real terrain and rainfall for that one place.

Built on MapLibre GL rather than Leaflet: 641 polygons restyled on every
epicentre move is a GPU job, and feature-state updates keep the geometry on
the card. Both the library and the boundaries load only when the tab is
opened.

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

The palette enforces one rule: **the five severity colours are data only.**
They never appear as a button, a border or a brand flourish. Interaction is
carried by a single azure accent at a hue the severity ramp never enters, and
system state (telemetry online, connection lost) uses its own status colours.
Without that separation a green "safe" ward and a green "online" chip mean
the same thing to the eye, which is what made the earlier build hard to read.

Radii follow three steps - `rounded-panel`, `rounded-card`, `rounded-control` -
replacing an ad-hoc mix of five, and type uses named steps (`text-nano`,
`text-micro`, `text-mini`) in place of 120 arbitrary pixel sizes.

Shared primitives live in [`src/components/ui/`](src/components/ui):
`Button` (four semantic variants), `Panel`, `Badge` / `RiskBadge`, `StatTile`.
`RiskBadge` and `StatTile` are the only components permitted to paint with the
severity ramp, and `StatTile` takes a severity only when the value actually
has one - so a measurement is never permanently red.
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
- `VITE_MAPTILER_KEY` — optional, and genuinely optional. The map ships four
  **keyless** Esri basemaps (Command, Satellite, Elevation, Streets) plus
  India-wide place search via Nominatim; a MapTiler key only appends a fifth
  terrain option.

  Note: CARTO's raster basemaps now stamp "API KEY REQUIRED" across every
  unauthenticated tile, so they are not usable keyless despite returning
  HTTP 200.

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
    dispatch.ts      Resource recommendations derived from the index
    openMeteo.ts     Keyless live elevation and rainfall
    districtModel.ts Reconnaissance scoring for unmodelled districts
    geocode.ts       Nominatim place search and on-demand boundaries
    facilities.ts    Shelter-capable facilities for any Indian district
    nationalModel.ts District impact scoring for the national grid
tools/
  build-districts.mjs  Rebuilds the district boundary file from the shapefile
  data/mockData.ts    Ward, drain, shelter and demographic fixtures
tools/
  audit.mjs           Walks every city against every tab, reports what renders
  probe.mjs           Loads a deployment and reports tile/console diagnostics
```

`floodEngine.ts` and `riskIndex.ts` are deliberately separate: physical
hydrology and social vulnerability are different concerns, reviewed by
different people, and only one of them is contestable on engineering grounds.

---

## Offline Bluetooth chat: what works and what does not

**It cannot work in a browser, and it cannot currently be built as an app.**

The feature is written against a Capacitor native Android bridge
(`android/app/src/main/java/com/floodypredict/app/BluetoothChatPlugin.java`).
In the deployed web app `window.Capacitor` does not exist, so
`BluetoothService.isNativeAvailable()` is false and every scan falls through
to a simulation that is off by default - which is why scanning finds nothing
and says nothing. The empty state now says so instead of advising you to
check Bluetooth on nearby phones, which could never have helped.

There is no Web Bluetooth fallback, and one would not rescue this. Web
Bluetooth connects only to BLE GATT peripherals the user picks from a browser
chooser; it has no classic-Bluetooth discovery and no peripheral mode, and a
phone running a browser does not advertise itself as a connectable GATT
peripheral. Phone-to-phone chat needs a native app on both handsets.

To make it real, three things are missing:

1. **Capacitor is not installed.** `package.json` has no `@capacitor/core`,
   `@capacitor/android` or `@capacitor/cli`, so `capacitor.config.ts` is
   inert and `npx cap sync` cannot run.
2. **`android/` is not a Gradle project.** It holds three files -
   `AndroidManifest.xml`, `BluetoothChatPlugin.java`, `MainActivity.java` -
   with no `build.gradle`, no `settings.gradle` and no Gradle wrapper.
   `npx cap add android` generates these.
3. **Runtime permissions.** Android 12+ needs `BLUETOOTH_SCAN`,
   `BLUETOOTH_CONNECT` and `BLUETOOTH_ADVERTISE` requested at runtime, and
   Android 6-11 additionally requires Location to be enabled before a scan
   returns anything.

Until then the browser offers a simulated two-device demo, labelled as
simulated. None of this was verified against a real handset here - there is
no Android SDK in this environment - so treat the list above as the diagnosis
it is, not as a tested build recipe.

## Does the model agree with the record?

`npx tsx tools/validate-model.ts` runs one identical storm - 80mm/hr for six
hours - at all 32 Tamil Nadu district centroids and ranks the results against
how often each district appears in the disaster record.

| | |
|---|---|
| Districts scored | 32 |
| With a recorded flood or cyclone | 18 |
| Mean predicted depth, districts with events | 29.9 cm |
| Mean predicted depth, districts without | 27.3 cm |
| **Spearman rho** | **0.389** |

A positive correlation, significant at 5% for n=32. Read it for what it is:
the model separates the hill districts from the coastal and deltaic ones,
which is the main thing a terrain read *can* do. Kanniyakumari, Coimbatore,
the Nilgiris, Salem, Dharmapuri and Krishnagiri all score low, and all of
them shed water. What it does not do is separate the plains from each other -
Chennai scores 35cm against Ariyalur's 36cm, and Chennai has six recorded
events to Ariyalur's none.

That gap is the honest measure of this model: it reads terrain, and urban
flooding is decided by drainage the terrain cannot see.

Two artefacts of the harness, not of the model, which depress the number:

- **A centroid is one point, and often the wrong one.** Kanniyakumari has two
  recorded events and scores 0cm because its centroid lands 39m above its
  surroundings in the Western Ghats, while the district floods on its coastal
  plain.
- **The record counts reporting, not flooding.** Chennai is the most reported
  place in the state for reasons that include it being Chennai.

This is a ranking check, not a depth validation. It can show that a model is
wrong. It cannot show that one is right.

## Data provenance and limitations

Read this before quoting any number from this application.

- **Ward demographics** are indicative estimates compiled from Census 2011
  district handbooks and municipal ward profiles. They are planning estimates,
  **not survey data**.
- **Hydrology** uses a Modified Rational Formula with a micro-topography
  factor. The coefficients are calibrated by judgement, not against gauge
  records, and the model has not been validated against observed flood extent.
- **The point prediction is a terrain-and-rainfall read, not hydraulics.** It
  carries no surveyed drain network, no culvert capacities and no river
  routing, and its terrain comes from a 90m DEM sampled at nine points, so it
  cannot see a blocked culvert or a bund. It answers "does water tend to stand
  here, and above what rainfall" - not "how deep will this street be". Its
  storage and drainage coefficients are pinned by behaviour in
  `src/__tests__/pointForecast.test.ts` rather than validated against gauges.
- **Weather and gauge readings are fixtures for the eight modelled cities.**
  The reconnaissance path for other districts uses live Open-Meteo rainfall
  and elevation; folding that feed back into the modelled cities is the next
  obvious step.
- **Nothing persists.** Citizen reports and dispatch state live in memory and
  are lost on refresh.
- **The disaster record is an impact record, not a meteorological one.** It
  says what was destroyed and who died, sourced to government releases where
  possible. It almost never says how much rain fell, and never how deep the
  water was, so it cannot train or calibrate anything. Where the two source
  files disagree - Nivar at 6 deaths against 12, Fengal at 40 against 3 - the
  government-sourced figure is used and the other is kept on the record as a
  documented variant rather than discarded.
- **Six Tamil Nadu districts have no polygon.** Chengalpattu, Kallakurichi,
  Mayiladuthurai, Ranipet, Tenkasi and Tirupathur were created after 2019 and
  do not exist in the Census 2011 boundary set, so their events are attributed
  to the parent district they were carved from, and the substitution is
  recorded on each event.

Replace all four with authoritative feeds before any operational use.

## Open data used

All of it keyless, and fetched on demand rather than vendored:

| Source | Used for | Licence |
|---|---|---|
| [Open-Meteo](https://open-meteo.com/) | Live rainfall forecast, terrain elevation | CC-BY 4.0, free for non-commercial use |
| [Nominatim / OpenStreetMap](https://www.openstreetmap.org/copyright) | Place search, district boundaries | ODbL |
| [Esri ArcGIS Online](https://www.esri.com/) | Basemap, satellite and topographic tiles | Free with attribution |
| [datameet/maps](https://github.com/datameet/maps) | Census 2011 district boundaries (641 districts) | MIT |
| [CARTO GL basemaps](https://carto.com/attributions) | Vector styles for the national map | Free with attribution |
| [Nominatim / OpenStreetMap](https://www.openstreetmap.org/copyright) | Relief camp candidates (schools, halls, hospitals) statewide | ODbL |
| Tamil Nadu disaster record (`data/*.csv`) | 27 sourced events, 2016-2025 | Compiled from MHA/PIB/CWC parliamentary records, TN government gazettes and press reporting; each row carries its own source URL |

Nominatim asks for at most one request per second; every lookup here is
debounced and cached for the session.

## Licence

MIT
