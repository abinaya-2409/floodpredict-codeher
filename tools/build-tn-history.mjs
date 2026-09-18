/**
 * Builds src/data/tnDisasterHistory.ts from the two Tamil Nadu disaster CSVs
 * in data/.
 *
 *   node tools/build-tn-history.mjs
 *
 * The output is committed, so this exists to make the derivation auditable
 * rather than to run at build time. Three things make that worth automating:
 *
 *  - Numeric columns are not numeric. "14 reported by 12 Nov; annual
 *    government hydro-meteorological series later reports 128 for FY 2021-22"
 *    sits in a deaths column. Picking one number silently would bury a real
 *    disagreement between sources, so each parse keeps the raw string and
 *    records whether it was ambiguous.
 *  - The two files disagree. Nivar is 6 deaths in the government-sourced file
 *    and 12 in the summary file; Fengal is 40 against 3. Where they conflict
 *    the government-sourced record wins and the other figure is retained as a
 *    documented variant, because dropping it would misrepresent how firm the
 *    number is.
 *  - District names span two administrative eras. Chengalpattu, Kallakurichi,
 *    Mayiladuthurai, Ranipet, Tenkasi and Tirupathur were all carved out
 *    after 2019, so they have no Census 2011 polygon. They are mapped to the
 *    parent district that does, and the substitution is recorded on the event.
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const OUT = 'src/data/tnDisasterHistory.ts';
const DISTRICTS = 'public/data/india-districts.json';

/* ------------------------------------------------------------------ CSV -- */

/** RFC4180-ish parser: handles quoted fields containing commas and quotes. */
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += c;
      continue;
    }
    if (c === '"') quoted = true;
    else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (c !== '\r') field += c;
  }
  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }

  const header = rows.shift().map((h) => h.trim());
  return rows
    .filter((r) => r.some((c) => c.trim().length))
    .map((r) => Object.fromEntries(header.map((h, i) => [h, (r[i] ?? '').trim()])));
}

/* ------------------------------------------------------------- numbers -- */

const NOT_A_NUMBER =
  /^(not\s|no\s|n\/a|na$|—|-$|unknown|multiple)/i;

/**
 * Pulls the first integer out of a messy cell.
 *
 * Returns the value *and* whether the cell held more than one candidate, so
 * a caller can surface "sources differ" rather than presenting one figure as
 * settled. Commas inside numbers are stripped first so "48,510" reads as one
 * number and not as 48.
 */
function parseCount(raw) {
  const s = (raw ?? '').trim();
  if (!s || NOT_A_NUMBER.test(s)) return { value: null, raw: s, ambiguous: false };

  const cleaned = s.replace(/(\d),(?=\d{3}\b)/g, '$1');
  const all = [...cleaned.matchAll(/\d+(?:\.\d+)?/g)].map((m) => Number(m[0]));
  if (!all.length) return { value: null, raw: s, ambiguous: false };

  // "0 reported event deaths" is a real zero, not a missing value.
  return {
    value: all[0],
    raw: s,
    // A bare number, or a number followed only by units, is unambiguous.
    ambiguous: all.length > 1 && !/^\d[\d,]*\s*(\+|reported|in\b)?$/i.test(s),
  };
}

/** mm of rainfall stated anywhere in a cell, including "cm" figures. */
function parseRainfallMm(...cells) {
  for (const cell of cells) {
    const s = (cell ?? '').replace(/(\d),(?=\d{3}\b)/g, '$1');
    const mm = s.match(/(\d+(?:\.\d+)?)\s*mm/i);
    if (mm) return Number(mm[1]);
    const cm = s.match(/(\d+(?:\.\d+)?)\s*cm/i);
    if (cm) return Number(cm[1]) * 10;
  }
  return null;
}

function parseWindKmh(...cells) {
  for (const cell of cells) {
    const s = cell ?? '';
    // "Winds 100-165 km/h" - take the upper bound, which is the peak.
    const range = s.match(/(\d+)\s*-\s*(\d+)\s*km\/h/i);
    if (range) return Number(range[2]);
    const one = s.match(/(\d+)\s*km\/h/i);
    if (one) return Number(one[1]);
  }
  return null;
}

/* ----------------------------------------------------------- districts -- */

/**
 * Census 2011 spellings are what the bundled polygons use. Everything else
 * here is either a spelling variant or a district created after 2011, which
 * has to fall back to its parent to have any geometry at all.
 */
const DISTRICT_ALIASES = {
  thiruvallur: 'Thiruvallur',
  tiruvallur: 'Thiruvallur',
  thiruvarur: 'Thiruvarur',
  tiruvarur: 'Thiruvarur',
  nagapattinam: 'Nagappattinam',
  nagappattinam: 'Nagappattinam',
  thoothukudi: 'Thoothukkudi',
  thoothukkudi: 'Thoothukkudi',
  tuticorin: 'Thoothukkudi',
  virudhunagar: 'Virudunagar',
  virudunagar: 'Virudunagar',
  kanchipuram: 'Kancheepuram',
  kancheepuram: 'Kancheepuram',
  kanyakumari: 'Kanniyakumari',
  kanniyakumari: 'Kanniyakumari',
  villupuram: 'Viluppuram',
  viluppuram: 'Viluppuram',
  pudukottai: 'Pudukkottai',
  pudukkottai: 'Pudukkottai',
  nilgiris: 'The Nilgiris',
  'the nilgiris': 'The Nilgiris',
  tirupur: 'Tiruppur',
  tiruppur: 'Tiruppur',
};

/** Districts created after the 2011 census, with the parent that has a polygon. */
const POST_2011_PARENTS = {
  chengalpattu: 'Kancheepuram',
  kallakurichi: 'Viluppuram',
  mayiladuthurai: 'Nagappattinam',
  ranipet: 'Vellore',
  tenkasi: 'Tirunelveli',
  tirupathur: 'Vellore',
  tirupattur: 'Vellore',
};

function buildDistrictIndex() {
  const geo = JSON.parse(readFileSync(DISTRICTS, 'utf8'));
  const index = new Map();
  for (const f of geo.features) {
    if (!/tamil nadu/i.test(f.properties.state)) continue;
    let sx = 0;
    let sy = 0;
    let n = 0;
    const walk = (c) => {
      if (Array.isArray(c) && typeof c[0] === 'number') {
        sx += c[0];
        sy += c[1];
        n++;
        return;
      }
      if (Array.isArray(c)) c.forEach(walk);
    };
    walk(f.geometry.coordinates);
    index.set(f.properties.district.toLowerCase(), {
      name: f.properties.district,
      center: [Number((sy / n).toFixed(4)), Number((sx / n).toFixed(4))],
    });
  }
  return index;
}

/**
 * Finds every Tamil Nadu district named anywhere in a prose cell.
 *
 * Matching against a canonical list rather than splitting on commas, because
 * the cells are sentences: "Northern/coastal Tamil Nadu including Chennai,
 * Chengalpattu, ... and delta areas" has no reliable delimiter.
 */
function extractDistricts(text, index) {
  const hay = ` ${(text ?? '').toLowerCase()} `;
  const found = new Map();

  const consider = (key, canonical, substituted) => {
    if (!hay.includes(` ${key}`) && !hay.includes(`(${key}`)) return;
    const entry = index.get(canonical.toLowerCase());
    if (!entry) return;
    if (!found.has(entry.name) || substituted === false) {
      found.set(entry.name, { ...entry, substitutedFor: substituted ? key : null });
    }
  };

  for (const [key, canonical] of Object.entries(DISTRICT_ALIASES)) {
    consider(key, canonical, false);
  }
  for (const [key, parent] of Object.entries(POST_2011_PARENTS)) {
    consider(key, parent, true);
  }
  for (const entry of index.values()) {
    consider(entry.name.toLowerCase(), entry.name, false);
  }

  return [...found.values()];
}

/* -------------------------------------------------------------- hazard -- */

const HYDRO = /cyclone|flood|rain|monsoon|drought|storm/i;

function classify(type, category) {
  const t = `${type} ${category}`;
  if (/drought/i.test(t)) return 'drought';
  if (/cyclone/i.test(t)) return 'cyclone';
  if (/flood|rain|monsoon/i.test(t)) return 'flood';
  if (/firecracker|fireworks/i.test(t)) return 'fireworks';
  if (/boiler|industrial|chemical/i.test(t)) return 'industrial';
  if (/rail|transport/i.test(t)) return 'transport';
  if (/collapse/i.test(t)) return 'structural';
  return 'other';
}

/* ---------------------------------------------------------------- main -- */

const index = buildDistrictIndex();
const detailed = parseCsv(readFileSync('data/tamil_nadu_disasters_2019_2024.csv', 'utf8'));
const summary = parseCsv(readFileSync('data/tn_disasters_dataset.csv', 'utf8'));

const events = [];

for (const r of detailed) {
  const deaths = parseCount(r.deaths);
  const hazard = classify(r.disaster_type, r.disaster_category);
  const districts = extractDistricts(
    `${r.location_district} ${r.location_taluk}`,
    index
  );
  const damageInr = Number(r.economic_damage_inr) || null;

  events.push({
    id: r.event_id,
    name: r.event_name,
    year: Number(r.year),
    date: r.occurrence_date,
    hazard,
    isHydro: HYDRO.test(`${r.disaster_type} ${r.disaster_category}`),
    districts: districts.map((d) => d.name),
    substitutedDistricts: districts.filter((d) => d.substitutedFor).map((d) => d.name),
    centers: districts.map((d) => d.center),
    deaths: deaths.value,
    deathsRaw: deaths.ambiguous ? deaths.raw : null,
    injuries: parseCount(r.injuries).value,
    evacuated: parseCount(r.evacuated_displaced).value,
    damageCrore: damageInr ? Number((damageInr / 1e7).toFixed(2)) : null,
    damageBasis: r.economic_damage_basis || null,
    rainfallMm: parseRainfallMm(r.severity_intensity),
    windKmh: parseWindKmh(r.severity_intensity),
    infrastructure: r.infrastructure_affected || null,
    sourceType: r.source_type,
    source: r.source_information,
    sourceUrl: r.source_url,
    limitations: r.limitations || null,
    variants: [],
  });
}

/* Second file: merge where it names the same event, append where it does not. */
let merged = 0;
let added = 0;

for (const r of summary) {
  const name = (r.Event || '').trim();
  const year = Number(r.Year);
  if (!name || !Number.isFinite(year)) continue;
  // The file carries a TOTAL row and a 2015 row explicitly marked as outside
  // the window and for reference only. Neither is an event.
  if (/^total/i.test(r.Year) || /outside the 10-year window/i.test(r.Notes ?? '')) {
    continue;
  }

  const key = name.replace(/^cyclone\s+/i, '').toLowerCase();
  const match = events.find(
    (e) => e.year === year && e.name.toLowerCase().includes(key)
  );

  const deaths = parseCount(r['Deaths (TN)']);
  const rainfallMm = parseRainfallMm(r['Peak Wind / Rainfall']);
  const windKmh = parseWindKmh(r['Peak Wind / Rainfall']);

  if (match) {
    merged++;
    // The detailed file is government-sourced; this one is a summary. Keep
    // its figure only where the other has none, and otherwise record the
    // disagreement instead of overwriting or discarding it.
    if (deaths.value !== null && deaths.value !== match.deaths) {
      match.variants.push(`${deaths.value} deaths reported in the summary dataset`);
    }
    if (match.rainfallMm === null && rainfallMm !== null) match.rainfallMm = rainfallMm;
    if (match.windKmh === null && windKmh !== null) match.windKmh = windKmh;
    if (match.evacuated === null) match.evacuated = parseCount(r['Displaced / Evacuated']).value;
    match.notes = r.Notes || match.notes;
    continue;
  }

  added++;
  const districts = extractDistricts(r['Districts Affected'], index);
  events.push({
    id: `TNS-${year}-${key.replace(/\W+/g, '')}`,
    name,
    year,
    date: `${year} ${r['Month(s)'] ?? ''}`.trim(),
    hazard: classify(r.Type, ''),
    isHydro: HYDRO.test(r.Type ?? ''),
    districts: districts.map((d) => d.name),
    substitutedDistricts: districts.filter((d) => d.substitutedFor).map((d) => d.name),
    centers: districts.map((d) => d.center),
    deaths: deaths.value,
    deathsRaw: deaths.ambiguous ? deaths.raw : null,
    injuries: null,
    evacuated: parseCount(r['Displaced / Evacuated']).value,
    damageCrore: parseCount(r['Est. Economic Loss (INR Cr)']).value,
    damageBasis: null,
    rainfallMm,
    windKmh,
    infrastructure: parseCount(r['Houses Damaged']).value
      ? `${parseCount(r['Houses Damaged']).value} houses damaged`
      : null,
    sourceType: 'Summary dataset',
    source: 'tn_disasters_dataset.csv',
    sourceUrl: null,
    limitations:
      'From the summary dataset, which carries no per-event source URL. Treat as indicative.',
    notes: r.Notes || null,
    variants: [],
  });
}

events.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

/* ------------------------------------------------------------- reports -- */

const hydro = events.filter((e) => e.isHydro);
/** Flood and cyclone only - the subset that says anything about flood risk. */
const floodish = events.filter((e) => e.hazard === 'flood' || e.hazard === 'cyclone');
const withRain = hydro.filter((e) => e.rainfallMm !== null);
const noDistrict = events.filter((e) => !e.districts.length);

const banner = `/**
 * Tamil Nadu disaster record, ${Math.min(...events.map((e) => e.year))}-${Math.max(
  ...events.map((e) => e.year)
)}.
 *
 * GENERATED by tools/build-tn-history.mjs from the CSVs in data/. Do not edit
 * by hand; edit the sources and re-run.
 *
 * ${events.length} events, of which ${hydro.length} are hydro-meteorological and
 * therefore the only ones this application's flood model has any business
 * reading. The rest - fireworks factory explosions, boiler blasts, a rail
 * collision - are kept because they are part of the district's incident
 * record and shape response capacity, but they are tagged isHydro: false and
 * never reach the flood engine.
 *
 * This is a record of what happened, not a training set. ${hydro.length} events
 * cannot calibrate a hydrological model, and only ${withRain.length} carry a
 * documented rainfall figure at all. It is used for historical precedent and
 * for validating that the model's predictions are not absurd - nothing more.
 */`;

const ts = `${banner}

export interface TnDisasterEvent {
  id: string;
  name: string;
  year: number;
  /** As written in the source: may be a range, or a month rather than a day. */
  date: string;
  hazard:
    | 'cyclone'
    | 'flood'
    | 'drought'
    | 'fireworks'
    | 'industrial'
    | 'transport'
    | 'structural'
    | 'other';
  /** True for cyclone, flood, rain and drought events only. */
  isHydro: boolean;
  /** Census 2011 district names, matching the bundled polygons. */
  districts: string[];
  /**
   * Districts that were named in the source but created after 2011, so the
   * entry above is the parent district standing in for them.
   */
  substitutedDistricts: string[];
  centers: [number, number][];
  deaths: number | null;
  /** Set only where the source cell held more than one figure. */
  deathsRaw: string | null;
  injuries: number | null;
  evacuated: number | null;
  damageCrore: number | null;
  damageBasis: string | null;
  /** Documented rainfall for the event, mm. Null where none was published. */
  rainfallMm: number | null;
  windKmh: number | null;
  infrastructure: string | null;
  sourceType: string;
  source: string;
  sourceUrl: string | null;
  limitations: string | null;
  notes?: string | null;
  /** Figures from the other source file that disagree with the one above. */
  variants: string[];
}

export const TN_DISASTERS: TnDisasterEvent[] = ${JSON.stringify(events, null, 2)};

/** Cyclone, flood, rain and drought events only. */
export const TN_HYDRO_EVENTS: TnDisasterEvent[] = TN_DISASTERS.filter((e) => e.isHydro);

/**
 * How many recorded flood or cyclone events named each district.
 *
 * Drought is excluded deliberately. The 2019 declaration covered 18 districts
 * at once, most of them inland, and counting it would rank Dharmapuri and
 * Krishnagiri alongside Chennai and Cuddalore for *flood* exposure - which is
 * the opposite of what the record shows.
 */
export const TN_DISTRICT_FLOOD_COUNTS: Record<string, number> = ${JSON.stringify(
  Object.fromEntries(
    [...new Set(floodish.flatMap((e) => e.districts))]
      .map((d) => [d, floodish.filter((e) => e.districts.includes(d)).length])
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
  ),
  null,
  2
)};

/**
 * Centroid of every Tamil Nadu district polygon, for nearest-district lookup.
 *
 * Vertex-average centroids, and matching a point to the nearest one is a
 * Voronoi approximation rather than a point-in-polygon test - which is why
 * the UI says "nearest district" and not "this district".
 */
export const TN_DISTRICT_CENTROIDS: Record<string, [number, number]> = ${JSON.stringify(
  Object.fromEntries([...index.values()].map((d) => [d.name, d.center])),
  null,
  2
)};

/** The highest count above, so a caller can normalise without recomputing. */
export const TN_MAX_FLOOD_COUNT = ${Math.max(
  ...[...new Set(floodish.flatMap((e) => e.districts))].map(
    (d) => floodish.filter((e) => e.districts.includes(d)).length
  )
)};
`;

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, ts);

console.log(`events          : ${events.length} (${merged} merged, ${added} added from summary)`);
console.log(`hydro-met       : ${hydro.length}`);
console.log(`with rainfall   : ${withRain.length} of ${hydro.length} hydro events`);
console.log(`flood/cyclone   : ${floodish.length}`);
console.log(`no district match: ${noDistrict.length}${noDistrict.length ? ' -> ' + noDistrict.map((e) => e.id).join(', ') : ''}`);
console.log(`ambiguous deaths: ${events.filter((e) => e.deathsRaw).map((e) => e.id).join(', ') || 'none'}`);
console.log(`source conflicts: ${events.filter((e) => e.variants.length).map((e) => `${e.name} (${e.variants.join('; ')})`).join(' | ') || 'none'}`);
console.log(`output          : ${OUT}`);
