# Floodylink — Urban Flood Intelligence

Flood risk prediction and **vulnerability-weighted response prioritisation** for
flood-prone Indian wards. Built for SDG 11.5 (reducing disaster deaths and
losses in cities).

Live: https://floodpredict-codeher.vercel.app

Hydrology tells you where the water goes. Floodylink tells you **where it hurts
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

**A live weather field over the whole state.** The map tab opens on a
Windy-style animated field: rain, wind and temperature straight from
Open-Meteo across a 20x25 grid, scrubbable and playable across 48 hours, with
wind drawn as particles advected through the vector field.

The fourth layer is the one worth having. Every weather map shows where rain
falls; this runs each cell's hourly rainfall through that cell's own terrain
and shows **where the water ends up standing**. Terrain is precomputed from
Mapzen/AWS terrarium elevation tiles - each 27km cell sampled on a 10x10
lattice and represented by its low ground, because that is where water
collects and people are flooded.

Two constraints shaped it, and both are visible in the result:

- **Open-Meteo bills per coordinate**, 600 a minute and 10,000 a day. A
  browser fetching 500 cells directly would burn a user's daily allowance in
  about twenty page loads, so the forecast is fetched by `/api/weather-grid`
  instead and cached at the CDN for half an hour. One upstream request serves
  everyone. The 0.25-degree cell size is set by that minute limit, not by
  cartography.
- **Tamil Nadu is dry most of the year**, so the flood layer is correctly
  empty most days - and an empty flagship layer is indistinguishable from a
  broken one. It says so, in the same words the model would use ("the
  forecast peaks at 2.6mm/hr, under the drainage threshold of most of the
  state"), and offers x2/x4/x8 scenarios that re-run the model on scaled
  rainfall. Those are labelled as scenarios on the map itself, not as
  forecasts.

The field is rendered by painting one pixel per cell into a 20x25 offscreen
canvas and scaling it up with smoothing on, which buys bilinear interpolation
across the whole map for the cost of 500 pixels.

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

Two themes, and they are genuinely two themes.

**OLED** is a true `#000` page. Nothing in the background is lifted off
black, so on an OLED panel most of the screen is switched off - which is
both the battery saving and the reason the accents read as bright as they
do. The vibrance is carried by three things and never by the page itself:
electric cyan for anything you can act on, violet as its second note, and
the severity ramp, which runs at full saturation because on black it can
afford to. Surfaces sit just off black, far enough that one panel is
distinguishable from the next and no further.

**Light** is an overcast morning: bright at the horizon, weight at the top,
rain drawn dark so you can see it. It used to paint the same `#2d4f63` slab
behind the page that the dark theme did, and hand the cloud effect a palette
whose three "light" colours were `#4d6675`, `#2d4f63` and `#132a38` - so on
any machine that ran the effect, light mode rendered as a dark one with
white cards pasted on it.

The theme is resolved by an inline script in
[`index.html`](index.html) before the first paint, so the loading screen is
already the right colour. React only learns the theme once `App` mounts,
several hundred milliseconds later, which is long enough to see a white
flash on the way into OLED and a black one on the way into light.

### Colour rules

Every colour resolves through a semantic token defined once in
[`src/index.css`](src/index.css). No component references a raw palette
value, and [a test](src/__tests__/theme.test.ts) walks every `.tsx` file to
keep it that way - a raw `text-cyan-300` is a colour that cannot follow the
theme, which is how a label ends up invisible on a white card.

**The five severity colours are data only.** They never appear as a button,
a border or a brand flourish. Interaction is carried by a single accent at a
hue the severity ramp never enters, and system state (telemetry online,
connection lost) uses its own status colours. Without that separation a
green "safe" ward and a green "online" chip mean the same thing to the eye.

Severity carries a **second, darker set** used wherever a level is written
rather than drawn (`--color-risk-*-ink`). The ramp is tuned to be seen as a
filled shape on a map; set as type it fails - `#f5d020` on white is 1.5:1,
which is not a readable label. The severity pill used to set its own text in
the fill colour, so "Watch" was yellow type on a 14% yellow pill. The dot
and the border still carry the ramp, because those are shapes.

The map owns two colours that are not the page's: `--color-map-canvas`, what
is behind a tile that has not arrived yet, and `--color-map-surround`,
everything outside the state this application models. As the page colour the
canvas flashed the interface's own surface through the map, which reads as a
hole in it.

Radii follow three steps - `rounded-panel`, `rounded-card`, `rounded-control` -
and type uses named steps (`text-nano`, `text-micro`, `text-mini`) rather
than arbitrary pixel sizes.

Shared primitives live in [`src/components/ui/`](src/components/ui):
`Button`, `Panel`, `Badge` / `RiskBadge`, `StatTile`. Libraries that cannot
read a stylesheet (Leaflet, MapLibre, Recharts) are bridged through
[`src/theme/useThemeTokens.ts`](src/theme/useThemeTokens.ts), which re-reads
on every theme change - MapLibre paint properties are values, not
references, so without that a theme switch left the district grid painted in
the other theme's colours.

### One container

`.shell` is the only page container. The header used `px-3/sm:px-6` while
`<main>` used `px-3/sm:px-6/lg:px-8`, so from 1024px up the navigation bar
sat 8px wider than every card beneath it. Header, offline banner, main
column and footer all read `--shell-max` and `--shell-gutter` now, so the
left edge of the logo and the left edge of the first card are the same line
at every width, and the gutter absorbs the safe-area inset rather than being
replaced by it.

### Adapting to the device

Three things change with the machine, and none of them are a guess about
screen width alone.

- **Pointer.** Every control was between 17px and 36px tall, under half the
  44px both Apple and Google publish as the minimum, in an application meant
  to be used one-handed, in the rain, by someone in a hurry. On a coarse
  pointer controls grow to 44px and inputs are forced to 16px, below which
  iOS Safari zooms the page on focus and never zooms back out. On a mouse
  they stay compact, because a dense board is the right answer there.
- **Backdrop blur** is dropped entirely on touch. Blurring a full-screen
  backdrop behind a dozen panels is one of the most expensive things a phone
  GPU can be asked to do, and the panels are 90% opaque, so almost none of
  it is visible. The surface goes fully opaque in exchange.
- **Viewport and safe areas.** `100dvh` rather than `100vh`, so a full-height
  panel is the height you can actually see; `env(safe-area-inset-*)` so an
  installed PWA clears the notch and the home indicator.

### Crispness

The live sky renders at the device pixel ratio, capped at 2. It was pinned
at 1, so on a 3x phone screen it was rendered at a third of the resolution
and stretched over it - most of why the background looked soft next to the
text in front of it. Panels carry a 1px contact shadow as well as the wide
one: a single diffuse shadow is what made every card look slightly out of
focus.

The background is skipped entirely for anyone with `prefers-reduced-motion`
set and on phones, where it was measured pushing a bare expression evaluated
in the page from under a millisecond to 4.6 seconds. three.js is dynamically
imported, so on a phone it is never downloaded at all.

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

## The incident briefing needs no AI

The briefing used to be a Gemini call. The key in production was rejected for
weeks, and what users saw instead was invented prose - "exceeding local
percolation limits by 240%", "runoff coefficient exceeding 0.85" - with no
connection to anything the application had computed.

Every hosted model needs a key, so swapping Gemini for another one would have
moved the problem rather than fixed it. The briefing is now **composed from
the application's own model** in `src/utils/briefing.ts`: which wards score
worst, how deep the water gets, how long there is, how many people cannot
leave without help, what to dispatch, and what happened in that district
before. It renders instantly, needs no key, quota or network, and cannot
state a figure the model did not produce - which is the failure mode that
matters when the output is an evacuation order.

A language model is still offered, but only to rewrite those same facts as
prose, and only when a key is set. Two providers, both serving **open-weight
Llama 3.3 70B** on a free tier:

```
LLM_PROVIDER=groq        LLM_API_KEY=gsk_...    # console.groq.com
LLM_PROVIDER=openrouter  LLM_API_KEY=sk-or-...  # openrouter.ai
```

The model is told to add no numbers. It cannot be stopped from trying, which
is precisely why the facts are computed elsewhere and the rewrite is optional.
With no key the button explains itself and the briefing is untouched.

`@google/genai` is gone, as are the three `/api/gemini/*` routes.

## Keeping it simple

The map screen was showing 54 controls at once, ten of them tabs in a strip
that overflowed on anything narrower than a laptop. Rows of pills where only
one option can be chosen are menus that have been unrolled across the screen,
so the ones past three options are now menus again:

| | Before | After |
|---|---|---|
| Controls on screen | 54 | 41 |
| Top-level tabs | 10 | 2, plus 2 menus |
| Weather map toolbar | 13 | 5 |

Nothing was removed to get there except genuine duplication: the rainfall
slider existed in two places at once and was missing from a third, and the
national district map was a whole tab for something that is a mode of the
flood map. Every menu entry carries a line saying what it is, which the pill
rows never had room for.

The wording changed too. "Inundation Map" is now "Flood Map", "Choked
Drainage Canals" is "Blocked drains", and rainfall is chosen as "Heavy rain -
80 mm/hr, roads begin to flood" rather than as a number on a slider from 20
to 200. The other eight languages still carry translations of the older,
heavier English and want a native-speaker pass.

One claim was deleted rather than reworded: the header carried "87.4% High
Confidence", "based on 14 Automatic Weather Stations, S-Band Doppler Radar
and CartoDEM 10m Elevation Grid". The application uses none of those.

## Installing it on a phone

The app installs to the home screen on both Android and iPhone and opens
afterwards with no network at all, which is the state it is built for: a
flood that takes out the towers is exactly when someone reaches for this.

**Android, Chrome or Edge.** An **Install app** button appears at the top of
the screen. One tap.

**iPhone, Safari.** Apple exposes no install API, so there is no button that
could work; the app shows the three steps instead. Share → Add to Home Screen
→ Add. It has to be Safari — Chrome on iPhone cannot add to the home screen.

Both are handled by `src/components/InstallAppPrompt.tsx`, which shows the
button only when the browser has actually offered one and shows the iPhone
steps only on iPhone. A button that does nothing is worse than a sentence.

### What works with the network off

`public/sw.js` caches by what each request actually needs, which is not the
same rule for all of them:

| Request | Strategy | Why |
| --- | --- | --- |
| The HTML page | network first, cache fallback | Its URL never changes, so cache-first would pin people to an old build |
| `/assets/*` | cache first | Vite hashes the filename, so the bytes at a URL can never change |
| `/data/*`, `/icons/*` | stale while revalidate | Instant, refreshed in the background |
| Map tiles | cache first, capped at 600 | What makes the map usable offline, and what would otherwise eat the disk |
| `/api/*` | **never cached** | A stale flood forecast looks current and is not. An obvious failure is safer |

One online visit fills the caches; after that the app opens offline. Verified
rather than assumed: `tools/pwa-test.mjs` loads the app on an emulated Pixel 7,
switches Chrome to offline through the CDP so every request genuinely fails,
reloads, and checks the app still renders. It came back with 99 cached entries
and 5,994 characters of rendered content with the network down.

Run it against a production build, not the dev server — the service worker
only registers in production:

```bash
npm run build
NODE_ENV=production PORT=4381 node dist/server.cjs
node tools/pwa-test.mjs http://localhost:4381/
```

### The alert sound

An arriving message plays a tone and buzzes the phone, because the whole
point of an offline chat is that it works from a pocket. An ordinary message
is a two-note rising chime; an SOS is four harder, higher notes, so the two
are tellable apart without looking.

The tone is synthesised (`src/utils/alertSound.ts`) rather than shipped as an
audio file: it costs nothing in a cache that has to survive on a phone with no
network, and a sine chime carries better on a phone speaker than a compressed
clip.

The catch worth knowing: **no browser will make a sound until the user has
touched the page**, and on iOS the audio context also starts suspended and
only resumes from inside a real gesture handler. So the first touch anywhere
arms it, and until that happens the chat header says **Enable sound** and an
amber bar explains that the phone will otherwise stay silent. Claiming
otherwise would mean someone misses a rescue message because the alert
quietly never fired.

Vibration is Android only — iOS Safari has never implemented
`navigator.vibrate` — so the sound is never made conditional on it.

### Mobile performance

The animated WebGL sky and the rain canvas are switched off on phones. This
was measured, not assumed: on an emulated Pixel 7 the two together pushed a
bare `1 + 1` evaluated inside the page from under a millisecond to **4.6
seconds**. A decorative background is not worth a four-second stall on the
device most likely to be holding this during a flood — taps go unanswered and
the message alert arrives late. Phones get a still gradient, and three.js is
never downloaded there at all.

The switch is in `VantaBackground.tsx`: reduced-motion request, small screen,
coarse pointer, or a weak-hardware hint.

### No accounts

There is no sign-in, no sign-up and no OTP, for residents or for officials.
Everything in the app is open on arrival. The login modal, both `/api/auth/*`
routes, the OTP store and the email dependency have been removed rather than
hidden, so there is no dormant auth surface left in the build.

## Chatting with a phone next to you, with no network

This is the part of the offline chat that actually carries a message between
two handsets. Bluetooth cannot, in a browser: Web Bluetooth only talks to BLE
GATT peripherals and a phone running a browser does not advertise itself as
one, and iPhone has no Web Bluetooth at all. WebRTC can, and it works on both
platforms.

What makes it work with the internet gone is that nothing else is involved.
No signalling server, no STUN, no TURN, no relay. Each phone gathers only its
own addresses on the local network, and the two descriptions travel between
the handsets **by hand** - as a short code the person copies, AirDrops, or
sends over Nearby Share, all of which work with no internet. After that,
packets go straight from one phone to the other over Wi-Fi.

### Pairing

Three steps, and it cannot be fewer - WebRTC needs each side to know the
other before it will connect, and with no server the person is the channel:

1. One phone taps **Create invite code** and sends the code across.
2. The other pastes it, taps **Make a reply code**, and sends that back.
3. The first pastes the reply and taps **Connect**.

The codes are ~195 characters. That is short because almost all of an SDP is
boilerplate that is identical on every device; `src/services/link/sdpCodec.ts`
keeps only the five things that genuinely differ - ICE user fragment and
password, the DTLS fingerprint, the DTLS role, and the host addresses - and
rebuilds the rest from a template. A full offer is ~790 characters; the code
is under 200.

A damaged code is rejected with a reason rather than attempted. A wrong
fingerprint in particular does not fail loudly at connect time - DTLS simply
never completes and the user watches a spinner - so it is caught when the
code is read.

### Once connected

Messages ride the existing protocol unchanged: the same chunking, the same
delivery receipts, the same ping/pong heartbeat used by the Bluetooth path.
`MessageTransport` was already built around a raw string sender and receiver,
so the link just plugs into that seam and none of it had to be written twice.

An arriving message rings the alert tone and buzzes the phone.

### A message can cross a phone that is not its recipient

The chat was point to point: a message could only reach someone you had
personally paired with. It now runs over a mesh built on BitChat's design,
in [`src/services/mesh/BitchatMesh.ts`](src/services/mesh/BitchatMesh.ts).

```
     A ── B ── C
```

A and C never pair and exchange no code. A's message reaches C because B
relays it. In a flood that is the difference between a message reaching the
one person who can help and not reaching them.

Four ideas, all of them BitChat's:

- **Flooding with a hop budget.** A packet goes to every link except the one
  it arrived on, and its TTL drops by one each time. No routing tables, no
  topology discovery, no coordinator.
- **Deduplication by message id.** Flooding a graph with a cycle would
  otherwise circulate forever; remembering what you have already seen is
  what makes the flood terminate.
- **Store and forward.** A message for someone unreachable is held and
  offered the moment they appear, so two people never in range at the same
  time can still exchange one.
- **Fragmentation.** Sized for a BLE characteristic write at the default
  23-byte MTU, counted in UTF-8 bytes rather than characters - Tamil is
  about three bytes a character, so splitting on length would produce
  fragments two to three times over the limit and cut characters in half.

**What a browser cannot do.** BitChat is a *Bluetooth* mesh: every phone is
both a BLE central and a BLE peripheral. **Web Bluetooth can only be a
central.** There is no API for a page to advertise as a peripheral, so two
browsers can never see each other over BLE, and a true BLE mesh is not
available to a PWA at any amount of effort. That is a platform limit, not a
missing feature.

So the mesh runs over the WebRTC local-network links the app already uses.
The protocol knows nothing about its transport, so the same code drives BLE
unchanged in the Capacitor Android build, where a phone can be a peripheral.

**How it is tested.** The protocol is checked against a fake wire in
[`bitchatMesh.test.ts`](src/__tests__/bitchatMesh.test.ts) - 18 tests over
real mesh instances with only the radio faked, covering a five-device line,
a ring that must not loop, two paths delivering exactly once, the TTL bound,
a late joiner collecting a stored message, and a Tamil string surviving
fragmentation.

The wiring is checked with three real browsers:

```bash
npm run test:mesh -- http://localhost:4330/
```

[`tools/mesh-relay-test.mjs`](tools/mesh-relay-test.mjs) opens three pages,
drives the pairing UI the way a person does, and asserts that C reads a
message A sent while B is the only thing between them. Building it found
two defects that the unit tests could not: the panel hid every pairing
control once one phone connected, so a device in the middle could never add
a second link; and `createInvite` began by calling `close()`, which was
harmless with one connection and hung up on the first link once there could
be two.

### The honest limits

- **Both phones must be on the same network.** Same Wi-Fi, or one of them
  sharing a hotspot. A router with no internet uplink is fine. Two phones with
  no Wi-Fi at all cannot do this.
- **On iPhone the hotspot needs a mobile plan**, so two iPhones with no
  network at all are stuck. An Android hotspot works and an iPhone can join it.
- **No QR scanning yet.** Generating a QR is easy; reading one is not - iOS
  Safari has no `BarcodeDetector`, so a scanner would work on Android and
  quietly fail on iPhone. Copy and the system share sheet work on both, so
  that is what shipped.

### How it is tested

`tools/nearby-chat-test.mjs` is the test that decides whether the feature
exists. It opens **two separate browser pages** - each with its own
RTCPeerConnection, its own storage and its own React tree - pairs them
through the real UI by moving the codes between them the way a person would,
sends a message from one, and checks it arrives on the other:

```
PASS  phone A produced an invite code - 194 chars
PASS  phone B produced a reply code - 193 chars
PASS  phone A reports connected     PASS  phone B reports connected
PASS  the message arrived on the other phone
PASS  the alert sound fired on the receiving phone - 2 tones
PASS  no STUN, TURN or signalling server was contacted
```

Nothing is stubbed; the WebRTC stack and the data channel are real.

Two notes for anyone running it. The test passes
`--disable-features=WebRtcHideLocalIpsWithMdns`, because Chrome hides local
IPs behind `.local` hostnames and two pages in one browser cannot resolve each
other's - two real phones resolve mDNS normally, so this is a test-harness
concern only. And the audio is armed with a real `touchscreen.tap`, not
`element.click()`: a scripted click is untrusted, creates no user activation
and fires no `pointerdown`, so the browser keeps audio locked. That is not a
test artefact - it is exactly why the app arms its sound on a real touch.

## Offline Bluetooth chat: what works and what does not

Two capabilities used to be described as one. They are separate, and only one
of them works in a browser.

### Finding nearby devices: works, and finds real ones

The device list is now the radio's answer. `WebBluetoothScanner` asks the
browser what it can do and then uses whichever of these it has, in order:

| Path | Prompts | What it gives |
| --- | --- | --- |
| Native BLE scan (Android app) | none after install | continuous discovery with RSSI |
| `requestLEScan()` | allow scanning, once | continuous advertisements with RSSI |
| `getDevices()` + `watchAdvertisements()` | none | devices allowed before, re-found automatically |
| `requestDevice()` | one tap to open the chooser | the one device the user picks |

The middle two need no interaction at all after the first grant, which is what
lets the list keep itself current. On desktop Chrome `requestLEScan` is behind
`chrome://flags/#enable-experimental-web-platform-features`; without it, add a
device once with **Add device** and it is found automatically from then on.

Nothing is listed that a radio did not report. Three named peers - "Disaster
Recon Unit 4", "Velachery Community Shelter", "Citizen Water-Rescue 09" -
used to be injected into the list on every scan, unlabelled and
indistinguishable from a neighbour who had the app open. They are gone. The
walkthrough peers that replaced them appear only when the walkthrough is
switched on, are named "Demo peer A (not a real device)", and are counted
separately from real ones.

A presence loop sweeps every 2 seconds and drops anything not heard from for
12 seconds, so walking out of range empties the list by itself. A device the
user granted access to stays listed but stops counting as in range, because a
permission is not evidence of presence.

Two behaviours are worth knowing if you touch this code:

- `requestLEScan()` does not reject when permission has never been given. It
  waits on a prompt, indefinitely. Every call is raced against a deadline.
- It may only ask for permission while a user gesture is still in progress,
  and awaiting anything first - even `getDevices()`, which asks the user
  nothing - ends that gesture. It is therefore called before the first
  `await` in the scan path, and only awaited afterwards.

### Phone-to-phone chat over Bluetooth: still needs the Android app

Web Bluetooth connects only to BLE GATT peripherals, and a phone running a
browser does not advertise itself as one. Two browsers can each see plenty of
devices and still not carry a message between them over Bluetooth.

For chatting there is now a route that does work in a browser on both
platforms - see "Chatting with a phone next to you" above, which goes over
the local Wi-Fi instead. Bluetooth messaging specifically would still need
the native app on both handsets, and three things are missing before that can
be built:

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

None of that was verified against a real handset here - there is no Android
SDK in this environment - so treat the list as the diagnosis it is, not as a
tested build recipe.

### How the discovery is tested

`tools/bluetooth-test.mjs` gives headless Chrome an emulated adapter through
the CDP `BluetoothEmulation` domain, puts three named peripherals in range,
and drives Chrome's own device chooser through `DeviceAccess`. It then checks,
over several rounds, that the app shows those devices and none of the invented
ones. `src/__tests__/deviceDiscovery.test.ts` covers the presence loop -
ageing out, keeping the connected peer, and the grant/sighting distinction -
by injecting time rather than waiting for it.

`BluetoothEmulation.simulateAdvertisement` never resolves in this Chrome
build, so advertisement delivery itself is exercised by the unit tests rather
than in the browser.

## Keeping the maps movable

Three views draw a map: the live weather field (Leaflet plus two canvases),
the district grid and its 3D extrusion (MapLibre), and the ward inundation
map (Leaflet). A flood map that answers in whole seconds when you drag it is
not a flood map, so movement is measured rather than assumed.

```bash
npm run test:maps -- http://localhost:4330/
```

[`tools/map-loop.mjs`](tools/map-loop.mjs) opens each view in each theme and
moves it the way a person does - a drag, a fling, two wheel zooms, and a
pitch into 3D where there is one - while recording the gap between every
animation frame. It then checks five things against a budget:

| | why this one |
|---|---|
| 95th-percentile frame | what sustained smoothness actually is. A mean hides a stall; a single worst frame is noise. 19 frames in 20 must land inside two 60Hz frames |
| longest frame | still checked, but at 150ms - the level where one frame is a freeze a person notices rather than a hitch they do not |
| dropped frames | gaps over 50ms, counted. One is a blink; twenty is a slideshow |
| settle | how long after the gesture before the map is quiet |
| blank tiles | tiles still unpainted once it has settled - the glitch that looks like holes in the world |
| console errors | anything thrown while moving |

The first version of this judged on the worst frame alone, and that was the
wrong measure. With a 17ms median in every view, runs still failed on one
83ms frame - a batch of tiles finishing their decode, in a different view
each round. Tightening the threshold until that stopped would have been
gaming it; loosening it until it passed would have been worse, since it
would then pass a map that stuttered constantly as long as it never froze.
The percentile is the honest gate, and a single outlier cannot move it.

When a run fails, the loop applies whichever of its named corrections
addresses the failure, rebuilds, and runs again. It stops on a clean pass,
or when a round produces the same failures as the one before it, because a
loop that cannot improve its own input is only burning rounds. Corrections
are a short, explicit list - a loop that "fixes things" by guessing moves
code around until the measurement stops complaining and leaves behind
something nobody can explain. Anything not on the list is reported for a
person to look at.

### What it found

The live weather field's wind streaks called Leaflet's
`latLngToContainerPoint` **twice per particle, per frame** - 3,600 library
calls a frame at the default count. Each one builds a `LatLng`, projects it
into a new `Point`, rounds it, subtracts the pixel origin and allocates a
second `Point` to add the pane offset. That is around three short-lived
objects and eight calls each, so roughly eleven thousand objects a frame for
the garbage collector, all of it spent arriving at a number.

Web Mercator is an affine transform of a closed-form function, so a frame's
entire projection is a scale and an origin. Those are now computed once per
frame and each particle is ten floating-point operations. The origin is
derived by asking Leaflet where one anchor point landed, so the fast path
stays in step with the slow one wherever the pane happens to be, including
mid zoom-animation, without this code knowing anything about panes or pixel
origins.

Measured on a real Leaflet map with an offset pane, 40 runs of 3,600
projections:

```
old, Leaflet per particle:  2.100 ms/frame
new, arithmetic per frame:  0.423 ms/frame     5.0x
worst disagreement:         0.499 px
```

2.1ms of a 16.7ms frame is 13% of the budget for a decoration. The 0.499px
is not error - it is exactly Leaflet's own `_round()`, which quantises layer
points to whole pixels. The arithmetic is the unrounded version of the same
transform, which for a drifting streak is if anything the smoother one.

**What this does not claim.** This harness runs on software WebGL, where
three animating canvases at once produce frame times in the seconds; those
numbers say more about the absence of a GPU than about the application. The
projection saving above is measured directly and holds anywhere. Whether a
given phone now drags smoothly is a question only that phone can answer.

Nothing in the running app would report that drift if it ever happened: the
streaks would just be drawn in the wrong place, which looks like wind. So
the agreement is a test -
[`particleProjection.test.ts`](src/__tests__/particleProjection.test.ts)
checks the arithmetic against Leaflet's own CRS at seven zoom levels and ten
coordinates, including the poles and the antimeridian, to within a hundredth
of a pixel.

### What the loop corrected, and what happened next

Run against production, the loop found the district grid's worst frame at
83ms against a 68ms budget and applied its own correction: pause the rain
canvas while a map is being dragged. A map drag and a rain canvas are
asking for the same frame, and only one of them is under the user's finger.

That patch was half a change - it added a handler for an event nothing
fired. What is in the source now is the whole one:
[`src/utils/mapMotion.ts`](src/utils/mapMotion.ts), a signal all three maps
raise and the background listens for. It is counted rather than boolean,
because two maps can be mounted at once and a flag would let whichever
stopped first speak for both, and it refuses to go below zero, because
Leaflet fires `zoomend` without a matching `zoomstart` when the zoom is set
programmatically and one unbalanced end would leave the background
permanently paused with no error anywhere. Both of those are
[tested](src/__tests__/mapMotion.test.ts): a blank sky with no console
output is not something a screenshot catches.

The loop's remaining correction is one number with a floor - thin the wind
field by a quarter per round, never below 400 particles, because a fast map
that no longer shows which way the storm is moving has not been fixed. The
correction it already made is recorded in the file rather than deleted; a
loop that quietly rewrites its own history is worse than one that never
ran.

### Map colour

The map owns two colours that are not the page's. `--color-map-canvas` is
what sits behind a tile that has not arrived yet, seen constantly on a slow
connection; as the page colour it flashed the interface's own surface
through the map, which reads as a hole in it. `--color-map-surround` is
everything outside Tamil Nadu - the app models one state, and the
neighbours it can say nothing about are pushed back rather than coloured in.
Both are desaturated slate, because cartographic surround is the one place
in the interface that should have no opinion.

The basemap now opens on the one that suits the theme rather than always on
the dark canvas, which used to put a black rectangle in the middle of the
light build. Dimming the basemap is only right over a dark one - applied to
a light basemap it turns the streets to mud - so the light theme desaturates
and lifts contrast instead.

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
| [Open-Meteo](https://open-meteo.com/) | Live rainfall, wind and temperature forecast | CC-BY 4.0, free for non-commercial use |
| [Mapzen / AWS terrain tiles](https://registry.opendata.aws/terrain-tiles/) | Elevation raster for the weather grid and state terrain | Public domain / ODbL depending on source tile |
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
