/**
 * Sanity-checks the flood model against the Tamil Nadu disaster record.
 *
 *   npx tsx tools/validate-model.ts
 *
 * This is NOT a validation of predicted depth. The record contains no
 * observed water depths at all, and only one of its eleven flood and cyclone
 * events carries a published rainfall figure, so there is nothing to regress
 * against. What can be asked is weaker but still falsifiable:
 *
 *   under one identical storm, does the model rank the districts that have
 *   repeatedly flooded above the districts that have not?
 *
 * A positive rank correlation is weak evidence the model is not absurd. A
 * negative one would mean the terrain read is actively misleading, which is
 * worth knowing. Three reasons the ceiling on this is low, all of which would
 * depress a genuinely good model:
 *
 *  - The record counts how often a district was *named in a report*, not how
 *    often it flooded. Chennai is over-represented for reasons of salience.
 *  - A district centroid is one point, and often not the flooded one: a
 *    district can flood badly along its coast while its centroid sits inland
 *    on higher ground.
 *  - Eleven events over ten years is a tiny sample, and six districts were
 *    created after 2011 so their events are attributed to a parent.
 */

import { forecastPoint } from '../src/utils/pointForecast.js';
import {
  TN_DISTRICT_CENTROIDS,
  TN_DISTRICT_FLOOD_COUNTS,
} from '../src/data/tnDisasterHistory.js';

/** A severe but not unprecedented north-east monsoon burst. */
const STORM_MM_HR = 80;
const STORM_HOURS = 6;

interface Row {
  district: string;
  peakDepthCm: number;
  thresholdMmHr: number;
  elevationM: number;
  sinkDepthM: number;
  recorded: number;
}

const rows: Row[] = [];
const districts = Object.entries(TN_DISTRICT_CENTROIDS);

for (const [district, [lat, lon]] of districts) {
  try {
    const f = await forecastPoint(lat, lon, {
      label: district,
      mode: 'scenario',
      scenarioMmHr: STORM_MM_HR,
      scenarioHours: STORM_HOURS,
    });
    rows.push({
      district,
      peakDepthCm: f.peakDepthCm,
      thresholdMmHr: f.drainageThresholdMmHr,
      elevationM: f.elevationM,
      sinkDepthM: f.sinkDepthM,
      recorded: TN_DISTRICT_FLOOD_COUNTS[district] ?? 0,
    });
  } catch (err) {
    console.error(`  ${district}: ${(err as Error).message}`);
  }
  // Open-Meteo is free and keyless; do not burst it.
  await new Promise((r) => setTimeout(r, 400));
}

/** Average ranks, so ties (many districts share a count) do not skew rho. */
function rank(values: number[]): number[] {
  const order = values
    .map((v, i) => ({ v, i }))
    .sort((a, b) => b.v - a.v);
  const out = new Array(values.length).fill(0);
  let i = 0;
  while (i < order.length) {
    let j = i;
    while (j + 1 < order.length && order[j + 1].v === order[i].v) j++;
    const avg = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) out[order[k].i] = avg;
    i = j + 1;
  }
  return out;
}

function spearman(a: number[], b: number[]): number {
  const ra = rank(a);
  const rb = rank(b);
  const n = a.length;
  const mean = (x: number[]) => x.reduce((s, v) => s + v, 0) / n;
  const ma = mean(ra);
  const mb = mean(rb);
  let num = 0;
  let da = 0;
  let db = 0;
  for (let i = 0; i < n; i++) {
    num += (ra[i] - ma) * (rb[i] - mb);
    da += (ra[i] - ma) ** 2;
    db += (rb[i] - mb) ** 2;
  }
  return num / Math.sqrt(da * db);
}

rows.sort((x, y) => y.peakDepthCm - x.peakDepthCm);

console.log(
  `\nModel run: ${STORM_MM_HR}mm/hr for ${STORM_HOURS}h at each district centroid\n`
);
console.log(
  'district'.padEnd(18) +
    'depth'.padStart(7) +
    'floods@'.padStart(9) +
    'elev'.padStart(8) +
    'sink'.padStart(8) +
    '  recorded events'
);
for (const r of rows) {
  console.log(
    r.district.padEnd(18) +
      `${r.peakDepthCm}cm`.padStart(7) +
      `${r.thresholdMmHr}mm`.padStart(9) +
      `${r.elevationM}m`.padStart(8) +
      `${r.sinkDepthM}m`.padStart(8) +
      '  ' +
      '#'.repeat(r.recorded) +
      (r.recorded ? ` (${r.recorded})` : ' 0')
  );
}

const rho = spearman(
  rows.map((r) => r.peakDepthCm),
  rows.map((r) => r.recorded)
);

const withEvents = rows.filter((r) => r.recorded > 0);
const without = rows.filter((r) => r.recorded === 0);
const mean = (xs: number[]) => (xs.length ? xs.reduce((s, v) => s + v, 0) / xs.length : 0);

console.log(`\ndistricts scored          : ${rows.length}`);
console.log(`with a recorded event     : ${withEvents.length}`);
console.log(
  `mean predicted depth      : ${mean(withEvents.map((r) => r.peakDepthCm)).toFixed(
    1
  )}cm where events are recorded, ${mean(without.map((r) => r.peakDepthCm)).toFixed(
    1
  )}cm where none are`
);
console.log(`Spearman rho (depth vs recorded events): ${rho.toFixed(3)}`);
console.log(
  rho > 0.3
    ? 'VERDICT: ranking agrees with the record more often than not.'
    : rho > 0
      ? 'VERDICT: weakly positive. Consistent with the record, but barely.'
      : 'VERDICT: NEGATIVE - the model ranks historically flooded districts LOW. Investigate.'
);
console.log(
  '\nThis compares a ranking against a reporting record, at one point per\n' +
    'district, for eleven events. It can catch a model that is badly wrong.\n' +
    'It cannot show that one is right, and it is not a depth validation.'
);
