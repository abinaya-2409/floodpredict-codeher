/**
 * Builds public/data/india-districts.json from the datameet Census 2011
 * district shapefile.
 *
 * Run once; the output is committed. Kept in the repo so the provenance of a
 * 1MB binary blob in public/ is reproducible rather than mysterious.
 *
 *   node tools/build-districts.mjs <path-to-shapefile-without-extension>
 *
 * Source: https://github.com/datameet/maps (MIT). The raw geometry is ~10MB
 * of shapefile; Douglas-Peucker simplification at a tolerance that preserves
 * district shape at national zoom brings it to something shippable.
 */

import * as shapefile from 'shapefile';
import simplify from '@turf/simplify';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const SRC = process.argv[2];
const OUT = process.argv[3] ?? 'public/data/india-districts.json';
// Degrees. At national zoom a district is a few hundred pixels across, so
// detail below roughly this is invisible; going finer only costs bytes.
const TOLERANCE = Number(process.argv[4] ?? 0.008);

if (!SRC) {
  console.error('usage: node tools/build-districts.mjs <shapefile-base> [out] [tolerance]');
  process.exit(1);
}

const countVerts = (c) =>
  Array.isArray(c) && c.length && Array.isArray(c[0]) ? c.reduce((s, x) => s + countVerts(x), 0) : 1;

const round = (c, dp = 4) => {
  if (typeof c[0] === 'number') return [Number(c[0].toFixed(dp)), Number(c[1].toFixed(dp))];
  return c.map((x) => round(x, dp));
};

const source = await shapefile.open(`${SRC}.shp`, `${SRC}.dbf`, { encoding: 'UTF-8' });
const features = [];
let rawVerts = 0;
let dropped = 0;

for (;;) {
  const { done, value } = await source.read();
  if (done) break;
  if (!value?.geometry) continue;

  rawVerts += countVerts(value.geometry.coordinates);

  let f;
  try {
    f = simplify(value, { tolerance: TOLERANCE, highQuality: false, mutate: true });
  } catch {
    // A district that cannot be simplified is kept at full detail rather
    // than dropped: a missing district is worse than a heavy one.
    f = value;
  }

  // Simplification can collapse a tiny island to fewer than 4 points, which
  // is not a valid ring.
  const valid =
    f.geometry &&
    (f.geometry.type === 'Polygon'
      ? f.geometry.coordinates.every((r) => r.length >= 4)
      : f.geometry.coordinates.every((p) => p.every((r) => r.length >= 4)));
  if (!valid) {
    dropped += 1;
    continue;
  }

  f.geometry.coordinates = round(f.geometry.coordinates);

  const p = value.properties ?? {};
  // datameet's Census 2011 fields, normalised to something readable.
  features.push({
    type: 'Feature',
    properties: {
      id: String(p.censuscode ?? p.DISTRICT ?? features.length),
      district: String(p.DISTRICT ?? p.dtname ?? 'Unknown').trim(),
      state: String(p.ST_NM ?? p.stname ?? 'Unknown').trim(),
    },
    geometry: f.geometry,
  });
}

const out = { type: 'FeatureCollection', features };
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(out));

const simpVerts = features.reduce((s, f) => s + countVerts(f.geometry.coordinates), 0);
const bytes = JSON.stringify(out).length;
const states = new Set(features.map((f) => f.properties.state));

console.log(`districts      : ${features.length}${dropped ? ` (${dropped} dropped as degenerate)` : ''}`);
console.log(`states / UTs   : ${states.size}`);
console.log(`vertices       : ${rawVerts.toLocaleString()} -> ${simpVerts.toLocaleString()}`);
console.log(`output         : ${OUT}  ${(bytes / 1024 / 1024).toFixed(2)} MB`);
console.log(`sample         : ${features[0]?.properties.district}, ${features[0]?.properties.state}`);
